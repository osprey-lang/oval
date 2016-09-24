import {ModuleMember, MemberKind} from './modulemember';

export const FieldFlags = Object.freeze({
	PUBLIC:    0x0001,
	INTERNAL:  0x0002,
	PROTECTED: 0x0004,
	PRIVATE:   0x0008,
	INSTANCE:  0x0100,
	HAS_VALUE: 0x0200,
	IMPL:      0x1000,
});

export class Field extends ModuleMember {
	constructor(parent, flags, name, value) {
		super(MemberKind.FIELD, parent);

		this.flags = flags;
		this._name = name;
		this._value = value || null;
	}

	get name() {
		return this._name;
	}

	get fullName() {
		if (!this._fullName) {
			this._fullName = this.parent.fullName + '.' + this._name;
		}
		return this._fullName;
	}

	get isPublic() {
		return (this.flags & FieldFlags.PUBLIC) === FieldFlags.PUBLIC;
	}

	get isInternal() {
		return (this.flags & FieldFlags.INTERNAL) === FieldFlags.INTERNAL;
	}

	get isProtected() {
		return (this.flags & FieldFlags.PROTECTED) === FieldFlags.PROTECTED;
	}

	get isPrivate() {
		return (this.flags & FieldFlags.PRIVATE) === FieldFlags.PRIVATE;
	}

	get isStatic() {
		return (this.flags & FieldFlags.INSTANCE) === 0;
	}

	get hasValue() {
		return (this.flags & FieldFlags.HAS_VALUE) === FieldFlags.HAS_VALUE;
	}

	get isImpl() {
		return (this.flags & FieldFlags.IMPL) === FieldFlags.IMPL;
	}

	get value() {
		return this._value;
	}

	accept(visitor, arg) {
		return visitor.visitField(this, arg);
	}
}
