import {readFile} from '../readfile';
import {Version} from './version';
import {Module} from './module';
import {Type} from './type';
import {Field, FieldFlags} from './field';
import {Method, Overload, OverloadFlags, Parameter, TryBlock, CatchBlock, FinallyBlock, FaultBlock, TryKind} from './method';
import {Property} from './property';
import {Operator} from './operator';
import {Constant} from './constant';
import {ModuleRef, TypeRef, MethodRef, FieldRef, FunctionRef} from './refs';
import {ConstantValue} from './constantvalue';

// Token types - duplicated from module.js for performance reasons.
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

const TOKEN_VALUE_MASK = 0x00ffffff;

const MAGIC_NUMBER = [79, 86, 77, 77];
const MIN_FILE_FORMAT_VERSION = 0x100;
const MAX_FILE_FORMAT_VERSION = 0x100;
const MODULE_HEADER_OFFSET = 16;

const MODULE_REF_SIZE = 20;
const TYPE_REF_SIZE = 12;
const FIELD_REF_SIZE = 12;
const METHOD_REF_SIZE = 12;
const FUNCTION_REF_SIZE = 12;

const STRING_TABLE_ENTRY_SIZE = 8;

const TYPE_DEF_SIZE = 56;
const FIELD_DEF_SIZE = 20;
const METHOD_DEF_SIZE = 20;
const PROPERTY_DEF_SIZE = 12;
const OPERATOR_DEF_SIZE = 8;
const CONSTANT_DEF_SIZE = 16;

const OVERLOAD_DEF_SIZE = 20;
const PARAMETER_SIZE = 8;
const TRY_BLOCK_SIZE = 20;
const CATCH_BLOCK_SIZE = 12;

class ModuleReader {
	constructor(data) {
		this.data = new DataView(data);
	}

	readInt8(address) {
		return this.data.getInt8(address, true);
	}

	readUint8(address) {
		return this.data.getUint8(address, true);
	}

	readInt16(address) {
		return this.data.getInt16(address, true);
	}

	readUint16(address) {
		return this.data.getUint16(address, true);
	}

	readInt32(address) {
		return this.data.getInt32(address, true);
	}

	readUint32(address) {
		return this.data.getUint32(address, true);
	}

	readBytes(address, count) {
		const buffer = this.data.buffer.slice(address, address + count);
		return new DataView(buffer);
	}

	readString(address) {
		const length = this.readInt32(address);
		return this.readStringValue(address + 4, length);
	}

	readStringOrNull(address) {
		const length = this.readInt32(address);

		if (length === 0) {
			return null;
		}

		return this.readStringValue(address + 4, length);
	}

	readStringValue(address, length) {
		var chars = [];
		for (var i = 0; i < length; i++) {
			chars.push(this.readUint16(address));
			address += 2;
		}

		return String.fromCharCode.apply(null, chars);
	}

	readByteString(address) {
		// The current module specification only allows ASCII strings here.
		// TODO: Add support for UTF-8.

		const length = this.readInt32(address);
		const bytes = new Uint8Array(this.data.buffer, address + 4, length);

		return String.fromCharCode.apply(null, bytes);
	}

	deref(address, func) {
		const rva = this.readUint32(address);
		return func(rva);
	}

	derefOrNull(address, func) {
		const rva = this.readUint32(address);
		if (rva === 0) {
			return null;
		}
		return func(rva);
	}

	makeToken(type, zeroBasedIndex) {
		return type | (zeroBasedIndex + 1);
	}

	reset() {
		this.constantValues = new Map();
		this.unresolvedTypes = [];
	}

	read() {
		this.reset();

		const module = this.readModule();

		return module;
	}

	readModule() {
		this.verifyFileFormat(0);

		const version = this.readVersion(16);
		const name = this.deref(28, address => this.readString(address));

		const module = new Module(name, version);

		this.deref(32, address => this.readStringTable(address, module));
		module._nativeLibrary = this.derefOrNull(36, address => this.readString(address));

		this.deref(40, address => this.readReferences(address, module));

		this.derefOrNull(44, address => this.readMetadata(address, module));

		const bases = {
			fields: this.readUint32(64),
			methods: this.readUint32(72),
		};
		this.readTypeDefs(52, module, bases);
		this.readFunctionDefs(76, module);
		this.readConstantDefs(84, module);

		const mainMethodToken = this.readUint32(48);
		module.mainMethod = mainMethodToken ? module.resolveToken(mainMethodToken, true) : null;

		this.unresolvedTypes.forEach(resolver => {
			resolver(module);
		});

		return module;
	}

	readVersion(address) {
		const major = this.readUint32(address + 0);
		const minor = this.readUint32(address + 4);
		const patch = this.readUint32(address + 8);

		return new Version(major, minor, patch);
	}

	readStringTable(address, module) {
		const strings = module.strings;

		const length = this.readInt32(address);
		address += 4;

		for (var i = 0; i < length; i++) {
			const token = this.makeToken(T_STRING, i);
			const str = this.deref(address, address => this.readString(address));
			strings._add(token, str);
			address += 4;
		}
	}

	readReferences(address, module) {
		this.readModuleRefs(address, module);
		this.readTypeRefs(address + 8, module);
		this.readFieldRefs(address + 16, module);
		this.readMethodRefs(address + 24, module);
		this.readFunctionRefs(address + 32, module);
	}

	readModuleRefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const moduleRefs = module.moduleRefs;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_MODULE_REF, i);

				const nameToken = this.readUint32(address);
				const name = module.strings.get(nameToken, true);
				const versionConstraint = this.readUint32(address + 4);
				const version = this.readVersion(address + 8);

				const moduleRef = new ModuleRef(module, name, versionConstraint, version);
				moduleRefs._add(token, moduleRef);

				address += MODULE_REF_SIZE;
			}
		});
	}

	readTypeRefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const typeRefs = module.typeRefs;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_TYPE_REF, i);

				const declModuleToken = this.readUint32(address);
				const declModule = module.moduleRefs.get(declModuleToken, true);
				// address + 4: flags - reserved for future use, so ignored for now.
				const fullNameToken = this.readUint32(address + 8);
				const fullName = module.strings.get(fullNameToken, true);

				const typeRef = new TypeRef(declModule, fullName);
				declModule._addGlobal(typeRef);
				typeRefs._add(token, typeRef);

				address += TYPE_REF_SIZE;
			}
		});
	}

	readFieldRefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const fieldRefs = module.fieldRefs;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_FIELD_REF, i);

				const declTypeToken = this.readUint32(address);
				const declType = module.typeRefs.get(declTypeToken, true);
				// address + 4: flags - reserved for future use, so ignored for now.
				const nameToken = this.readUint32(address + 8);
				const name = module.strings.get(nameToken, true);

				const fieldRef = new FieldRef(declType, name);
				fieldRefs._add(token, fieldRef);
				declType._add(fieldRef);

				address += FIELD_REF_SIZE;
			}
		});
	}

	readMethodRefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const methodRefs = module.methodRefs;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_METHOD_REF, i);

				const declTypeToken = this.readUint32(address);
				const declType = module.typeRefs.get(declTypeToken, true);
				// address + 4: flags - reserved for future use, so ignored for now.
				const nameToken = this.readUint32(address + 8);
				const name = module.strings.get(nameToken, true);

				const methodRef = new MethodRef(declType, name);
				methodRefs._add(token, methodRef);
				declType._add(methodRef);

				address += METHOD_REF_SIZE;
			}
		});
	}

	readFunctionRefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const functionRefs = module.functionRefs;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_FUNCTION_REF, i);

				const declModuleToken = this.readUint32(address);
				const declModule = module.moduleRefs.get(declModuleToken, true);
				// address + 4: flags - reserved for future use, so ignored for now.
				const fullNameToken = this.readUint32(address + 8);
				const fullName = module.strings.get(fullNameToken, true);

				const functionRef = new FunctionRef(declModule, fullName);
				declModule._addGlobal(functionRef);
				functionRefs._add(token, functionRef);

				address += FUNCTION_REF_SIZE;
			}
		});
	}

	readMetadata(address, module) {
		const length = this.readInt32(address);
		address += 4;

		const metadata = module.metadata;

		for (var i = 0; i < length; i++) {
			const key = this.deref(address, address => this.readString(address));
			const value = this.deref(address + 4, address => this.readString(address));

			metadata._add(key, value);

			address += STRING_TABLE_ENTRY_SIZE;
		}
	}

	readTypeDefs(address, module, bases) {
		const count = this.readInt32(address);

		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const types = module.types;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_TYPE_DEF, i);

				const type = this.readTypeDef(address, module, bases);
				types._add(token, type);
				module._addGlobal(type);

				address += TYPE_DEF_SIZE;
			}
		});
	}

	readTypeDef(address, module, bases) {
		const flags = this.readUint32(address);

		const nameToken = this.readUint32(address + 4);
		const name = module.strings.get(nameToken, true);

		const baseTypeToken = this.readUint32(address + 8);
		const baseType = baseTypeToken ? module.resolveToken(baseTypeToken, true) : null;

		const sharedTypeToken = this.readUint32(address + 12);
		const sharedType = sharedTypeToken ? module.resolveToken(sharedTypeToken, true) : null;

		// Properties and operators refer to methods, which means we need
		// to read methods before we read properties and operators. So we
		// might as well read all type members right here.

		this.readAnnotations(address + 16);

		const type = new Type(module, flags, name, baseType, sharedType);

		type.typeIniter = this.derefOrNull(address + 20, address => this.readByteString(address));

		this.readFieldDefs(address + 24, module, type, bases.fields);
		this.readMethodDefs(address + 32, module, type, bases.methods);
		this.readPropertyDefs(address + 40, module, type);
		this.readOperatorDefs(address + 48, module, type);

		return type;
	}

	readFieldDefs(address, module, type, fieldsBase) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		const firstToken = this.readUint32(address + 4);
		const tokenIndex = (firstToken & TOKEN_VALUE_MASK) - 1;

		const fields = module.fields;

		address = fieldsBase + FIELD_DEF_SIZE * tokenIndex;
		for (var i = 0; i < count; i++) {
			const token = firstToken + i;

			const flags = this.readInt32(address);

			const nameToken = this.readUint32(address + 4);
			const name = module.strings.get(nameToken, true);

			this.readAnnotations(address + 12);

			var value = null;
			if ((flags & FieldFlags.HAS_VALUE) === FieldFlags.HAS_VALUE) {
				value = this.deref(address + 16, address => this.readConstantValue(address, module, true));
			}

			const field = new Field(type, flags, name, value);
			type._add(field);
			fields._add(token, field);

			address += FIELD_DEF_SIZE;
		}
	}

	readMethodDefs(address, module, type, methodsBase) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		const firstToken = this.readUint32(address + 4);
		const tokenIndex = (firstToken & TOKEN_VALUE_MASK) - 1;

		const methods = module.methods;

		address = methodsBase + METHOD_DEF_SIZE * tokenIndex;
		for (var i = 0; i < count; i++) {
			const token = firstToken + i;

			const method = this.readMethodDef(address, module, type, false);
			type._add(method);
			methods._add(token, method);

			address += METHOD_DEF_SIZE;
		}
	}

	readPropertyDefs(address, module, type) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			for (var i = 0; i < count; i++) {
				const nameToken = this.readUint32(address);
				const name = module.strings.get(nameToken, true);

				const getterToken = this.readUint32(address + 4);
				const getter = getterToken ? module.resolveToken(getterToken, true) : null;

				const setterToken = this.readUint32(address + 8);
				const setter = setterToken ? module.resolveToken(setterToken, true) : null;

				const property = new Property(type, name, getter, setter);
				type._add(property);

				address += PROPERTY_DEF_SIZE;
			}
		});
	}

	readOperatorDefs(address, module, type) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			for (var i = 0; i < count; i++) {
				const operator = this.readUint32(address);

				const methodToken = this.readUint32(address + 4);
				const method = module.resolveToken(methodToken, true);

				const operatorDef = new Operator(type, operator, method);
				type._add(operatorDef);

				address += OPERATOR_DEF_SIZE;
			}
		});
	}

	readFunctionDefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const functions = module.functions;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_FUNCTION_DEF, i);

				const method = this.readMethodDef(address, module, null, true);

				module._addGlobal(method);
				functions._add(token, method);

				address += METHOD_DEF_SIZE;
			}
		});
	}

	readConstantDefs(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			const constants = module.constants;

			for (var i = 0; i < count; i++) {
				const token = this.makeToken(T_CONSTANT_DEF, i);

				const flags = this.readUint32(address);

				const fullNameToken = this.readUint32(address + 4);
				const fullName = module.strings.get(fullNameToken, true);

				this.readAnnotations(address + 8, module);

				const value = this.deref(address + 12, address => this.readConstantValue(address, module, false));

				const constant = new Constant(module, flags, name, value);
				module._addGlobal(constant);
				constants._add(token, constant);

				address += CONSTANT_DEF_SIZE;
			}
		});
	}

	readMethodDef(address, module, type, isGlobal) {
		const flags = this.readUint32(address);

		const nameToken = this.readUint32(address + 4);
		const name = module.strings.get(nameToken, true);

		const method = new Method(isGlobal ? module : type, isGlobal, flags, name);

		this.readOverloadDefs(address + 12, module, method);

		return method;
	}

	readOverloadDefs(address, module, method) {
		const count = this.readInt32(address);
		if (count === 0) {
			throw new Error(`Method '${method.fullName}' has no overloads`);
		}

		this.deref(address + 4, address => {
			for (var i = 0; i < count; i++) {
				const flags = this.readUint32(address);

				this.readAnnotations(address + 4, module);

				const overload = new Overload(method, flags);

				this.readParameters(address + 8, module, overload);
				this.readMethodBody(address + 16, module, overload);

				method._add(overload);

				address += OVERLOAD_DEF_SIZE;
			}
		});
	}

	readParameters(address, module, overload) {
		const count = this.readInt32(address);
		if (count === 0) {
			return;
		}

		this.deref(address + 4, address => {
			for (var i = 0; i < count; i++) {
				const flags = this.readUint32(address);

				const nameToken = this.readUint32(address + 4);
				const name = module.strings.get(nameToken, true);

				const parameter = new Parameter(overload, flags, name, i);
				overload.parameters.push(parameter);

				address += PARAMETER_SIZE;
			}
		});
	}

	readMethodBody(address, module, overload) {
		if (overload.isAbstract) {
			// Why were the abstract methods so lonely at the party?
			// They had no body to call their own.
			return;
		}

		if (overload.isNative) {
			this.deref(address, address => {
				overload.localCount = this.readUint32(address);
				overload.entryPoint = this.readByteString(address + 4);
			});
		}
		else if (overload.hasShortHeader) {
			this.deref(address, address => {
				const bodySize = this.readUint32(address);
				overload.body = this.readBytes(address + 4, bodySize);
			});
		}
		else {
			this.deref(address, address => {
				overload.localCount = this.readUint32(address);
				overload.maxStack = this.readUint32(address + 4);
				overload.tryBlocks = this.readTryBlocks(address + 8, module);

				const bodySize = this.readUint32(address + 16);
				overload.body = this.readBytes(address + 20, bodySize);
			});
		}
	}

	readTryBlocks(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			return [];
		}

		return this.deref(address + 4, address => {
			const tryBlocks = [];

			for (var i = 0; i < count; i++) {
				const tryKind = this.readUint32(address);
				const tryStart = this.readUint32(address + 4);
				const tryEnd = this.readUint32(address + 8);

				const tryBlock = new TryBlock(tryKind, tryStart, tryEnd);

				switch (tryKind) {
					case TryKind.CATCH:
						tryBlock.catchBlocks = this.readCatchBlocks(address + 12, module);
						break;
					case TryKind.FINALLY:
						tryBlock.finallyBlock = this.readFinallyBlock(address + 12);
						break;
					case TryKind.FAULT:
						tryBlock.faultBlock = this.readFaultBlock(address + 12);
						break;
				}

				tryBlocks.push(tryBlock);

				address += TRY_BLOCK_SIZE;
			}

			return tryBlocks;
		});
	}

	readCatchBlocks(address, module) {
		const count = this.readInt32(address);
		if (count === 0) {
			throw new Error('A try-catch block must have at least one catch clause');
		}

		return this.deref(address + 4, address => {
			const catchBlocks = [];

			for (var i = 0; i < count; i++) {
				const caughtTypeToken = this.readUint32(address);
				const caughtType = module.resolveToken(caughtTypeToken, false);

				const catchStart = this.readUint32(address + 4);
				const catchEnd = this.readUint32(address + 8);

				const catchBlock = new CatchBlock(caughtType, catchStart, catchEnd);
				catchBlocks.push(catchBlock);

				// The caught type is not required to be defined yet. If it isn't, we
				// try to resolve it again when the module has been read completely.
				if (caughtType === null) {
					this.unresolvedTypes.push(module => {
						catchBlock.caughtType = module.resolveToken(caughtTypeToken, true);
					});
				}

				address += CATCH_BLOCK_SIZE;
			}

			return catchBlocks;
		});
	}

	readFinallyBlock(address) {
		const finallyStart = this.readUint32(address);
		const finallyEnd = this.readUint32(address + 4);
		return new FinallyBlock(finallyStart, finallyEnd);
	}

	readFaultBlock(address) {
		const faultStart = this.readUint32(address);
		const faultEnd = this.readUint32(address + 4);
		return new FaultBlock(faultStart, faultEnd);
	}

	readConstantValue(address, module, allowUnresolved) {
		// Constant values are pooled. This slightly convoluted code allows us
		// to take advantage of the pooling, and only read each constant value
		// once, instead of every time the constant value at a certain address
		// is requested.

		var constantValue = this.constantValues.get(address);

		if (!constantValue) {
			const typeToken = this.readUint32(address);

			if (typeToken === 0) {
				// A type token value of 0 represents the null value.
				constantValue = ConstantValue.NULL;
			}
			else {
				const type = module.resolveToken(typeToken, !allowUnresolved);
				const value = this.readBytes(address + 8, 8);
				constantValue = new ConstantValue(type, value);

				// If the type is null, then the type may not have been read yet,
				// so we add the type token and the value to unresolvedTypes.
				// We'll figure it out later.
				// (If the type doesn't exist and allowUnresolved is false, the
				// call above will have thrown.)
				if (type === null) {
					this.unresolvedTypes.push(module => {
						constantValue.type = module.resolveToken(typeToken, true);
					});
				}
			}

			this.constantValues.set(address, constantValue);
		}

		return constantValue;
	}

	readAnnotations(address, module) {
		return this.derefOrNull(address, address => {
			throw new Error('Annotations are not yet supported');
		});
	}

	verifyFileFormat(address) {
		this.verifyMagic(address);
		this.verifyFileFormatVersion(address + 4);
	}

	verifyMagic(address) {
		for (var i = 0; i < MAGIC_NUMBER.length; i++) {
			if (this.readUint8(address + i) !== MAGIC_NUMBER[i]) {
				throw new Error('Invalid magic number');
			}
		}
	}

	verifyFileFormatVersion(address) {
		const fileFormatVersion = this.readUint32(address);

		if (fileFormatVersion < MIN_FILE_FORMAT_VERSION ||
			fileFormatVersion > MAX_FILE_FORMAT_VERSION) {
			throw new Error(`Unsupported file format version: ${fileFormatVersion}`)
		}
	}
}

export function readModule(file) {
	return readFile(file)
		.then(data => {
			const reader = new ModuleReader(data);
			return reader.read(0);
		});
}
