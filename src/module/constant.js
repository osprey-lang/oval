import {ModuleMember, MemberKind} from './modulemember';

export const ConstantFlags = Object.freeze({
	PUBLIC:  0x01,
	PRIVATE: 0x02,
});

export class Constant extends ModuleMember {
	constructor(parent, flags, name, value) {
		super(MemberKind.CONSTANT, parent);

		this.flags = flags;
		this._fullName = name;
		this.value = value;
	}

	get name() {
		if (!this._name) {
			this._name = this._getLastComponent(this._fullName);
		}
		return this._name;
	}

	get fullName() {
		return this._fullName;
	}

	get isPublic() {
		return (this.flags & ConstantFlags.PUBLIC) === ConstantFlags.PUBLIC;
	}

	get isPrivate() {
		return (this.flags & ConstantFlags.PRIVATE) === ConstantFlags.PRIVATE;
	}

	accept(visitor, arg) {
		return visitor.visitConstant(this, arg);
	}
}
