import {ModuleMember, MemberKind} from './modulemember';

export const MethodFlags = Object.freeze({
	PUBLIC:    0x01,
	PRIVATE:   0x02,
	PROTECTED: 0x04,
	INSTANCE:  0x08,
	CTOR:      0x10,
	IMPL:      0x20,
});

export const OverloadFlags = Object.freeze({
	VARIADIC:     0x01,
	NATIVE:       0x04,
	SHORT_HEADER: 0x08,
	VIRTUAL:      0x10,
	ABSTRACT:     0x20,
});

export const ParamFlags = Object.freeze({
	BY_REF: 0x01,
});

export const TryKind = Object.freeze({
	CATCH:   0x01,
	FINALLY: 0x02,
});

export const BlockKind = Object.freeze({
	TRY: 0,
	CATCH: 1,
	FINALLY: 2,
});

export class Method extends ModuleMember {
	constructor(parent, isGlobal, flags, name) {
		super(isGlobal ? MemberKind.FUNCTION : MemberKind.METHOD, parent);

		this.flags = flags;
		this._isGlobal = isGlobal;

		if (isGlobal) {
			this._fullName = name;
		}
		else {
			this._fullName = name;
			this._name = name;
		}

		this._overloads = [];
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

	get isGlobal() {
		return this._isGlobal;
	}

	get isPublic() {
		return (this.flags & MethodFlags.PUBLIC) === MethodFlags.PUBLIC;
	}

	get isPrivate() {
		return (this.flags & MethodFlags.PRIVATE) === MethodFlags.PRIVATE;
	}

	get isProtected() {
		return (this.flags & MethodFlags.PROTECTED) === MethodFlags.PROTECTED;
	}

	get isStatic() {
		return (this.flags & MethodFlags.INSTANCE) === 0;
	}

	get isCtor() {
		return (this.flags & MethodFlags.CTOR) === MethodFlags.CTOR;
	}

	get isImpl() {
		return (this.flags & MethodFlags.IMPL) === MethodFlags.IMPL;
	}

	get length() {
		return this._overloads.length;
	}

	forEach(fn) {
		this._overloads.forEach(overload => fn(overload));
	}

	map(fn) {
		return this._overloads.map(fn);
	}

	_add(overload) {
		overload._parent = this;
		this._overloads.push(overload);
	}

	accept(visitor, arg) {
		if (this.isGlobal) {
			return visitor.visitFunction(this, arg);
		}
		else {
			return visitor.visitMethod(this, arg);
		}
	}
}

export class Overload extends ModuleMember {
	constructor(methodGroup, flags) {
		super(MemberKind.OVERLOAD, methodGroup);

		this.flags = flags;
		this.parameters = [];
		this.entryPoint = null;

		this.optionalParamCount = 0;
		this.localCount = 0;
		this.maxStack = 8;
		this.tryBlocks = [];
	}

	// Overloads are a little bit special... instead of reporting the method group
	// as their parent, they claim to belong to the class or namespace that is the
	// parent of the method group. Basically, we want to try to hide method groups
	// as much as possible.

	get parent() {
		return this._parent.parent;
	}

	get methodGroup() {
		return this._parent;
	}

	get name() {
		return this._parent.name;
	}

	get fullName() {
		return this._parent.fullName;
	}

	get isVariadic() {
		return (this.flags & OverloadFlags.VARIADIC) === OverloadFlags.VARIADIC;
	}

	get isNative() {
		return (this.flags & OverloadFlags.NATIVE) === OverloadFlags.NATIVE;
	}

	get hasShortHeader() {
		return (this.flags & OverloadFlags.SHORT_HEADER) === OverloadFlags.SHORT_HEADER;
	}

	get isVirtual() {
		return (this.flags & OverloadFlags.VIRTUAL) === OverloadFlags.VIRTUAL;
	}

	get isAbstract() {
		return (this.flags & OverloadFlags.ABSTRACT) === OverloadFlags.ABSTRACT;
	}

	get isPublic() {
		return this._parent.isPublic;
	}

	get isPrivate() {
		return this._parent.isPrivate;
	}

	get isProtected() {
		return this._parent.isProtected;
	}

	get isStatic() {
		return this._parent.isStatic;
	}

	get isCtor() {
		return this._parent.isCtor;
	}

	get isImpl() {
		return this._parent.isImpl;
	}

	accept(visitor, arg) {
		return visitor.visitOverload(this, arg);
	}
}

export class Parameter {
	constructor(overload, flags, name, index) {
		this.overload = overload;
		this.flags = flags;
		this.name = name;
		this.index = index;
	}

	get isRef() {
		return (this.flags & ParamFlags.BY_REF) === ParamFlags.BY_REF;
	}

	get isVariadic() {
		return this.overload.isVariadic &&
			this.index === this.overload.parameters.length - 1;
	}

	get isOptional() {
		const overload = this.overload;
		return this.overload.optionalParamCount > 0 &&
			this.index >= this.overload.parameters.length - this.overload.optionalParamCount;
	}
}

export class TryBlock {
	constructor(tryKind, tryStart, tryEnd) {
		this.tryKind = tryKind;
		this.tryStart = tryStart;
		this.tryEnd = tryEnd;
	}

	get blockKind() {
		return BlockKind.TRY;
	}
}

export class CatchBlock {
	constructor(caughtType, catchStart, catchEnd) {
		this.caughtType = caughtType;
		this.catchStart = catchStart;
		this.catchEnd = catchEnd;
	}

	get blockKind() {
		return BlockKind.CATCH;
	}
}

export class FinallyBlock {
	constructor(finallyStart, finallyEnd) {
		this.finallyStart = finallyStart;
		this.finallyEnd = finallyEnd;
	}

	get blockKind() {
		return BlockKind.FINALLY;
	}
}
