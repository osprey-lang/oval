export const ArgumentKind = Object.freeze({
	/**
	 * The argument is a reference to a method argument/parameter.
	 */
	ARGUMENT: 1,

	/**
	 * The argument is a reference to a local variable.
	 */
	LOCAL: 2,

	/**
	 * The argument is a reference to a member. Use the member's `kind` to find
	 * out what kind of member.
	 */
	MEMBER: 3,

	/**
	 * The argument is a numeric value.
	 */
	NUMBER: 4,

	/**
	 * The argument is a string value. Use the argument's `token` to get the string
	 * token from which the string value was resolved.
	 */
	STRING: 5,

	/**
	 * The argument is a numeric value specifically representing an argument count
	 * (passed to an invocation or similar).
	 */
	ARG_COUNT: 6,

	/**
	 * The argument is a jump target (that is, an offset into the method body).
	 */
	TARGET: 7,
});

export class Instruction {
	constructor(index, offset, size, opcode, args, stackChange, descriptor) {
		this.index = index;
		this.offset = offset;
		this.size = size;
		this.opcode = opcode;
		this.args = args;
		this.stackChange = stackChange;
		this.descriptor = descriptor;

		// Starts out false, and is then set to true when the stack analyzer
		// actually reaches it.
		this.reachable = false;
	}

	get isBranch() {
		return this.descriptor.isBranch;
	}

	get isConditionalBranch() {
		return this.descriptor.isConditionalBranch;
	}

	get isUnconditionalBranch() {
		return this.descriptor.isUnconditionalBranch;
	}

	get isSwitch() {
		return this.descriptor.isSwitch;
	}

	get isBranchTerminus() {
		return this.descriptor.isBranchTerminus;
	}

	get isDup() {
		return this.descriptor.isDup;
	}

	addBlockStart(block) {
		if (!this.blockStart) {
			this.blockStart = [];
		}

		// Try blocks are stored inside-out, which means we need to prepend
		// the block rather than append it: more recently added blocks must
		// be outside any that happen to be in the list already.
		// In practice, the only kind of block that can be opened multiple
		// times on a single instructon is a try block, so it barely matters
		// which order we add them in, but let's be correct in case we want
		// to examine the block later on.
		this.blockStart.unshift(block);
	}

	addBlockEnd(block) {
		if (!this.blockEnd) {
			this.blockEnd = [];
		}

		this.blockEnd.push(block);
	}
}

// Base class for instruction arguments.
export class Argument {
	constructor(kind) {
		this.kind = kind;
	}
}

export class LocalArgument extends Argument {
	constructor(index, isArgument) {
		super(isArgument ? ArgumentKind.ARGUMENT : ArgumentKind.LOCAL);

		this.index = index;
		this.isArgument = isArgument;
	}
}

export class MemberArgument extends Argument {
	constructor(token, member) {
		super(ArgumentKind.MEMBER);

		this.token = token;
		this.member = member;
	}
}

export class NumericArgument extends Argument {
	constructor(value, signed) {
		super(ArgumentKind.NUMBER);

		this.value = value;
		this.signed = signed;
	}

	get isRawBytes() {
		return typeof this.value !== 'number';
	}
}

export class StringArgument extends Argument {
	constructor(token, value) {
		super(ArgumentKind.STRING);

		this.token = token;
		this.value = value;
	}
}

export class ArgumentCountArgument extends Argument {
	constructor(value) {
		super(ArgumentKind.ARG_COUNT);

		this.value = value;
	}
}

export class JumpTargetArgument extends Argument {
	constructor(offset) {
		super(ArgumentKind.TARGET);

		this.offset = offset;
	}

	getAbsoluteOffset(relativeTo) {
		return this.offset + relativeTo.offset + relativeTo.size;
	}
}
