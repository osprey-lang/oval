import {ModuleMember, MemberKind} from './modulemember';

export const MethodFlags = Object.freeze({
	PUBLIC:    0x0001,
	INTERNAL:  0x0002,
	PROTECTED: 0x0004,
	PRIVATE:   0x0008,
	INSTANCE:  0x0100,
	CTOR:      0x0200,
	IMPL:      0x1000,
});

export const OverloadFlags = Object.freeze({
	VARIADIC:     0x0001,
	VIRTUAL:      0x0100,
	ABSTRACT:     0x0200,
	OVERRIDE:     0x0400,
	NATIVE:       0x1000,
	SHORT_HEADER: 0x2000,
});

export const ParamFlags = Object.freeze({
	BY_REF:   0x01,
	OPTIONAL: 0x02,
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
		if (!this._fullName) {
			this._fullName = this.parent.fullName + '.' + this._name;
		}
		return this._fullName;
	}

	get isGlobal() {
		return this._isGlobal;
	}

	get isPublic() {
		return (this.flags & MethodFlags.PUBLIC) === MethodFlags.PUBLIC;
	}

	get isInternal() {
		return (this.flags & MethodFlags.INTERNAL) === MethodFlags.INTERNAL;
	}

	get isProtected() {
		return (this.flags & MethodFlags.PROTECTED) === MethodFlags.PROTECTED;
	}

	get isPrivate() {
		return (this.flags & MethodFlags.PRIVATE) === MethodFlags.PRIVATE;
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

	get isOverride() {
		return (this.flags & OverloadFlags.OVERRIDE) === OverloadFlags.OVERRIDE;
	}

	get isPublic() {
		return this._parent.isPublic;
	}

	get isInternal() {
		return this._parent.isInternal;
	}

	get isProtected() {
		return this._parent.isProtected;
	}

	get isPrivate() {
		return this._parent.isPrivate;
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
		return (this.flags & ParamFlags.OPTIONAL) === ParamFlags.OPTIONAL;
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
