import {
	ArgumentKind,
	NumericArgument,
	LocalArgument,
	StringArgument,
	MemberArgument,
	ArgumentCountArgument,
	JumpTargetArgument
} from './instruction';

export const OpcodeFlags = Object.freeze({
	NONE: 0,
	/**
	 * The opcode is a branching instruction.
	 */
	BRANCH: 1,
	/**
	 * The opcode is a conditional branching instruction.
	 *
	 * This flag implies BRANCH.
	 */
	CONDITIONAL_BRANCH: 2 | 1,
	/**
	 * The opcode is an unconditional branching instruction.
	 *
	 * This flag implies BRANCH.
	 */
	UNCONDITIONAL_BRANCH: 4 | 1,
	/**
	 * The opcode is a switch instruction; that is, a jump table.
	 *
	 * This flag implies BRANCH (but not UNCONDITIONAL_BRANCH).
	 */
	SWITCH: 8 | 1,
	/**
	 * The opcode terminates the current branch (by returning, throwing or otherwise).
	 *
	 * Note that branching instructions do NOT have this flag, as they don't actually
	 * terminate the current branch. Note also that `endfinally` does have this flag,
	 * since finally blocks are effectively executed on their own branches, and that
	 * instruction is the only way to terminate a finally block.
	 */
	BRANCH_TERMINUS: 16,
	/**
	 * The opcode is the 'dup' instruction. This flag exists only so that duplicated
	 * stack values can be shown in a more aesthetically pleasing way.
	 */
	DUP: 32,
});

/**
 * The opcode empties the stack completely. The 'removed' member indicates the
 * minimum required stack height.
 */
export const EMPTIES_STACK = 0x01;
/**
 * Specifies that the instruction pushes references onto the stack.
 */
export const PUSHES_REF = 0x02;

/**
 * Represents a descriptor of a single opcode. An Opcode does not in itself contain
 * any specific data from any specific method; rather, it describes how to parse
 * instructions with the corresponding opcode.
 *
 * Each opcode has a name, any number of arguments, a stack change, and a description.
 * Use `getArguments` to parse the arguments for an instruction out of a specific
 * method body, and `getStackChange` to get a stack change given the arguments for
 * any given instruction.
 */
export class Opcode {
	constructor(name, flags, args, stackChange, description) {
		this.name = name;
		this.flags = flags;
		this.setArguments(args);
		this.setStackChange(stackChange);
		this.description = description;
	}

	get isBranch() {
		return (this.flags & OpcodeFlags.BRANCH) === OpcodeFlags.BRANCH;
	}

	get isConditionalBranch() {
		return (this.flags & OpcodeFlags.CONDITIONAL_BRANCH) === OpcodeFlags.CONDITIONAL_BRANCH;
	}

	get isUnconditionalBranch() {
		return (this.flags & OpcodeFlags.UNCONDITIONAL_BRANCH) === OpcodeFlags.UNCONDITIONAL_BRANCH;
	}

	get isSwitch() {
		return (this.flags & OpcodeFlags.SWITCH) === OpcodeFlags.SWITCH;
	}

	get isBranchTerminus() {
		return (this.flags & OpcodeFlags.BRANCH_TERMINUS) === OpcodeFlags.BRANCH_TERMINUS;
	}

	get isDup() {
		return (this.flags & OpcodeFlags.DUP) === OpcodeFlags.DUP;
	}

	getArguments(reader) {
		return this.args.map(arg => arg.read(reader));
	}

	getStackChange(args) {
		return this.stackChange;
	}

	setArguments(args) {
		this.args = args;

		// If we got a custom argument parsing function, override getArguments
		// to call it instead of trying to parse values from an argument array.
		if (typeof args === 'function') {
			this.getArguments = reader => this.args(reader);
		}
	}

	setStackChange(stackChange) {
		this.stackChange = stackChange;

		// If we got a custom stack change parsing function, override getStackChange
		// to call it instead of just returning this.stackChange.
		if (typeof stackChange === 'function') {
			this.getStackChange = args => this.stackChange(args);
		}
	}
}

/**
 * Represents an evaluation stack change. In addition to recording the number of
 * values that are removed and added, the stack change can specify that the entire
 * stack is to be emptied (if `emptiesStack` is true), and that the corresponding
 * opcode pushes one or more references onto the stack (if `pushesRef` is true).
 */
export class StackChange {
	constructor(removed, added, flags) {
		flags = flags | 0;

		this.removed = removed;
		this.added = added;
		this.emptiesStack = (flags & EMPTIES_STACK) === EMPTIES_STACK;
		this.pushesRef = (flags & PUSHES_REF) === PUSHES_REF;
	}
}

const DATA_READERS = Object.freeze({
	// Signed
	'sb': reader => reader.readInt8(),
	'i2': reader => reader.readInt16(),
	'i4': reader => reader.readInt32(),
	'i8': reader => reader.readBytes(8),
	// Unsigned
	'ub': reader => reader.readUint8(),
	'u2': reader => reader.readUint16(),
	'u4': reader => reader.readUint32(),
	'u8': reader => reader.readBytes(8),
	// Floating-point
	'r8': reader => reader.readFloat64(),
	// Tokens (alias for u4, really)
	'tk': reader => reader.readUint32(),
});

const VALUE_CREATORS = Object.freeze({
	'int':  (value, reader) => new NumericArgument(value, true),
	'uint': (value, reader) => new NumericArgument(value, false),
	'real': (value, reader) => new NumericArgument(value, true),
	'arg':  (index, reader) => new LocalArgument(index, true),
	'loc':  (index, reader) => new LocalArgument(index, false),
	'str':  (token, reader) => {
		const stringValue = reader.module.strings.get(token, true);
		return new StringArgument(token, stringValue);
	},
	'type': (token, reader) => {
		const type = reader.module.resolveToken(token, true);
		return new MemberArgument(token, type);
	},
	'func': (token, reader) => {
		const func = reader.module.resolveToken(token, true);
		return new MemberArgument(token, func);
	},
	'fld':  (token, reader) => {
		const field = reader.module.resolveToken(token, true);
		return new MemberArgument(token, field);
	},
	'argc': (value, reader) => new ArgumentCountArgument(value),
	'trg':  (offset, reader) => new JumpTargetArgument(offset),
});

/**
 * Describes an opcode argument. Each opcode argument has a specific, known size,
 * which ranges between 1 and 8 bytes, and may have a subtype that describes the
 * semantic meaning of the raw value.
 *
 * Subtypes include method argument/parameter, local variable, field token, type
 * token, string token, argument count, jump target, and others.
 *
 * The `read` method is used to read a specific argument value out of a method
 * body; this class merely describes how to read an argument of an opcode.
 */
export class OpcodeArgument {
	constructor(dataReader, valueCreator) {
		this.dataReader = dataReader;
		this.valueCreator = valueCreator;
	}

	read(reader) {
		const data = this.dataReader(reader);
		return this.valueCreator(data, reader);
	}

	static parse(descriptor) {
		var data, subtype;
		[data, subtype] = String(descriptor).split('/');

		const dataReader = DATA_READERS[data];
		if (!dataReader) {
			throw new Error(`Invalid argument data type: ${data}`);
		}

		const valueCreator = VALUE_CREATORS[subtype || OpcodeArgument.getDefaultSubtype(data)];
		if (!valueCreator) {
			throw new Error(`Invalid argument subtype: ${subtype}`);
		}

		return new OpcodeArgument(
			dataReader,
			valueCreator
		);
	}

	static getDefaultSubtype(dataType) {
		switch (dataType) {
			case 'sb':
			case 'i2':
			case 'i4':
			case 'i8':
				return 'int';
			// Unsigned
			case 'ub':
			case 'u2':
			case 'u4':
			case 'u8':
				return 'uint';
			case 'r8':
				return 'real';
			default:
				throw new Error(`No default subtype for argument data type '${dataType}'`);
		}
	}
}

// For extra short flags
const COBR = OpcodeFlags.CONDITIONAL_BRANCH;
const UNBR = OpcodeFlags.UNCONDITIONAL_BRANCH;
const TERM = OpcodeFlags.BRANCH_TERMINUS;
const DUP = OpcodeFlags.DUP;

// Semantically useful constant for opcodes with no arguments.
const NO_ARGS = Object.freeze([]);

const U2_ARG = OpcodeArgument.parse('u2');
const SB_TRG_ARG = OpcodeArgument.parse('sb/trg');
const I4_TRG_ARG = OpcodeArgument.parse('i4/trg');

/**
 * Helper function for creating an opcode argument definition list.
 */
function args() {
	const count = arguments.length;
	const args = new Array(count);
	for (var i = 0; i < count; i++) {
		args[i] = OpcodeArgument.parse(arguments[i]);
	}
	return args;
}

/**
 * Helper function for creating a stack change. Can be invoked with one or
 * two values, as shown:
 *   stack(-3)   => new StackChange(3, 0)
 *   stack(+2)   => new StackChange(0, 2)
 *   stack(1, 2) => new StackChange(1, 2)
 * When invoked with two arguments, the absolute value of each argument
 * is used, so that you can write this for clarity:
 *   stack(-4, +1) => new StackChange(4, 1)
 */
function stack(change1, change2) {
	if (arguments.length === 1) {
		const removed = change1 < 0 ? -change1 : 0;
		const added = change1 > 0 ? change1 : 0;
		return new StackChange(removed, added);
	}

	return new StackChange(Math.abs(change1), Math.abs(change2));
}

// This code slightly breaks the general standard for brevity. Don't do this elsewhere...
export const ALL_OPCODES = Object.freeze({
	0x00: new Opcode('nop', 0,   NO_ARGS, stack(0), 'Does nothing'),
	0x01: new Opcode('dup', DUP, NO_ARGS, stack(-1, +2), 'Duplicates the top stack value.'),
	0x02: new Opcode('pop', 0,   NO_ARGS, stack(-1), 'Removes the top stack value.'),

	0x03: new Opcode('ldarg.0', 0, _ => [new LocalArgument(0, true)], stack(+1), 'Loads argument 0. In an instance method, argument 0 is the current instance.'),
	0x04: new Opcode('ldarg.1', 0, _ => [new LocalArgument(1, true)], stack(+1), 'Loads argument 1.'),
	0x05: new Opcode('ldarg.2', 0, _ => [new LocalArgument(2, true)], stack(+1), 'Loads argument 2.'),
	0x06: new Opcode('ldarg.3', 0, _ => [new LocalArgument(3, true)], stack(+1), 'Loads argument 3.'),

	0x07: new Opcode('ldarg.s', 0, args('ub/arg'), stack(+1), 'Loads the specified argument. (short form)'),
	0x08: new Opcode('ldarg',   0, args('u2/arg'), stack(+1), 'Loads the specified argument.'),
	0x09: new Opcode('starg.s', 0, args('ub/arg'), stack(-1), 'Stores the top stack value into the specified argument. (short form)'),
	0x0a: new Opcode('starg',   0, args('u2/arg'), stack(-1), 'Stores the top stack value into the specified argument.'),

	0x0b: new Opcode('ldloc.0', 0, _ => [new LocalArgument(0, false)], stack(+1), 'Loads local variable 0.'),
	0x0c: new Opcode('ldloc.1', 0, _ => [new LocalArgument(1, false)], stack(+1), 'Loads local variable 1.'),
	0x0d: new Opcode('ldloc.2', 0, _ => [new LocalArgument(2, false)], stack(+1), 'Loads local variable 2.'),
	0x0e: new Opcode('ldloc.3', 0, _ => [new LocalArgument(3, false)], stack(+1), 'Loads local variable 3.'),

	0x0f: new Opcode('stloc.0', 0, _ => [new LocalArgument(0, false)], stack(-1), 'Stores the top stack value into local variable 0.'),
	0x10: new Opcode('stloc.1', 0, _ => [new LocalArgument(1, false)], stack(-1), 'Stores the top stack value into local variable 1.'),
	0x11: new Opcode('stloc.2', 0, _ => [new LocalArgument(2, false)], stack(-1), 'Stores the top stack value into local variable 2.'),
	0x12: new Opcode('stloc.3', 0, _ => [new LocalArgument(3, false)], stack(-1), 'Stores the top stack value into local variable 3.'),

	0x13: new Opcode('ldloc.s', 0, args('ub/loc'), stack(+1), 'Loads the specified local variable. (short form)'),
	0x14: new Opcode('ldloc',   0, args('u2/loc'), stack(+1), 'Loads the specified local variable.'),
	0x15: new Opcode('stloc.s', 0, args('ub/loc'), stack(-1), 'Stores the top stack value into the specified local variable. (short form)'),
	0x16: new Opcode('stloc',   0, args('u2/loc'), stack(-1), 'Stores the top stack value into the specified local variable.'),

	0x17: new Opcode('ldnull',   0, NO_ARGS,        stack(+1), 'Loads the null value.'),
	0x18: new Opcode('ldfalse',  0, NO_ARGS,        stack(+1), 'Loads the constant value false.'),
	0x19: new Opcode('ldtrue',   0, NO_ARGS,        stack(+1), 'Loads the constant value true.'),
	0x1a: new Opcode('ldc.i.m1', 0, NO_ARGS,        stack(+1), 'Loads the Int constant \u22121.'),
	0x1b: new Opcode('ldc.i.0',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 0.'),
	0x1c: new Opcode('ldc.i.1',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 1.'),
	0x1d: new Opcode('ldc.i.2',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 2.'),
	0x1e: new Opcode('ldc.i.3',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 3.'),
	0x1f: new Opcode('ldc.i.4',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 4.'),
	0x20: new Opcode('ldc.i.5',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 5.'),
	0x21: new Opcode('ldc.i.6',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 6.'),
	0x22: new Opcode('ldc.i.7',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 7.'),
	0x23: new Opcode('ldc.i.8',  0, NO_ARGS,        stack(+1), 'Loads the Int constant 8.'),
	0x24: new Opcode('ldc.i.s',  0, args('sb'),     stack(+1), 'Loads the specified Int constant. (short form)'),
	0x25: new Opcode('ldc.i.m',  0, args('i4'),     stack(+1), 'Loads the specified Int constant. (medium form)'),
	0x26: new Opcode('ldc.i',    0, args('i8'),     stack(+1), 'Loads the specified Int constant.'),
	0x27: new Opcode('ldc.u',    0, args('u8'),     stack(+1), 'Loads the specified UInt constant.'),
	0x28: new Opcode('ldc.r',    0, args('r8'),     stack(+1), 'Loads the specified Real constant.'),
	0x29: new Opcode('ldstr',    0, args('tk/str'), stack(+1), 'Loads the specified string value.'),
	0x2a: new Opcode('ldargc',   0, NO_ARGS,        stack(+1), 'Loads the current argument count, as an Int. In an instance method, the count includes the instance.'),
	0x2b: new Opcode('ldenum.s', 0, args('tk/type', 'i4'), stack(+1), 'Loads a constant value of the specified type (usually an enum value). (short form)'),
	0x2c: new Opcode('ldenum',   0, args('tk/type', 'i8'), stack(+1), 'Loads a constant value of the specified type (usually an enum value).'),

	0x2d: new Opcode('newobj.s', 0, args('tk/type', 'ub/argc'), args => new StackChange(args[1].value, 1),
		'Creates a new object of the specified type with the specified number of constructor arguments, and pushes the result. (short form)'),
	0x2e: new Opcode('newobj',   0, args('tk/type', 'u2/argc'), args => new StackChange(args[1].value, 1),
		'Creates a new object of the specified type with the specified number of constructor arguments, and pushes the result.'),

	0x2f: new Opcode('call.0', 0, NO_ARGS, stack(-1, +1), 'Invokes a value on the stack with 0 arguments, and pushes the return value.'),
	0x30: new Opcode('call.1', 0, NO_ARGS, stack(-2, +1), 'Invokes a value on the stack with 1 argument, and pushes the return value.'),
	0x31: new Opcode('call.2', 0, NO_ARGS, stack(-3, +1), 'Invokes a value on the stack with 2 arguments, and pushes the return value.'),
	0x32: new Opcode('call.3', 0, NO_ARGS, stack(-4, +1), 'Invokes a value on the stack with 3 arguments, and pushes the return value.'),
	0x33: new Opcode('call.s', 0, args('ub/argc'), args => new StackChange(args[0].value + 1, 1),
		'Invokes a value on the stack with the specified number of arguments, and pushes the return value. (short form)'),
	0x34: new Opcode('call',   0, args('u2/argc'), args => new StackChange(args[0].value + 1, 1),
		'Invokes a value on the stack with the specified number of arguments, and pushes the return value.'),

	0x35: new Opcode('scall.s', 0, args('tk/func', 'ub/argc'), args => new StackChange(args[1].value, 1),
		'Invokes a specific method with the specified number of arguments, and pushes the return value. (short form)'),
	0x36: new Opcode('scall',   0, args('tk/func', 'u2/argc'), args => new StackChange(args[1].value, 1),
		'invokes a specific method with the specified number of arguments, and pushes the return value.'),

	0x37: new Opcode('apply',  0, NO_ARGS,         stack(-2, +1), 'Invokes the second stack value with the items in the top stack value as arguments.'),
	0x38: new Opcode('sapply', 0, args('tk/func'), stack(-1, +1), 'Invokes the specified method with the items in the top stack value as arguments.'),

	// Note: these two are out of order, to keep them together with the other invocation opcodes
	0x7f: new Opcode('callmem.s', 0, args('tk/str', 'ub/argc'), args => new StackChange(args[1].value + 1, 1),
		'Invokes the specified member of a value on the stack, with the specified number of arguments. (short form)'),
	0x80: new Opcode('callmem',   0, args('tk/str', 'u2/argc'), args => new StackChange(args[1].value + 1, 1),
		'Invokes the specified member of a value on the stack, with the specified number of arguments.'),

	0x39: new Opcode('retnull', TERM, NO_ARGS, stack(0),  'Returns null.'),
	0x3a: new Opcode('ret',     TERM, NO_ARGS, stack(-1), 'Returns the top stack value.'),

	0x3b: new Opcode('br.s',      UNBR, args('sb/trg'), stack(0),  'Unconditionally branches to the target. (short form)'),
	0x3c: new Opcode('brnull.s',  COBR, args('sb/trg'), stack(-1), 'Branches to the target if the top stack value is null. (short form)'),
	0x3d: new Opcode('brinst.s',  COBR, args('sb/trg'), stack(-1), 'Branches to the target if the top stack value is not null (put differently, if it is an instance). (short form)'),
	0x3e: new Opcode('brfalse.s', COBR, args('sb/trg'), stack(-1), 'Branches to the target if the top stack value is false. (short form)'),
	0x3f: new Opcode('brtrue.s',  COBR, args('sb/trg'), stack(-1), 'Branches to the target if the top stack value is true. (short form)'),
	0x40: new Opcode('brref.s',   COBR, args('sb/trg'), stack(-2), 'Branches to the target if the first and second stack value are the same instance. (short form)'),
	0x41: new Opcode('brnref.s',  COBR, args('sb/trg'), stack(-2), 'Branches to the target if the first and second stack value are different instances. (short form)'),
	0x42: new Opcode('brtype.s',  COBR, args('tk/type', 'sb/trg'), stack(-1), 'Branches to the target if the top stack value is of the specified type. (short form)'),

	0x43: new Opcode('br',      UNBR, args('i4/trg'), stack(0),  'Unconditionally branches to the target.'),
	0x44: new Opcode('brnull',  COBR, args('i4/trg'), stack(-1), 'Branches to the target if the top stack value is null.'),
	0x45: new Opcode('brinst',  COBR, args('i4/trg'), stack(-1), 'Branches to the target if the top stack value is not null (put differently, if it is an instance).'),
	0x46: new Opcode('brfalse', COBR, args('i4/trg'), stack(-1), 'Branches to the target if the top stack value is false.'),
	0x47: new Opcode('brtrue',  COBR, args('i4/trg'), stack(-1), 'Branches to the target if the top stack value is true.'),
	0x48: new Opcode('brref',   COBR, args('i4/trg'), stack(-2), 'Branches to the target if the first and second stack value are the same instance.'),
	0x49: new Opcode('brnref',  COBR, args('i4/trg'), stack(-2), 'Branches to the target if the first and second stack value are different instances.'),
	0x4a: new Opcode('brtype',  COBR, args('tk/type', 'i4/trg'), stack(-1), 'Branches to the target if the top stack value is of the specified type.'),

	0x4b: new Opcode('switch.s',
		OpcodeFlags.SWITCH,
		reader => {
			const n = U2_ARG.read(reader);
			return reader.readArray(n.value, SB_TRG_ARG);
		},
		stack(-1),
		'Chooses a branch based on the top stack value (which must be an Int), or falls through if no branch could be found. The top stack value contains an index into the jump table. (short form)'
	),
	0x4c: new Opcode('switch.s',
		OpcodeFlags.SWITCH,
		reader => {
			const n = U2_ARG.read(reader);
			return reader.readArray(n.value, I4_TRG_ARG);
		},
		stack(-1),
		'Chooses a branch based on the top stack value (which must be an Int), or falls through if no branch could be found. The top stack value contains an index into the jump table. (short form)'
	),

	0x4d: new Opcode('add',    0, NO_ARGS, stack(-2, +1), 'Invokes the + operator on the first and second stack value.'),
	0x4e: new Opcode('sub',    0, NO_ARGS, stack(-2, +1), 'Invokes the - operator on the first and second stack value.'),
	0x4f: new Opcode('or',     0, NO_ARGS, stack(-2, +1), 'Invokes the | operator on the first and second stack value.'),
	0x50: new Opcode('xor',    0, NO_ARGS, stack(-2, +1), 'Invokes the ^ operator on the first and second stack value.'),
	0x51: new Opcode('mul',    0, NO_ARGS, stack(-2, +1), 'Invokes the * operator on the first and second stack value.'),
	0x52: new Opcode('div',    0, NO_ARGS, stack(-2, +1), 'Invokes the / operator on the first and second stack value.'),
	0x53: new Opcode('mod',    0, NO_ARGS, stack(-2, +1), 'Invokes the % operator on the first and second stack value.'),
	0x54: new Opcode('and',    0, NO_ARGS, stack(-2, +1), 'Invokes the & operator on the first and second stack value.'),
	0x55: new Opcode('pow',    0, NO_ARGS, stack(-2, +1), 'Invokes the ** operator on the first and second stack value.'),
	0x56: new Opcode('shl',    0, NO_ARGS, stack(-2, +1), 'Invokes the << operator on the first and second stack value.'),
	0x57: new Opcode('shr',    0, NO_ARGS, stack(-2, +1), 'Invokes the >> operator on the first and second stack value.'),
	//0x58: Reserved (previously hashop/#)
	//0x59: Reserved (previously dollar/$)
	0x5a: new Opcode('plus',   0, NO_ARGS, stack(-1, +1), 'Invokes the unary + operator on the first and second stack value.'),
	0x5b: new Opcode('neg',    0, NO_ARGS, stack(-1, +1), 'Invokes the unary - operator on the first and second stack value.'),
	0x5c: new Opcode('not',    0, NO_ARGS, stack(-1, +1), 'Invokes the ~ operator on the first and second stack value.'),
	0x5d: new Opcode('eq',     0, NO_ARGS, stack(-2, +1), 'Invokes the == operator on the first and second stack value.'),
	0x5e: new Opcode('cmp',    0, NO_ARGS, stack(-2, +1), 'Invokes the <=> operator on the first and second stack value.'),
	0x5f: new Opcode('lt',     0, NO_ARGS, stack(-2, +1), 'Invokes the < operator on the first and second stack value.'),
	0x60: new Opcode('gt',     0, NO_ARGS, stack(-2, +1), 'Invokes the > operator on the first and second stack value.'),
	0x61: new Opcode('lte',    0, NO_ARGS, stack(-2, +1), 'Invokes the <= operator on the first and second stack value.'),
	0x62: new Opcode('gte',    0, NO_ARGS, stack(-2, +1), 'Invokes the >= operator on the first and second stack value.'),
	0x63: new Opcode('concat', 0, NO_ARGS, stack(-2, +1), 'Invokes the concatenation operator (::) on the first and second stack value.'),

	0x64: new Opcode('list.0', 0, NO_ARGS,    stack(+1), 'Creates a new List with capacity 0, and pushes it.'),
	0x65: new Opcode('list.s', 0, args('ub'), stack(+1), 'Creates a new List with the specified capacity, and pushes it. (short form)'),
	0x66: new Opcode('list',   0, args('u4'), stack(+1), 'Creates a new List with the specified capacity, and pushes it.'),

	0x67: new Opcode('hash.0', 0, NO_ARGS,    stack(+1), 'Creates a new Hash with capacity 0, and pushes it.'),
	0x68: new Opcode('hash.s', 0, args('ub'), stack(+1), 'Creates a new Hash with the specified capacity, and pushes it. (short form)'),
	0x69: new Opcode('hash',   0, args('u4'), stack(+1), 'Creates a new Hash with the specified capacity, and pushes it.'),

	0x6a: new Opcode('lditer', 0, NO_ARGS, stack(-1, +1), 'Loads the iterator of the top stack value.'),
	0x6b: new Opcode('ldtype', 0, NO_ARGS, stack(-1, +1), 'Loads the type descriptor of the top stack value.'),

	0x6c: new Opcode('ldfld',  0, args('tk/fld'), stack(-1, +1), 'Loads the value of the specified field from the top stack value.'),
	0x6d: new Opcode('stfld',  0, args('tk/fld'), stack(-2),     'Stores the top stack value into the specified field of the second stack value.'),
	0x6e: new Opcode('ldsfld', 0, args('tk/fld'), stack(+1),     'Loads the value of the specified static field.'),
	0x6f: new Opcode('stsfld', 0, args('tk/fld'), stack(-1),     'Stores the top stack value into the specified static field.'),
	0x70: new Opcode('ldmem',  0, args('tk/str'), stack(-1, +1), 'Loads the value of the specified member from the top stack value.'),
	0x71: new Opcode('stmem',  0, args('tk/str'), stack(-2),     'Stores the top stack value into the specified member of the second stack value.'),

	0x72: new Opcode('ldidx.1', 0, NO_ARGS, stack(-2, +1),
		'Loads the result of indexing into the second stack value, with the top stack value as the only argument.'),
	0x73: new Opcode('ldidx.s', 0, args('ub/argc'), args => new StackChange(args[0].value + 1, 1),
		'Loads the result of indexing into a stack value, with the specified number of arguments. (short form)'),
	0x74: new Opcode('ldidx',   0, args('u2/argc'), args => new StackChange(args[0].value + 1, 1),
		'Loads the result of indexing into a stack value, with the specified number of arguments.'),
	0x75: new Opcode('stidx.1', 0, NO_ARGS, stack(-3),
		'Stores the top stack value into the third value by indexing, with the second value as the only argument.'),
	0x76: new Opcode('stidx.s', 0, args('ub/argc'), args => new StackChange(args[0].value + 2, 0),
		'Stores the top stack value into a stack value by indexing, with the specified number of arguments. (short form)'),
	0x77: new Opcode('stidx',   0, args('u2/argc'), args => new StackChange(args[0].value + 2, 0),
		'Stores the top stack value into a stack value by indexing, with the specified number of arguments.'),

	0x78: new Opcode('ldsfn',     0, args('tk/func'), stack(+1), 'Loads a Method object for the specified static method.'),
	0x79: new Opcode('ldtypetkn', 0, args('tk/type'), stack(+1), 'Loads a type descriptor for the specified type.'),

	0x7a: new Opcode('throw',      TERM, NO_ARGS,        new StackChange(1, 0, EMPTIES_STACK), 'Throws the top stack value.'),
	0x7b: new Opcode('rethrow',    TERM, NO_ARGS,        new StackChange(0, 0, EMPTIES_STACK), 'Rethrows the current error.'),
	// Note: leave[.s] is the same as br[.s], but with extra semantics to ensure
	// finally blocks are executed. Hence, unconditional branch rather than terminus.
	0x7c: new Opcode('leave.s',    UNBR, args('sb/trg'), new StackChange(0, 0, EMPTIES_STACK), 'Branches out of the current protected region. (short form)'),
	0x7d: new Opcode('leave',      UNBR, args('i4/trg'), new StackChange(0, 0, EMPTIES_STACK), 'Branches out of the current protected region.'),
	0x7e: new Opcode('endfinally', TERM, NO_ARGS,        new StackChange(0, 0, EMPTIES_STACK), 'Leaves the current finally block.'),

	//0x7f: callmem.s (see above)
	//0x80: callmem (see above)

	0x81: new Opcode('ldmemref',   0, args('tk/str'), new StackChange(1, 1, PUSHES_REF), 'Loads a reference to the specified member of the top stack value.'),
	0x82: new Opcode('ldargref.s', 0, args('ub/arg'), new StackChange(0, 1, PUSHES_REF), 'Loads a reference to the specified argument. (short form)'),
	0x83: new Opcode('ldargref',   0, args('u2/arg'), new StackChange(0, 1, PUSHES_REF), 'Loads a reference to the specified argument. (short form)'),
	0x84: new Opcode('ldlocref.s', 0, args('ub/loc'), new StackChange(0, 1, PUSHES_REF), 'Loads a reference to the specified local variable. (short form)'),
	0x85: new Opcode('ldlocref',   0, args('u2/loc'), new StackChange(0, 1, PUSHES_REF), 'Loads a reference to the specified local variable.'),
	0x86: new Opcode('ldfldref',   0, args('tk/fld'), new StackChange(1, 1, PUSHES_REF), 'Loads a reference to the specified field of the top stack value.'),
	0x87: new Opcode('ldsfldref',  0, args('tk/fld'), new StackChange(0, 1, PUSHES_REF), 'Loads a reference to the specified static field.'),
});
