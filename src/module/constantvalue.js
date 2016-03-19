export class ConstantValue {
	constructor(type, rawValue) {
		this.type = type;
		this.rawValue = rawValue;
	}

	get isNull() {
		return this.type === null;
	}

	get isValueZero() {
		// Endianness doesn't matter when we're comparing against 0
		return this.rawValue.getUint32(0) === 0 &&
			this.rawValue.getUint32(4) === 0;
	}
}

ConstantValue.NULL = new ConstantValue(null, null);
