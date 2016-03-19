import {ModuleMember, MemberKind} from './modulemember';

export const FieldFlags = Object.freeze({
	PUBLIC:    0x01,
	PRIVATE:   0x02,
	PROTECTED: 0x04,
	INSTANCE:  0x08,
	HAS_VALUE: 0x10,
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
		return this._name;
	}

	get isPublic() {
		return (this.flags & FieldFlags.PUBLIC) === FieldFlags.PUBLIC;
	}

	get isPrivate() {
		return (this.flags & FieldFlags.PRIVATE) === FieldFlags.PRIVATE;
	}

	get isProtected() {
		return (this.flags & FieldFlags.PROTECTED) === FieldFlags.PROTECTED;
	}

	get isStatic() {
		return (this.flags & FieldFlags.INSTANCE) === 0;
	}

	get hasValue() {
		return (this.flags & FieldFlags.HAS_VALUE) === FieldFlags.HAS_VALUE;
	}

	get value() {
		return this._value;
	}

	accept(visitor, arg) {
		return visitor.visitField(this, arg);
	}
}
