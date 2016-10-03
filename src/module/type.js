import {ModuleMember, MemberKind} from './modulemember';

export const TypeFlags = Object.freeze({
	PUBLIC:    0x0001,
	INTERNAL:  0x0002,
	ABSTRACT:  0x0100,
	SEALED:    0x0200,
	STATIC:    0x0300,
	IMPL:      0x1000,
	PRIMITIVE: 0x2000,
});

export class Type extends ModuleMember {
	constructor(parent, flags, fullName, baseType, sharedType) {
		super(MemberKind.TYPE, parent);

		this.flags = flags;
		this._fullName = fullName;
		this._members = new Map();

		this.baseType = baseType;
		this.sharedType = sharedType;

		this.typeIniter = null;

		if (baseType) {
			baseType._addDerivedType(this);
		}
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
		return (this.flags & TypeFlags.PUBLIC) === TypeFlags.PUBLIC;
	}

	get isInternal() {
		return (this.flags & TypeFlags.INTERNAL) === TypeFlags.INTERNAL;
	}

	get isAbstract() {
		// STATIC combines ABSTRACT and SEALED
		return (this.flags & TypeFlags.STATIC) === TypeFlags.ABSTRACT;
	}

	get isSealed() {
		// STATIC combines ABSTRACT and SEALED,
		// and PRIMITIVE also implies SEALED.
		return (this.flags & (TypeFlags.STATIC | TypeFlags.PRIMITIVE)) === TypeFlags.SEALED;
	}

	get isStatic() {
		return (this.flags & TypeFlags.STATIC) === TypeFlags.STATIC;
	}

	get isImpl() {
		return (this.flags & TypeFlags.IMPL) === TypeFlags.IMPL;
	}

	get isPrimitive() {
		return (this.flags & TypeFlags.PRIMITIVE) === TypeFlags.PRIMITIVE;
	}

	get memberCount() {
		return this._members.size;
	}

	getMembers() {
		var children = new Array(this._members.size);
		this._members.forEach(value => {
			children[children.length] = value;
		});
		return children;
	}

	forEach(fn) {
		this._members.forEach(value => fn(value));
	}

	map(fn) {
		const result = [];
		this._members.forEach(value => {
			result.push(fn(value));
		});
		return result;
	}

	_add(member) {
		const name = member.name;
		if (this._members.has(name)) {
			throw new Error(`The type '${this.fullName}' already contains a member named '${name}'`);
		}

		this._members.set(name, member);
		member._parent = this;
	}

	_addDerivedType(type) {
		if (!this.derivedTypes) {
			this.derivedTypes = [];
		}
		this.derivedTypes.push(type);
	}

	accept(visitor, arg) {
		return visitor.visitType(this, arg);
	}
}
