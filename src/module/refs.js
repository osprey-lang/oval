import {ModuleMember, MemberKind} from './modulemember';
import {Namespace} from './namespace';

export class MemberRef extends ModuleMember {
	constructor(kind, parent) {
		super(kind, parent);
	}
}

export class ModuleRef extends MemberRef {
	constructor(parent, name, version) {
		super(MemberKind.MODULE_REF, parent);

		this._name = name;
		this._version = version;
		this.members = new Namespace(this, null);
	}

	get name() {
		return this._name;
	}

	get fullName() {
		return this.name;
	}

	get version() {
		return this._version;
	}

	get declaringModule() {
		return this;
	}

	_addGlobal(member) {
		const fullName = member.fullName;
		const lastDotIndex = fullName.lastIndexOf('.');

		const namespacePath = fullName.substr(0, lastDotIndex);

		const namespace = this.members._resolveName(namespacePath);
		namespace._add(member);
	}

	accept(visitor, arg) {
		return visitor.visitModuleRef(this, arg);
	}
}

export class TypeRef extends MemberRef {
	constructor(parent, fullName) {
		super(MemberKind.TYPE_REF, parent);

		this._fullName = fullName;
		this._members = new Map();
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
		return visitor.visitTypeRef(this, arg);
	}
}

export class MethodRef extends MemberRef {
	constructor(parent, name) {
		super(MemberKind.METHOD_REF, parent);

		this._name = name;
	}

	get name() {
		return this._name;
	}

	get fullName() {
		return this._name;
	}

	accept(visitor, arg) {
		return visitor.visitMethodRef(this, arg);
	}
}

export class FieldRef extends MemberRef {
	constructor(parent, name) {
		super(MemberKind.FIELD_REF, parent);

		this._name = name;
	}

	get name() {
		return this._name;
	}

	get fullName() {
		return this._name;
	}

	accept(visitor, arg) {
		return visitor.visitFieldRef(this, arg);
	}
}

export class FunctionRef extends MemberRef {
	constructor(parent, fullName) {
		super(MemberKind.FUNCTION_REF, parent);

		this._fullName = fullName;
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

	accept(visitor, arg) {
		return visitor.visitFunctionRef(this, arg);
	}
}
