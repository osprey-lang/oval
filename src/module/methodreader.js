import {Instruction} from './instruction';
import {ALL_OPCODES} from './opcode';
import {TryKind} from './method';

export const DEFAULT_LOCAL_NAMER = index => `local\$${index}`;

export function getInstructions(method) {
	if (!method.instructions) {
		method.instructions = readInstructions(method);
	}

	return method.instructions;
}

function readInstructions(method) {
	const instructions = [];
	const instructionsByAddress = new Map();
	const reader = new MethodReader(method);

	const allOpcodes = ALL_OPCODES;
	while (!reader.eof) {
		const offset = reader.position;
		const opcode = reader.readUint8();
		const descriptor = allOpcodes[opcode];

		if (!descriptor) {
			throw new Error(`Invalid opcode ${opcode} at offset ${offset.toString(16)}`);
		}

		const args = descriptor.getArguments(reader);
		const stackChange = descriptor.getStackChange(args);

		const instruction = new Instruction(
			instructions.length, // index
			offset,
			reader.position - offset, // size
			opcode,
			args,
			stackChange,
			descriptor
		);
		instructions.push(instruction);
		instructionsByAddress[offset] = instruction;
	}

	applyTryBlocks(method, instructions, instructionsByAddress);
	analyzeStack(method, instructions, instructionsByAddress);

	return instructions;
}

function applyTryBlocks(method, instructions, instructionsByAddress) {
	const tryBlocks = method.tryBlocks;

	if (tryBlocks.length === 0) {
		// Nothing to do!
		return;
	}

	tryBlocks.forEach(tryBlock => {
		addBlock(
			tryBlock,
			tryBlock.tryStart,
			tryBlock.tryEnd,
			instructions,
			instructionsByAddress
		);

		switch (tryBlock.tryKind) {
			case TryKind.CATCH:
				tryBlock.catchBlocks.forEach(catchBlock => {
					addBlock(
						catchBlock,
						catchBlock.catchStart,
						catchBlock.catchEnd,
						instructions,
						instructionsByAddress
					);
				});
				break;
			case TryKind.FINALLY:
				const finallyBlock = tryBlock.finallyBlock;
				addBlock(
					finallyBlock,
					finallyBlock.finallyStart,
					finallyBlock.finallyEnd,
					instructions,
					instructionsByAddress
				);
				break;
		}
	});
}

function addBlock(block, start, end, instructions, instructionsByAddress) {
	addBlockStart(block, start, instructionsByAddress);
	addBlockEnd(block, end, instructions, instructionsByAddress);
}

function addBlockStart(block, blockStart, instructionsByAddress) {
	const instruction = instructionsByAddress[blockStart];
	if (!instruction) {
		throw new Error(`Invalid block start offset: ${blockStart.toString(16)}`);
	}

	instruction.addBlockStart(block);
}

function addBlockEnd(block, blockEnd, instructions, instructionsByAddress) {
	// The end offset of a block is exclusive; that is, it's one byte past
	// the end of the instruction to which it attaches, or alternatively put,
	// it is the start address of the /next/ instruction.
	var instruction = instructionsByAddress[blockEnd];
	if (!instruction) {
		// If we didn't find an instruction, the block may end at the very last
		// instruction, so try that instruction and verify its end offset.
		instruction = instructions[instructions.length - 1];
		if (instruction.offset + instruction.size !== blockEnd) {
			throw new Error(`Invalid block end offset: ${blockEnd.toString(16)}`);
		}
	}
	else {
		// If we DID find an instruction, we actually want the instruction that
		// precedes it. The instruction has an index for this reason; use it.
		if (instruction.index === 0) {
			throw new Error(`Invalid block end offset: ${blockEnd.toString(16)}`);
		}

		instruction = instructions[instruction.index - 1];
	}

	instruction.addBlockEnd(block);
}

function analyzeStack(method, instructions, instructionsByAddress) {
	const branches = getInitialBranches(method, instructions);

	var actualMaxStack = 0;
	BRANCH: while (branches.length > 0) {
		const branch = branches.shift();
		var stack = branch.stack;

		var index = instructionsByAddress[branch.startOffset].index;
		INSTR: while (true) {
			const instr = instructions[index];

			if (instr.reachable) {
				// If the instruction is marked as reachable, it means we've visited
				// it previously. In that case, we need to verify that this branch
				// reaches the instruction with a compatible stack.
				if (!stack.compatibleWith(instr.stackBefore)) {
					throw new Error(`Instruction at index ${index} can be reached with inconsistent stacks`);
				}

				// This branch has already been examined.
				continue BRANCH;
			}
			else {
				// Mark the instruction as reachable and give it its own copy of the stack.
				instr.reachable = true;
				instr.stackBefore = stack;
			}

			// Also give the instruction a copy of the stack after the change
			stack = instr.stackAfter = stack.applyChange(instr.stackChange);

			if (stack.height > actualMaxStack) {
				actualMaxStack = stack.height;
			}

			if (instr.isBranchTerminus) {
				continue BRANCH;
			}
			else if (instr.isBranch) {
				index = followBranch(instr, branches, instructionsByAddress);
			}
			else {
				index++;
			}
		}
	}

	method.actualMaxStack = actualMaxStack;
}

function followBranch(instr, branches, instructionsByAddress) {
	if (instr.isUnconditionalBranch) {
		// An unconditional branch always jumps to the new offset, which is
		// exactly what we'll do here too.
		const newOffset = instr.args[0].getAbsoluteOffset(instr);
		const newIndex = instructionsByAddress[newOffset].index;
		return newIndex;
	}
	else if (instr.isConditionalBranch) {
		// A conditional branch MAY jump to the new offset or may continue with
		// the next instruction, so we'll enqueue the potential jump. The target
		// of a conditional branch is always the last argument to the instruction.
		const lastArg = instr.args[instr.args.length - 1];
		const targetOffset = lastArg.getAbsoluteOffset(instr);
		branches.push(new Branch(targetOffset, instr.stackAfter));
	}
	else if (instr.isSwitch) {
		// A switch may branch to any one of its many targets or may continue
		// with the next instruction, so we need to enqueue every single target
		// as its own branch.
		instr.args.forEach(arg => {
			branches.push(new Branch(arg.getAbsoluteOffset(instr), instr.stackAfter));
		});
	}
	else {
		throw new Error(`Unsupported branch instruction at index ${index}`);
	}

	// "Fall through" to the next instruction.
	return instr.index + 1;
}

function getInitialBranches(method, instructions) {
	// The first instruction is always reachable
	const branches = [
		new Branch(0, new Stack(0))
	];

	if (method.tryBlocks.length > 0) {
		// For try blocks, the start of each catch and finally is also recorded
		// as the start of a new branch. The only way to reach a catch is by
		// catching an error; the only way to reach a finally is by leaving a
		// try block. Hence we will never visit these instructions during the
		// processing of "regular" branches.
		method.tryBlocks.forEach(tryBlock => {
			switch (tryBlock.tryKind) {
				case TryKind.CATCH:
					tryBlock.catchBlocks.forEach(catchBlock => {
						// Catch blocks start out with one value on the stack – the caught error.
						branches.push(new Branch(
							catchBlock.catchStart,
							new Stack(1)
						));
					});
					break;
				case TryKind.FINALLY:
					const finallyBlock = tryBlock.finallyBlock;
					branches.push(new Branch(finallyBlock.finallyStart, new Stack(0)));
					break;
			}
		});
	}

	return branches;
}

class Branch {
	constructor(startOffset, stack) {
		this.startOffset = startOffset;
		this.stack = stack;
	}
}

/**
 * Represents the state of the evaluation stack.
 *
 * Instances of this class should be seen as immutable. In particular, the method
 * `applyChange()` returns a new instance rather than mutating the current object.
 *
 * In order to record the referenceness of stack slots, the `slots` array contains
 * a bit mask of the "refness" of each value on the stack. When a bit is set, the
 * corresponding stack value is a reference; otherwise, it's a plain value. Note
 * that since JS is limited to 32-bit integers, each entry in `slots` records the
 * refness of up to 32 values. Beyond 32, additional integers are used. Index 0
 * is the bottom of the stack, for the sake of simplicity.
 *
 * Note that this approach was chosen not because of ease of development (a plain
 * array of booleans would suffice for that), but because of memory efficiency.
 * Stack objects may be immutable, but most instructions interact with the stack,
 * so the browser will have to make a lot of copies.
 *
 * Example:
 *   A Stack with
 *     height = 5
 *     slots = [0b01100]
 *   says that there are 5 items on the stack, of which those at index 2 and 3,
 *   counting from the bottom up, are references.
 *
 * Stacks with more than 32 items are exceedingly rare, but we must still support
 * extremely rare edge cases like that.
 */
class Stack {
	constructor(height, slots) {
		this.height = height;
		this.slots = slots || Stack.createSlots(height);
	}

	isRef(slotIndex) {
		const chunk = this.slots[Math.floor(slotIndex / 32)];
		return (chunk & (1 << (slotIndex % 32))) !== 0;
	}

	/**
	 * Determines whether two evaluation stacks are equivalent; that is, they have
	 * the same height, and the same refness for each slot.
	 *
	 * @param {Stack} other
	 * @return boolean
	 */
	compatibleWith(other) {
		if (this.height !== other.height) {
			return false;
		}

		if (this.height <= 32) {
			// Fast path for extremely common cases
			return this.slots[0] === other.slots[0];
		}

		for (var i = 0; i < this.slots.length; i++) {
			if (this.slots[i] !== other.slots[i]) {
				return false;
			}
		}

		return true;
	}

	applyChange(stackChange) {
		if (stackChange.removed === 0 && stackChange.added === 0) {
			// No change
			return this;
		}

		if (this.height < stackChange.removed) {
			throw new Error(`Not enough items on the stack (height: ${this.height}, removed: ${stackChange.removed})`);
		}

		const survivors = stackChange.emptiesStack ? 0 : this.height - stackChange.removed;
		const newHeight = survivors + stackChange.added;

		const newSlots = Stack.createSlots(newHeight);
		if (newHeight !== 0) {
			Stack.copySlots(this.slots, newSlots, survivors);
		}

		if (stackChange.pushesRef) {
			Stack.setRef(newSlots, survivors, stackChange.added);
		}

		return new Stack(newHeight, newSlots);
	}

	clone() {
		return new Stack(this.height, this.slots.slice(0));
	}

	static createSlots(height) {
		const slotCount = Math.ceil(height / 32);

		switch (slotCount) {
			// Fast path for the most common cases
			case 1:
				return [0];
			case 2:
				return [0, 0];
			// Slow path
			default:
				const slots = new Array(slotCount);
				for (var i = 0; i < slotCount; i++) {
					slots[i] = 0;
				}
				return slots;
		}
	}

	static copySlots(source, dest, height) {
		const fullSlotCount = Math.floor(height / 32);
		const partialCount = height % 32;

		// By FAR the most common case is fullSlotCount == 0, so we optimize for that.
		if (fullSlotCount === 0) {
			dest[0] = source[0] & ~(-1 << partialCount);
			return;
		}

		// Slower path for rare cases

		switch (fullSlotCount) {
			case 2:
				dest[1] = source[1];
				// fall through
			case 1:
				dest[0] = source[0];
				break;
			default:
				for (var i = 0; i < fullSlotCount; i++) {
					dest[i] = source[i];
				}
				break;
		}

		if (partialCount > 0) {
			dest[fullSlotCount] = source[fullSlotCount] & ~(-1 << partialCount);
		}
	}

	static setRef(slots, startIndex, count) {
		const endIndex = startIndex + count; // exclusive

		// Most common case by FAR:
		if (startIndex < 32 && endIndex <= 32) {
			const mask = (-1 << startIndex) & (-1 >>> (32 - endIndex));
			slots[0] |= mask;
			return;
		}

		// Slow path for rare cases
		const startSlot = Math.floor(startIndex / 32);
		const endSlot = Math.floor(endIndex / 32);

		if (startSlot === endSlot) {
			slots[startSlot] |= (-1 << (startIndex % 32)) & (-1 >>> (32 - (endIndex % 32)));
		}
		else {
			slots[startSlot] |= -1 << (startIndex % 32);
			slots[endSlot] |= -1 >>> (-32 - (endIndex % 32));

			for (var i = startSlot + 1; i < endSlot - 1; i++) {
				slots[i] |= -1;
			}
		}
	}
}

class MethodReader {
	constructor(method) {
		this.method = method;
		this.data = method.body;
		this.position = 0;
	}

	get module() {
		return this.method.module;
	}

	get eof() {
		return this.position >= this.data.byteLength;
	}

	readInt8() {
		const value = this.data.getInt8(this.position, true);
		this.position += 1;
		return value;
	}

	readUint8() {
		const value = this.data.getUint8(this.position, true);
		this.position += 1;
		return value;
	}

	readInt16() {
		const value = this.data.getInt16(this.position, true);
		this.position += 2;
		return value;
	}

	readUint16() {
		const value = this.data.getUint16(this.position, true);
		this.position += 2;
		return value;
	}

	readInt32() {
		const value = this.data.getInt32(this.position, true);
		this.position += 4;
		return value;
	}

	readUint32() {
		const value = this.data.getUint32(this.position, true);
		this.position += 4;
		return value;
	}

	readFloat64() {
		const value = this.data.getFloat64(this.position, true);
		this.position += 8;
		return value;
	}

	readBytes(count) {
		// The method data is guaranteed to have at least the same lifetime as
		// the method's instructions, so it's fine to return a sub-view into
		// the method body block.
		const bytes = new DataView(this.data.buffer, this.position, count);
		this.position += count;
		return bytes;
	}

	readArray(count, opcodeArg) {
		const array = new Array(count);
		for (var i = 0; i < count; i++) {
			array[i] = opcodeArg.read(this);
		}
		return array;
	}
}
