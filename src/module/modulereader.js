import {readFile} from '../readfile';
import {Version} from './version';
import {Module} from './module';
import {Type} from './type';
import {Field, FieldFlags} from './field';
import {Method, Overload, OverloadFlags, Parameter, TryBlock, CatchBlock, FinallyBlock, TryKind} from './method';
import {Property} from './property';
import {Operator} from './operator';
import {Constant} from './constant';
import {ModuleRef, TypeRef, MethodRef, FieldRef, FunctionRef} from './refs';
import {ConstantValue} from './constantvalue';

const MAGIC_NUMBER = [79, 86, 77, 77];
const MIN_FILE_FORMAT_VERSION = 0x100;
const MAX_FILE_FORMAT_VERSION = 0x100;
const MODULE_DATA_OFFSET = 16;

class ModuleReader {
	constructor(data) {
		this.data = new DataView(data);
	}

	readInt8() {
		const value = this.data.getInt8(this.position, true);
		this.position += 1;
		return value;
	}

	readUint8() {
		const value = this.data.getUint8(this.position, true);
		this.position += 1;
		return value;
	}

	readInt16() {
		const value = this.data.getInt16(this.position, true);
		this.position += 2;
		return value;
	}

	readUint16() {
		const value = this.data.getUint16(this.position, true);
		this.position += 2;
		return value;
	}

	readInt32() {
		const value = this.data.getInt32(this.position, true);
		this.position += 4;
		return value;
	}

	readUint32() {
		const value = this.data.getUint32(this.position, true);
		this.position += 4;
		return value;
	}

	readBytes(count) {
		const buffer = this.data.buffer.slice(this.position, this.position + count);
		this.position += count;
		return new DataView(buffer);
	}

	readString() {
		const length = this.readInt32();
		return this.readStringValue(length);
	}

	readStringOrNull() {
		const length = this.readInt32();

		if (length === 0) {
			return null;
		}

		return this.readStringValue(length);
	}

	readStringValue(length) {
		var chars = [];
		for (var i = 0; i < length; i++) {
			chars.push(this.readUint16());
		}

		return String.fromCharCode.apply(null, chars);
	}

	readByteString() {
		// The current module specification only allows ASCII strings here.
		// TODO: Add support for UTF-8.

		const length = this.readInt32();
		// Byte string lengths INCLUDE the zero-terminator.
		const bytes = new Uint8Array(this.data.buffer, this.position, length - 1);
		this.position += length;

		return String.fromCharCode.apply(null, bytes);
	}

	readTable(table, readItem) {
		const size = this.readUint32();
		if (size === 0) {
			return;
		}

		const length = this.readInt32();

		for (var i = 0; i < length; i++) {
			const token = this.readUint32();
			const value = readItem(token);
			table._add(token, value);
		}
	}

	readList(readItem) {
		const size = this.readUint32();
		if (size === 0) {
			return [];
		}

		const length = this.readInt32();
		const items = new Array(length);
		for (var i = 0; i < length; i++) {
			items[i] = readItem();
		}

		return items;
	}

	seek(amount) {
		this.position += amount;
	}

	reset() {
		this.position = 0;
		this.unresolvedTypes = [];
	}

	read() {
		this.reset();

		this.verifyFileFormat();
		// Module data starts a bit after the header
		this.position = MODULE_DATA_OFFSET;

		const module = this.readModule();

		return module;
	}

	readModule() {
		const name = this.readString();
		const version = this.readVersion();

		const module = new Module(name, version);

		this.readMetadataTable(module);
		module._nativeLibrary = this.readStringOrNull();

		// These members are not really necessary in a language like JS
		this.seek(
			4 + // typeCount
			4 + // functionCount
			4 + // constantCount
			4 + // fieldCount
			4   // methodCount
		);

		this.readMethodBodyBlock(module);

		this.readStringTable(module);

		this.readModuleRefs(module);
		this.readTypeRefs(module);
		this.readFunctionRefs(module);
		this.readFieldRefs(module);
		this.readMethodRefs(module);

		this.readTypes(module);
		this.readFunctions(module);
		this.readConstants(module);

		this.readMainMethod(module);

		// At this point, this.position is at the start of the method body block,
		// but we've already pre-read it, so all that's left to do is resolve any
		// type tokens that may remain unresolved.

		this.unresolvedTypes.forEach(resolver => {
			resolver(module);
		});

		return module;
	}

	readVersion() {
		const major = this.readInt32();
		const minor = this.readInt32();
		const build = this.readInt32();
		const revision = this.readInt32();

		return new Version(major, minor, build, revision);
	}

	readMetadataTable(module) {
		this.seek(4); // Skip size

		const length = this.readInt32();
		const table = module.metadata;

		for (var i = 0; i < length; i++) {
			const key = this.readString();
			const value = this.readString();

			table._add(key, value);
		}
	}

	readStringTable(module) {
		this.readTable(module.strings, () => {
			return this.readString();
		});
	}

	readModuleRefs(module) {
		this.readTable(module.moduleRefs, () => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const version = this.readVersion();

			return new ModuleRef(module, name, version);
		});
	}

	readTypeRefs(module) {
		this.readTable(module.typeRefs, () => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const declModuleToken = this.readUint32();
			const declModule = module.moduleRefs.get(declModuleToken, true);

			const typeRef = new TypeRef(declModule, name);
			declModule._addGlobal(typeRef);
			return typeRef;
		});
	}

	readFunctionRefs(module) {
		this.readTable(module.functionRefs, () => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const declModuleToken = this.readUint32();
			const declModule = module.moduleRefs.get(declModuleToken, true);

			const functionRef = new FunctionRef(declModule, name);
			declModule._addGlobal(functionRef);
			return functionRef;
		});
	}

	readFieldRefs(module) {
		this.readTable(module.fieldRefs, () => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const declTypeToken = this.readUint32();
			const declType = module.typeRefs.get(declTypeToken, true);

			const fieldRef = new FieldRef(declType, name);
			declType._add(fieldRef);
			return fieldRef;
		});
	}

	readMethodRefs(module) {
		this.readTable(module.methodRefs, () => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const declTypeToken = this.readUint32();
			const declType = module.typeRefs.get(declTypeToken, true);

			const methodRef = new MethodRef(declType, name);
			declType._add(methodRef);
			return methodRef;
		});
	}

	readTypes(module) {
		this.readTable(module.types, () => this.readType(module));
	}

	readType(module) {
		const flags = this.readUint32();

		const nameToken = this.readUint32();
		const name = module.strings.get(nameToken, true);

		const baseTypeToken = this.readUint32();
		const baseType = baseTypeToken ? module.resolveToken(baseTypeToken, true) : null;

		const sharedTypeToken = this.readUint32();
		const sharedType = sharedTypeToken ? module.resolveToken(sharedTypeToken, true) : null;

		const type = new Type(module, flags, name, baseType, sharedType);

		this.seek(4); // Skip memberCount

		this.readFields(module, type);
		this.readMethods(module, type);
		this.readProperties(module, type);
		this.readOperators(module, type);

		this.readTypeIniter(module, type);

		module._addGlobal(type);
		return type;
	}

	readFields(module, type) {
		this.readTable(module.fields, () => {
			const flags = this.readUint32();

			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			var value = null;
			if ((flags & FieldFlags.HAS_VALUE) === FieldFlags.HAS_VALUE) {
				value = this.readConstantValue(module, true);
			}

			const field = new Field(type, flags, name, value);
			type._add(field);
			return field;
		});
	}

	readMethods(module, type) {
		this.readTable(module.methods, () => {
			const method = this.readMethod(module, type, false);
			type._add(method);
			return method;
		});
	}

	readMethod(module, type, isGlobal) {
		const flags = this.readUint32();

		const nameToken = this.readUint32();
		const name = module.strings.get(nameToken, true);

		const method = new Method(isGlobal ? module : type, isGlobal, flags, name);

		this.readList(() => {
			const overload = this.readOverload(module, method);
			method._add(overload);
		});

		return method;
	}

	readOverload(module, method) {
		const flags = this.readUint32();

		const overload = new Overload(method, flags);

		const paramCount = this.readUint16();
		for (var i = 0; i < paramCount; i++) {
			const parameter = this.readParameter(module, overload, i);
			overload.parameters.push(parameter);
		}

		this.readMethodHeader(module, overload);
		this.readEntryPoint(module, overload);

		return overload;
	}

	readParameter(module, overload, index) {
		const nameToken = this.readUint32();
		const name = module.strings.get(nameToken, true);

		const flags = this.readUint16();

		return new Parameter(overload, flags, name, index);
	}

	readMethodHeader(module, overload) {
		if (overload.hasShortHeader) {
			// No method header to read, so set the implied defaults.
			overload.optionalParamCount = 0;
			overload.localCount = 0;
			overload.maxStack = 8;
			overload.tryBlocks = [];
			return;
		}

		overload.optionalParamCount = this.readUint16();
		overload.localCount = this.readUint16();
		overload.maxStack = this.readUint16();
		overload.tryBlocks = this.readList(() => this.readTryBlock(module));
	}

	readTryBlock(module) {
		const tryKind = this.readUint8();
		const tryStart = this.readUint32();
		const tryEnd = this.readUint32();

		const tryBlock = new TryBlock(tryKind, tryStart, tryEnd);

		switch (tryKind) {
			case TryKind.CATCH:
				tryBlock.catchBlocks = this.readList(() => this.readCatchBlock(module));
				break;
			case TryKind.FINALLY:
				tryBlock.finallyBlock = this.readFinallyBlock();
				break;
			default:
				throw new Error(`Invalid try kind: ${tryKind}`);
		}

		return tryBlock;
	}

	readCatchBlock(module) {
		const caughtTypeToken = this.readUint32();
		const caughtType = module.resolveToken(caughtTypeToken);

		const catchStart = this.readUint32();
		const catchEnd = this.readUint32();

		const catchBlock = new CatchBlock(caughtType, catchStart, catchEnd);

		// The caught type is not required to be defined yet. If it isn't, we
		// try to resolve it again when the module has been read completely.
		if (caughtType === null) {
			this.unresolvedTypes.push(module => {
				catchBlock.caughtType = module.resolveToken(caughtTypeToken, true);
			});
		}

		return catchBlock;
	}

	readFinallyBlock() {
		const finallyStart = this.readUint32();
		const finallyEnd = this.readUint32();

		return new FinallyBlock(finallyStart, finallyEnd);
	}

	readEntryPoint(module, overload) {
		if (overload.isAbstract) {
			return;
		}

		var entryPoint;
		if (overload.isNative) {
			entryPoint = this.readByteString();
		}
		else {
			const offset = this.readUint32();
			const length = this.readUint32();
			entryPoint = {
				offset: offset,
				length: length,
			};
		}

		overload.entryPoint = entryPoint;
	}

	readProperties(module, type) {
		this.readList(() => {
			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const getterToken = this.readUint32();
			const getter = getterToken ? module.resolveToken(getterToken, true) : null;

			const setterToken = this.readUint32();
			const setter = setterToken ? module.resolveToken(setterToken, true) : null;

			const property = new Property(type, name, getter, setter);
			type._add(property);
		});
	}

	readOperators(module, type) {
		this.readList(() => {
			const operator = this.readUint8();

			const methodToken = this.readUint32();
			const method = module.resolveToken(methodToken, true);

			const operatorDef = new Operator(type, operator, method);
			type._add(operatorDef);
		});
	}

	readTypeIniter(module, type) {
		const length = this.readInt32();
		if (length === 0) {
			return;
		}

		this.seek(-4);

		type.typeIniter = this.readByteString();
	}

	readFunctions(module) {
		this.readTable(module.functions, () => {
			const method = this.readMethod(module, null, true);
			module._addGlobal(method);
			return method;
		});
	}

	readConstants(module) {
		this.readTable(module.constants, () => {
			const flags = this.readUint32();

			const nameToken = this.readUint32();
			const name = module.strings.get(nameToken, true);

			const value = this.readConstantValue(module, false);

			const constant = new Constant(module, flags, name, value);
			module._addGlobal(constant);
			return constant;
		});
	}

	readConstantValue(module, allowUnresolved) {
		const typeToken = this.readUint32();

		// A type token value of 0 represents the null value.
		if (typeToken === 0) {
			this.seek(8); // Skip value
			return ConstantValue.NULL;
		}

		const type = module.resolveToken(typeToken, !allowUnresolved);
		const value = this.readBytes(8);
		const constantValue = new ConstantValue(type, value);
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

		return constantValue;
	}

	readMainMethod(module) {
		const mainMethodToken = this.readUint32();
		module.mainMethod = mainMethodToken ? module.resolveToken(mainMethodToken, true) : null;
	}

	readMethodBodyBlock(module) {
		const methodStart = this.readUint32();
		const savedPosition = this.position;

		this.position = methodStart;

		const size = this.readUint32();
		const data = this.readBytes(size);

		module.methodBodyData = data;

		this.position = savedPosition;
	}

	verifyFileFormat() {
		this.verifyMagic();
		this.verifyFileFormatVersion();
	}

	verifyMagic() {
		for (var i = 0; i < MAGIC_NUMBER.length; i++) {
			if (this.readUint8() !== MAGIC_NUMBER[i]) {
				throw new Error('Invalid magic number');
			}
		}
	}

	verifyFileFormatVersion() {
		const fileFormatVersion = this.readUint32();

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
