import {ModuleMember, MemberKind} from './modulemember';

export const OperatorKind = Object.freeze({
	ADD:         0x00,
	SUBTRACT:    0x01,
	OR:          0x02,
	XOR:         0x03,
	MULTIPLY:    0x04,
	DIVIDE:      0x05,
	MODULO:      0x06,
	AND:         0x07,
	POWER:       0x08,
	SHIFT_LEFT:  0x09,
	SHIFT_RIGHT: 0x0A,
	PLUS:        0x0D,
	NEGATE:      0x0E,
	NOT:         0x0F,
	EQUALS:      0x10,
	COMPARE:     0x11,
});

const OperatorNames = Object.freeze({
	[OperatorKind.ADD]:         '+',
	[OperatorKind.SUBTRACT]:    '-',
	[OperatorKind.OR]:          '|',
	[OperatorKind.XOR]:         '^',
	[OperatorKind.MULTIPLY]:    '*',
	[OperatorKind.DIVIDE]:      '/',
	[OperatorKind.MODULO]:      '%',
	[OperatorKind.AND]:         '&',
	[OperatorKind.POWER]:       '**',
	[OperatorKind.SHIFT_LEFT]:  '<<',
	[OperatorKind.SHIFT_RIGHT]: '>>',
	[OperatorKind.PLUS]:        '+x',
	[OperatorKind.NEGATE]:      '-x',
	[OperatorKind.NOT]:         '~x',
	[OperatorKind.EQUALS]:      '==',
	[OperatorKind.COMPARE]:     '<=>',
});

export function getArity(operator) {
	switch (operator) {
		case OperatorKind.PLUS:
		case OperatorKind.NEGATE:
		case OperatorKind.NOT:
			return 1;
		case OperatorKind.ADD:
		case OperatorKind.SUBTRACT:
		case OperatorKind.OR:
		case OperatorKind.XOR:
		case OperatorKind.MULTIPLY:
		case OperatorKind.DIVIDE:
		case OperatorKind.MODULO:
		case OperatorKind.AND:
		case OperatorKind.POWER:
		case OperatorKind.SHIFT_LEFT:
		case OperatorKind.SHIFT_RIGHT:
		case OperatorKind.EQUALS:
		case OperatorKind.COMPARE:
			return 2;
		default:
			throw new Error(`Invalid operator: ${operator}`);
	}
}

export class Operator extends ModuleMember {
	constructor(parent, operator, method) {
		super(MemberKind.OPERATOR, parent);

		this.operator = operator;
		this.method = method;
	}

	get name() {
		return OperatorNames[this.operator];
	}

	get fullName() {
		if (!this._fullName) {
			this._fullName = this.parent.fullName + '.operator' + this.name;
		}
		return this._fullName;
	}

	get operatorName() {
		return OperatorNames[this.operator];
	}

	accept(visitor, arg) {
		return visitor.visitOperator(this, arg);
	}
}
