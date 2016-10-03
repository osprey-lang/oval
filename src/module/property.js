import {ModuleMember, MemberKind} from './modulemember';

export class Property extends ModuleMember {
	constructor(parent, name, getter, setter) {
		super(MemberKind.PROPERTY, parent);

		this._name = name;

		this.getter = getter;
		this.setter = setter;
		this._flagsSource = getter || setter;
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
		return this._flagsSource.isPublic;
	}

	get isInternal() {
		return this._flagsSource.isInternal;
	}

	get isProtected() {
		return this._flagsSource.isProtected;
	}

	get isPrivate() {
		return this._flagsSource.isPrivate;
	}

	get isStatic() {
		return this._flagsSource.isStatic;
	}

	get isAbstract() {
		return this._flagsSource._overloads.every(overload => overload.isAbstract);
	}

	get isReadOnly() {
		return this.getter !== null && this.setter === null;
	}

	get isWriteOnly() {
		return this.getter === null && this.setter !== null;
	}

	get isReadWrite() {
		return this.getter !== null && this.setter !== null;
	}

	accept(visitor, arg) {
		return visitor.visitProperty(this, arg);
	}
}
