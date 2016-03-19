export const MemberKind = Object.freeze({
	NONE: 0,

	MODULE: 1,
	METADATA: 2,

	NAMESPACE: 3,

	MODULE_REF: 4,
	TYPE_REF: 5,
	METHOD_REF: 6,
	FIELD_REF: 7,
	FUNCTION_REF: 8,

	TYPE: 9,
	CONSTANT: 10,
	FUNCTION: 11,

	FIELD: 12,
	METHOD: 13,
	OVERLOAD: 14,
	PROPERTY: 15,
	OPERATOR: 16,
});

export const MetaKind = Object.freeze({
	NONE: 0,

	STRING_TABLE: 1,
	METADATA_TABLE: 2,
	REFERENCES: 3,
	DEFINITIONS: 4,
});

function notImplemented() {
	throw new Error('Not implemented');
}

export class ModuleMember {
	constructor(kind, parent) {
		this._kind = kind;
		this._parent = parent;
	}

	get kind() {
		return this._kind;
	}

	get name() { notImplemented(); }

	get fullName() { notImplemented(); }

	get parent() {
		return this._parent;
	}

	get module() {
		return this.parent.module;
	}

	get declaringModule() {
		return this.parent.declaringModule;
	}

	get isGenerated() {
		return false;
	}

	_getLastComponent(dottedName) {
		const lastDotIndex = dottedName.lastIndexOf('.');
		if (lastDotIndex !== -1) {
			return dottedName.substr(lastDotIndex + 1);
		}
		else {
			return dottedName;
		}
	}

	accept(visitor, arg) { notImplemented(); }
}

export class MetadataMember extends ModuleMember {
	constructor(parent, metaKind) {
		super(MemberKind.METADATA, parent);

		this._metaKind = metaKind;
	}

	get name() {
		return null;
	}

	get fullName() {
		return null;
	}

	get metaKind() {
		return this._metaKind;
	}

	accept(visitor, arg) {
		return visitor.visitMetadata(this, arg);
	}
}

export class ModuleMemberVisitor {
	visitModule(module, arg) { }

	visitMetadata(meta, arg) { }

	visitModuleRef(module, arg) { }

	visitTypeRef(type, arg) { }

	visitMethodRef(method, arg) { }

	visitFieldRef(field, arg) { }

	visitFunctionRef(func, arg) { }

	visitNamespace(namespace, arg) { }

	visitType(type, arg) { }

	visitConstant(constant, arg) { }

	visitFunction(func, arg) { }

	visitField(field, arg) { }

	visitMethod(method, arg) { }

	visitOverload(overload, arg) { }

	visitProperty(property, arg) { }

	visitOperator(operator, arg) { }
}
