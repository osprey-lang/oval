import {getInstructions} from '../module/methodreader';
import {ArgumentKind} from '../module/instruction';
import {MemberKind} from '../module/modulemember';
import {BlockKind} from '../module/method';
import {formatInt, formatReal, formatStringContents} from './constantvaluerenderer';
import {Create} from '../html/create';

// Size (in pixels) of the indentation of instructions that are in a block.
// One multiple of this per block level.
// I have not yet been able to find a solution that's better or cleaner than
// setting 'margin-left' to a multiple of this...
const INDENTATION = 15;
// Width (in pixels) of an "item" on the stack, represented by a little box.
const STACK_ITEM_WIDTH = 8;

const BODY_ATTR = {class: 'method-body'};

const LOCALS_ATTR = {class: 'method-body__locals'};
const LOCAL_VAR_ATTR = {class: 'code-item code-item--local'};

const INSTR_ATTR = {class: 'instr'};
const OFFSET_ATTR = {class: 'instr__offset code-item code-item--offset'};
const NAME_ATTR = {class: 'instr__name'};

const BLOCK_START_ATTR = {class: 'instr instr--block-start'};
const BLOCK_END_ATTR = {class: 'instr instr--block-end'};
const BLOCK_ATTR = {class: 'instr__block'};

const ARG_ARG_ATTR     = {class: 'instr__arg code-item code-item--local'};
const LOCAL_ARG_ATTR   = {class: 'instr__arg code-item code-item--local'};
const TARGET_ARG_ATTR  = {class: 'instr__arg code-item code-item--offset'};
const MEMBER_ARG_ATTR  = {class: 'instr__arg'};
const ARGC_ARG_ATTR    = {class: 'instr__arg'};
const NUMERIC_ARG_ATTR = {class: 'instr__arg constant-number'};
const STRING_ARG_ATTR  = {class: 'instr__arg'};

const STRING_VALUE_ATTR = {class: 'constant-string'};

const LINK_ATTR = {class: 'member-link'};

const HIGHLIGHT_CLASS = 'code-item--highlight';

const UNCHANGED_STACK_ITEM_ATTR = {class: 'stack-item stack-item--unchanged'};
const ADDED_STACK_ITEM_ATTR = {class: 'stack-item stack-item--added'};
const REMOVED_STACK_ITEM_ATTR = {class: 'stack-item stack-item--removed'};
const STACK_ITEM_REF_CLASS = 'stack-item--ref';

function formatMethodOffset(offset) {
	var str = offset.toString(16).toUpperCase();

	while (str.length < 4) {
		str = '0' + str;
	}

	return `:${str}`;
}

export class MethodBodyRenderer {
	constructor(target) {
		this.target = target;
	}

	clickMember(member) {
		this.target.raise('member.click', member);
	}

	render(method, data) {
		if (!data) {
			data = new RenderedMethodData(method);
		}

		const instructions = getInstructions(method);

		return Create.ul(BODY_ATTR,
			method.localCount > 0 ? this.renderLocals(data) : null,
			instructions.map(instr => this.renderInstruction(data, instr))
		);
	}

	renderLink(member, contents) {
		const link = Create.span(LINK_ATTR, contents);
		link.addEventListener('click', () => this.clickMember(member), false);
		return link;
	}

	renderLocals(data) {
		const count = data.method.localCount;

		const locals = [];
		for (var i = 0; i < count; i++) {
			if (i > 0) {
				locals.push(', ');
			}

			const elem = Create.span(LOCAL_VAR_ATTR, `loc#${i}`);
			data.addCodeItem(`loc:${i}`, elem, true);
			locals.push(elem);
		}

		return Create.li(LOCALS_ATTR, 'locals { ', locals, ' }');
	}

	renderInstruction(data, instruction) {
		const offset = this.renderInstructionOffset(data, instruction);
		const name = this.renderInstructionName(instruction);
		const args = instruction.args.map(arg => this.renderArgument(data, instruction, arg));

		const elem = Create.li(INSTR_ATTR, offset, name, args);
		const stack = this.renderStackItems(data, instruction, elem);

		var result;
		if (instruction.blockStart || instruction.blockEnd) {
			// If any try, catch or finally block starts or ends on this instruction,
			// we need to include them in the output.
			result = this.renderBlocks(data, instruction, elem);
		}
		else {
			// Otherwise, just make sure we have the instruction indented deeply enough.
			elem.style.paddingLeft = data.currentIndentation;
			result = elem;
		}

		// If the instruction starts or ends with an empty stack, mark it up specially.
		// These instructions usually start/end a statement, which is indicated with
		// extra spacing.
		if (instruction.stackBefore.height === 0) {
			elem.classList.add('instr--empty-stack-before');
		}
		if (instruction.stackAfter.height === 0) {
			elem.classList.add('instr--empty-stack-after');
		}

		return result;
	}

	renderStackItems(data, instruction, parent) {
		const stackChange = instruction.stackChange;
		const stackBefore = instruction.stackBefore;
		const stackAfter = instruction.stackAfter;

		// Special case for 'dup': we don't want to show the removed value as removed,
		// because it isn't actually technically removed.
		const removed = instruction.isDup ? 0 : stackChange.removed;
		const added = instruction.isDup ? 1 : stackChange.added;
		const unchanged = stackBefore.height - removed;

		for (var i = 0; i < unchanged; i++) {
			const elem = Create.span(UNCHANGED_STACK_ITEM_ATTR);
			if (stackBefore.isRef(i)) {
				elem.classList.add(STACK_ITEM_REF_CLASS);
			}
			elem.style.left = (i * STACK_ITEM_WIDTH) + 'px';
			parent.appendChild(elem);
		}

		for (var i = 0; i < removed; i++) {
			const elem = Create.span(REMOVED_STACK_ITEM_ATTR);
			if (stackBefore.isRef(unchanged + i)) {
				elem.classList.add(STACK_ITEM_REF_CLASS);
			}
			elem.style.left = ((unchanged + i) * STACK_ITEM_WIDTH) + 'px';
			parent.appendChild(elem);
		}

		for (var i = 0; i < added; i++) {
			const elem = Create.span(ADDED_STACK_ITEM_ATTR);
			if (stackAfter.isRef(unchanged + i)) {
				elem.classList.add(STACK_ITEM_REF_CLASS);
			}
			else if (instruction.isDup) {
				elem.classList.add('stack-item--dup');
			}
			elem.style.left = ((unchanged + i) * STACK_ITEM_WIDTH) + 'px';
			parent.appendChild(elem);
		}
	}

	renderInstructionOffset(data, instruction) {
		const elem = Create.span(OFFSET_ATTR, formatMethodOffset(instruction.offset));
		data.addCodeItem(`offset:${instruction.offset}`, elem, true);
		return elem;
	}

	renderInstructionName(instruction) {
		const descriptor = instruction.descriptor;
		const elem = Create.span(NAME_ATTR, descriptor.name);
		elem.title = descriptor.description;
		return elem;
	}

	renderBlocks(data, instruction, instructionElem) {
		const fragment = Create.fragment();

		if (instruction.blockStart) {
			instruction.blockStart.forEach(block => {
				fragment.appendChild(this.renderBlockStart(data, block));
				data.currentDepth++;
			});
		}

		instructionElem.style.paddingLeft = data.currentIndentation;
		fragment.appendChild(instructionElem);

		if (instruction.blockEnd) {
			instruction.blockEnd.forEach(block => {
				data.currentDepth--;
				fragment.appendChild(this.renderBlockEnd(data, block));
			});
		}

		return fragment;
	}

	renderBlockStart(data, block) {
		var content;
		switch (block.blockKind) {
			case BlockKind.TRY:
				content = 'try {';
				break;
			case BlockKind.CATCH:
				content = [
					'catch ',
					this.renderLink(block.caughtType, block.caughtType.fullName),
					' {',
					Create.span(ADDED_STACK_ITEM_ATTR),
				];
				break;
			case BlockKind.FINALLY:
				content = 'finally {';
				break;
			default:
				throw new Error(`Invalid block kind: ${block.blockKind}`);
		}

		const elem = Create.li(BLOCK_START_ATTR, Create.span(BLOCK_ATTR, content));
		elem.style.paddingLeft = data.currentIndentation;
		return elem;
	}

	renderBlockEnd(data, block) {
		const elem = Create.li(BLOCK_END_ATTR, Create.span(BLOCK_ATTR, '}'));
		elem.style.paddingLeft = data.currentIndentation;
		return elem;
	}

	renderArgument(data, instruction, argument) {
		switch (argument.kind) {
			case ArgumentKind.ARGUMENT:
				return this.renderArgumentArgument(data, argument);
			case ArgumentKind.LOCAL:
				return this.renderLocalArgument(data, argument);
			case ArgumentKind.MEMBER:
				return this.renderMemberArgument(argument);
			case ArgumentKind.NUMBER:
				return this.renderNumericArgument(argument);
			case ArgumentKind.STRING:
				return this.renderStringArgument(argument);
			case ArgumentKind.ARG_COUNT:
				return this.renderArgumentCountArgument(argument);
			case ArgumentKind.TARGET:
				return this.renderJumpTargetArgument(data, instruction, argument);
			default:
				throw new Error(`Invalid argument kind: ${argument.kind}`);
		}
	}

	renderArgumentArgument(data, argument) {
		const index = argument.index;

		var paramName;
		if (!data.method.isStatic) {
			// The named parameter index is "off" by 1, because there is
			// a hidden first parameter.
			paramName = index === 0
				? '(this)'
				: data.method.parameters[index - 1].name;
		}
		else {
			paramName = data.method.parameters[index].name;
		}

		const elem = Create.span(ARG_ARG_ATTR, paramName);
		data.addCodeItem(`arg:${index}`, elem, true);
		return elem;
	}

	renderLocalArgument(data, argument) {
		const elem = Create.span(LOCAL_ARG_ATTR, `loc#${argument.index}`);
		data.addCodeItem(`loc:${argument.index}`, elem, true);
		return elem;
	}

	renderMemberArgument(argument) {
		const member = argument.member;

		var memberName;
		switch (member.kind) {
			case MemberKind.FIELD:
			case MemberKind.METHOD:
			case MemberKind.METHOD_REF:
				// Show fields and methods as "fully.qualified.TypeName/field"
				memberName = `${member.parent.fullName}/${member.name}`;
				break;
			default:
				// Everything else as just the full name.
				memberName = member.fullName;
				break;
		}

		return Create.span(MEMBER_ARG_ATTR, this.renderLink(member, memberName));
	}

	renderNumericArgument(argument) {
		const formattedValue = argument.isRawBytes
			? formatInt(argument.value)
			: formatReal(argument.value);

		return Create.span(NUMERIC_ARG_ATTR, formattedValue);
	}

	renderStringArgument(argument) {
		return Create.span(STRING_ARG_ATTR,
			'"',
			Create.span(STRING_VALUE_ATTR, formatStringContents(argument.value)),
			'"'
		);
	}

	renderArgumentCountArgument(argument) {
		// Hardcoded English plural rules :)
		const formattedValue = argument.value === 1
			? '1 arg'
			: `${argument.value} args`;

		return Create.span(ARGC_ARG_ATTR, formattedValue);
	}

	renderJumpTargetArgument(data, instruction, argument) {
		const absoluteOffset = instruction.offset + instruction.size + argument.offset;

		const elem = Create.span(TARGET_ARG_ATTR, formatMethodOffset(absoluteOffset));
		data.addCodeItem(`offset:${absoluteOffset}`, elem, true);
		return elem;
	}
}

export class RenderedMethodData {
	constructor(method) {
		this.method = method;
		// Increased upon encountering try, catch or finally blocks.
		this.currentDepth = 0;

		// Mapping from code item name to code item descriptor.
		this.codeItems = new Map();
	}

	get currentIndentation() {
		return (this.method.actualMaxStack * STACK_ITEM_WIDTH + this.currentDepth * INDENTATION) + 'px';
	}

	addCodeItem(name, elem, bindMouseEvents) {
		if (!this.codeItems.has(name)) {
			this.codeItems.set(name, new CodeItem());
		}

		const item = this.codeItems.get(name);
		item.add(elem);

		if (bindMouseEvents) {
			elem.addEventListener('mouseover', item.addHighlight, false);
			elem.addEventListener('mouseout', item.removeHighlight, false);
			elem.addEventListener('click', item.togglePersistentHighlight, false);
		}
	}

	addHighlight(itemName) {
		const item = this.codeItems.get(itemName);
		if (item) {
			item.addHighlight();
		}
	}

	removeHighlight(itemName) {
		const item = this.codeItems.get(itemName);
		if (item) {
			item.removeHighlight();
		}
	}
}

class CodeItem {
	constructor() {
		this.highlights = 0;
		this.persistent = false;
		this.elems = [];

		// Make sure these can be used as event handlers
		this.addHighlight = this.addHighlight.bind(this);
		this.removeHighlight = this.removeHighlight.bind(this);
		this.togglePersistentHighlight = this.togglePersistentHighlight.bind(this);
	}

	add(elem) {
		this.elems.push(elem);
	}

	addHighlight() {
		this.highlights++;

		if (this.highlights === 1) {
			this.elems.forEach(elem => {
				elem.classList.add(HIGHLIGHT_CLASS);
			});
		}
	}

	removeHighlight() {
		this.highlights--;

		if (this.highlights === 0) {
			this.elems.forEach(elem => {
				elem.classList.remove(HIGHLIGHT_CLASS);
			});
		}
	}

	togglePersistentHighlight() {
		this.persistent = !this.persistent;

		if (this.persistent) {
			this.addHighlight();
		}
		else {
			this.removeHighlight();
		}
	}
}
