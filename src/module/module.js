import {ModuleMember, MetadataMember, MemberKind, MetaKind} from './modulemember';
import {Namespace} from './namespace';

const T_CONSTANT_DEF = 0x02000000;
const T_FUNCTION_DEF = 0x04000000;
const T_TYPE_DEF     = 0x10000000;
const T_FIELD_DEF    = 0x12000000;
const T_METHOD_DEF   = 0x14000000;
const T_STRING       = 0x20000000;
const T_MODULE_REF   = 0x40000000;
const T_FUNCTION_REF = 0x44000000;
const T_TYPE_REF     = 0x50000000;
const T_FIELD_REF    = 0x52000000;
const T_METHOD_REF   = 0x54000000;

const TOKEN_TYPE_MASK = 0xff000000;

export class Module extends ModuleMember {
	constructor(name, version) {
		super(MemberKind.MODULE, null);

		this._name = name;
		this._version = version;
		this._nativeLibrary = null;

		this.strings = new Table(this, MetaKind.STRING_TABLE);
		this.metadata = new MetadataTable(this);

		this.moduleRefs = new Table(this, MetaKind.REFERENCES);
		this.typeRefs = new Table(this, MetaKind.REFERENCES);
		this.methodRefs = new Table(this, MetaKind.REFERENCES);
		this.fieldRefs = new Table(this, MetaKind.REFERENCES);
		this.functionRefs = new Table(this, MetaKind.REFERENCES);

		this.types = new Table(this, MetaKind.DEFINITIONS);
		this.fields = new Table(this, MetaKind.DEFINITIONS);
		this.methods = new Table(this, MetaKind.DEFINITIONS);
		this.functions = new Table(this, MetaKind.DEFINITIONS);
		this.constants = new Table(this, MetaKind.DEFINITIONS);

		this._canonicalTables = {
			[T_CONSTANT_DEF]: this.constants,
			[T_FUNCTION_DEF]: this.functions,
			[T_TYPE_DEF]:     this.types,
			[T_FIELD_DEF]:    this.fields,
			[T_METHOD_DEF]:   this.methods,
			[T_STRING]:       this.strings,
			[T_MODULE_REF]:   this.moduleRefs,
			[T_FUNCTION_REF]: this.functionRefs,
			[T_TYPE_REF]:     this.typeRefs,
			[T_FIELD_REF]:    this.fieldRefs,
			[T_METHOD_REF]:   this.methodRefs,
		};

		this.members = new Namespace(this, null);

		this.methodBodyData = null;
	}

	get name() {
		return this._name;
	}

	get fullName() {
		return this.name;
	}

	get module() {
		return this;
	}

	get declaringModule() {
		return this;
	}

	get version() {
		return this._version;
	}

	get nativeLibrary() {
		return this._nativeLibrary;
	}

	resolveToken(token, throwIfMissing) {
		const type = token & TOKEN_TYPE_MASK;

		const table = this._canonicalTables[type];
		if (!table) {
			if (throwIfMissing) {
				throw new Error(`Unrecognised token type in token ${token.toString(16)}`);
			}
			return null;
		}

		return table.get(token, throwIfMissing);
	}

	_addGlobal(member) {
		const fullName = member.fullName;
		const lastDotIndex = fullName.lastIndexOf('.');

		const namespacePath = fullName.substr(0, lastDotIndex);

		const namespace = this.members._resolveName(namespacePath);
		namespace._add(member);
	}

	accept(visitor, arg) {
		return visitor.visitModule(this, arg);
	}
}

export class Table extends MetadataMember {
	constructor(module, metaKind) {
		super(module, metaKind || MetaKind.NONE);

		this._members = new Map();
	}

	get length() {
		return this._members.size;
	}

	get(token, throwIfMissing) {
		const member = this._members.get(token);

		if (member === undefined) {
			if (throwIfMissing) {
				throw new Error(`No member matching the token ${token.toString(16)}`);
			}

			// Prefer not to return undefined
			return null;
		}

		return member;
	}

	forEach(fn) {
		this._members.forEach((member, token) => fn(member, token));
	}

	map(fn) {
		const result = [];
		this._members.forEach((member, token) => {
			result.push(fn(member, token));
		});
		return result;
	}

	_add(token, member) {
		if (this._members.has(token)) {
			throw new Error(`There is already a member with the token ${token.toString(16)}`);
		}

		this._members.set(token, member);
	}
}

export class MetadataTable extends MetadataMember {
	constructor(module) {
		super(module, MetaKind.METADATA_TABLE);

		this._members = new Map();
	}

	get length() {
		return this._members.size;
	}

	get(key) {
		return this._members.get(key) || null;
	}

	forEach(fn) {
		this._members.forEach((value, key) => fn(key, value));
	}

	map(fn) {
		const result = [];
		this._members.forEach((value, key) => {
			result.push(fn(key, value));
		});
		return result;
	}

	_add(key, value) {
		if (this._members.has(key)) {
			throw new Error(`There is already a metadata entry with the key ${key}`);
		}

		this._members.set(key, value);
	}
}
