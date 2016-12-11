import {Create} from '../html/create';

const SPECIAL_TYPES = Object.freeze({
	'aves.Boolean': 'renderBoolean',
	'aves.Int': 'renderInt',
	'aves.UInt': 'renderUInt',
	'aves.Real': 'renderReal',
	'aves.String': 'renderString',
	'aves.Char': 'renderChar',
});

const VALUE_ATTR = {class: 'constant-value'};
const NUMBER_ATTR = {class: 'constant-number'};
const STRING_ATTR = {class: 'constant-string'};

const ESCAPE_SEQUENCES = Object.freeze({
	'\\': '\\\\',
	'\0': '\\0',
	'\a': '\\a',
	'\b': '\\b',
	'\n': '\\n',
	'\r': '\\r',
	'\t': '\\t',
	'\u00a0': '\\_', // No-Break Space
	'\u00ad': '\\-', // Soft Hyphen
});

const ESCAPED_CHARACTERS = /[\x00-\x1f\x7f-\x9f\u00a0\u00ad\u2028\u2029]/g;

/*
 * The Number class in JS contains a double-precision floating-point number.
 * This means you get 52 bits for the fraction (i.e. the integral part), and
 * 11 bits for the exponent. Unfortunately, this is too small to represent a
 * 64-bit integer (signed or unsigned), so we need to do some additional work
 * to display the full range of 64-bit integers.
 *
 * For formatting to decimal numbers, we use the Int64Formatter class, which
 * does some decimal digit manipulation. Note: digits are, for the sake of
 * simplicity, stored in little-endian format (that is, the least significant
 * digit is at index 0).
 */
const MAX_DIGITS = 24;

export function formatInt(data, signed) {
	// If the higher-order word is all zeroes, we don't actually have to do
	// anything special; a 32-bit int fits into Number. Let's let it do the
	// hard work.
	if (data.getUint32(4, true) === 0) {
		return formatReal(data.getUint32(0, true));
	}

	// Similarly, if the higher-order word is all ones, and if we're formatting
	// a signed integer, we can read it as a 32-bit number and let the browser
	// figure the rest out.
	if (signed && data.getUint32(4, true) === 0xffffffff) {
		return formatReal(data.getInt32(0, true));
	}

	// Guess we'll have to use Int64Formatter.
	const formatter = new Int64Formatter(signed);

	const words = [data.getUint32(0, true), data.getUint32(4, true)];
	for (var w = 0; w < words.length; w++) {
		var bit = 32 * w;
		var word = words[w];
		while (word > 0) {
			if (word & 1) {
				formatter.setBit(bit);
			}
			word >>>= 1;
			bit++;
		}
	}

	return formatter.toString();
}

export function formatReal(value) {
	return value.toString().replace(/-/g, '\u2212');
}

export function formatStringContents(value) {
	return value.replace(ESCAPED_CHARACTERS, escapeCharacter);
}

function escapeCharacter(ch) {
	const escapeSequence = ESCAPE_SEQUENCES[ch];
	if (escapeSequence) {
		return escapeSequence;
	}
	else {
		var charCode = ch.charCodeAt(0).toString(16);
		while (charCode.length < 4) {
			charCode = '0' + charCode;
		}
		return `\\u${charCode}`;
	}
}

export function formatToken(token) {
	var str = token.toString(16);
	while (str.length < 8) {
		str = '0' + str;
	}
	return str;
}

export class ConstantValueRenderer {
	constructor(target) {
		this.target = target;

		this.setUpSpecialTypeRenderers();
	}

	setUpSpecialTypeRenderers() {
		this.specialTypes = {};

		for (var typeName in SPECIAL_TYPES) {
			if (!SPECIAL_TYPES.hasOwnProperty(typeName)) {
				continue;
			}

			const methodName = SPECIAL_TYPES[typeName];
			this.specialTypes[typeName] = this[methodName].bind(this);
		}
	}

	clickMember(member) {
		this.target.raise('member.select', member);
	}

	renderTypeLink(type, displayName) {
		const attr = {
			class: 'member-link',
			title: type.fullName,
			onclick: () => this.clickMember(type),
		};
		return Create.span(attr, displayName || type.name);
	}

	render(value, module) {
		if (value.isNull) {
			return this.renderNull();
		}

		const renderer = this.specialTypes[value.type.fullName];
		if (renderer) {
			return renderer(value, module);
		}
		else {
			return this.renderDefault(value, module);
		}
	}

	renderNull() {
		return Create.text('null');
	}

	renderBoolean(value, module) {
		var text;
		if (value.rawValue.getUint32(0, true) === 0 &&
			value.rawValue.getUint32(4, true) === 0) {
			text = 'false';
		}
		else {
			text = 'true';
		}
		return Create.span(VALUE_ATTR, this.renderTypeLink(value.type, text));
	}

	renderInt(value, module) {
		const text = formatInt(value.rawValue, true);
		return Create.span(VALUE_ATTR,
			Create.span(NUMBER_ATTR, text),
			' (',
			this.renderTypeLink(value.type, 'int'),
			')'
		);
	}

	renderUInt(value, module) {
		const text = formatInt(value.rawValue, false);
		return Create.span(VALUE_ATTR,
			Create.span(NUMBER_ATTR, text),
			' (',
			this.renderTypeLink(value.type, 'uint'),
			')'
		);
	}

	renderReal(value, module) {
		const number = value.rawValue.getFloat64(0, true);
		var text = formatReal(value.rawValue.getFloat64(0, true));
		return Create.span(VALUE_ATTR,
			Create.span(NUMBER_ATTR, text),
			' (',
			this.renderTypeLink(value.type, 'real'),
			')'
		);
	}

	renderString(value, module) {
		const stringToken = value.rawValue.getUint32(0, true);
		const stringValue = module.strings.get(stringToken);

		if (stringValue === null) {
			return Create.span(VALUE_ATTR,
				'<INVALID STRING TOKEN>::',
				this.renderTypeLink(value.type)
			);
		}
		else {
			return Create.span(VALUE_ATTR,
				'"',
				Create.span(STRING_ATTR, formatStringContents(stringValue)),
				'" (',
				this.renderTypeLink(value.type, 'string'),
				')'
			);
		}

	}

	renderChar(value, module) {
		if (value.rawValue.getUint32(4, true) !== 0 ||
			value.rawValue.getUint32(0, true) > 0x10ffff) {
			// The char is, for whatever reason, larger than U+10FFFF, which means
			// we can't possibly get it to represent a Unicode code point.
			// Let's use the default rendererer.
			return this.renderDefault(value, module);
		}

		// String.fromCodePoint is not supported everywhere, sigh.
		var charValue;
		const codePoint = value.rawValue.getUint32(0, true);
		if (charValue > 0xffff) {
			// Need a surrogate pair
			const highSurrogate = (codePoint >> 10) + 0xD800;
			const lowSurrogate = (codePoint % 0x400) + 0xDC00;
			charValue = String.fromCharCode(highSurrogate, lowSurrogate);
		}
		else {
			charValue = String.fromCharCode(codePoint);
		}

		return Create.span(VALUE_ATTR,
			"'",
			Create.span(STRING_ATTR, formatStringContents(charValue)),
			"' (",
			this.renderTypeLink(value.type, 'char'),
			")"
		);
	}

	renderDefault(value, module) {
		const valueText = formatInt(value.rawValue, true);
		return Create.span(VALUE_ATTR,
			this.renderTypeLink(value.type),
			'{', Create.span(NUMBER_ATTR, valueText), '}'
		);
	}
}

class Int64Formatter {
	constructor(signed) {
		this.signed = signed;
		this.negative = false;
		this.replaceValue();
	}

	setBit(bit) {
		if (this.signed && bit === 63) {
			this.negate();
		}
		else {
			const value = BIT_VALUES[bit];
			this.add(value);
		}
	}

	add(value) {
		// The clipped sum S of digits A and B is:
		//   S = (A + B + carry) % 10
		// and the carry is:
		//   carry' = 1 if A + B + carry >= 10,
		//            0 otherwise
		// We have to continue adding until we reach the end of value or carry is 0,
		// whichever comes last.
		var carry = 0;
		var i = 0;
		while (i < value.length || carry) {
			const sum = (value[i] || 0) + this.value[i] + carry;

			this.value[i] = sum % 10;
			carry = sum >= 10 ? 1 : 0;

			i++;
		}
	}

	negate() {
		// With two's complement arithmetics, negating a positive 64-bit integer N to -N
		// is equivalent to:
		//   -N = N - 2^63
		// In order to avoid wrapping at zero, we can rewrite this as:
		//   -N = -(2^63 - N)
		// since we know N is less than 2^63. Negating an Int64Formatter is as
		// easy as setting this.negative = true.

		// First, replace this.value with 2^63.
		var value = this.value;
		this.replaceValue(BIT_VALUES[63]);

		// Let's subtract! The clipped difference D between A and B is:
		//   D = (A - B - borrow) % 10
		// and the borrow is:
		//   borrow' = 1 if A - borrow < B,  (or alternatively, A - borrow - B < 0)
		//             0 otherwise
		// Unfortunately this assumes that the modulo operation returns a positive number,
		// which JS doesn't if one of the operands is negative. We can get around this as
		// follows:
		//   D = (10 + A - B - borrow) % 10
		// We have to continue subtracting until we reach the end of value or borrow is 0,
		// whichever comes last.
		var borrow = 0;
		var i = 0;
		while (i < value.length || borrow) {
			const diff = this.value[i] - borrow - (value[i] || 0);

			this.value[i] = (10 + diff) % 10;
			borrow = diff < 0 ? 1 : 0;

			i++;
		}

		this.negative = true;
	}

	replaceValue(digits) {
		var newValue = new Uint8Array(MAX_DIGITS);

		if (digits) {
			for (var i = 0; i < digits.length; i++) {
				newValue[i] = digits[i];
			}
		}

		this.value = newValue;
	}

	toString() {
		// Find the last non-zero digit
		var i = this.value.length;
		while (i > 0) {
			if (this.value[--i] !== 0) {
				break;
			}
		}

		// U+2212 = Minus Sign
		var string = this.negative ? '\u2212' : '';
		while (i >= 0) {
			string += this.value[i--];
		}
		return string;
	}
}

// Decimal representations of all the individual bit values in a 64-bit integer.
const BIT_VALUES = [
	new Uint8Array([1]),
	new Uint8Array([2]),
	new Uint8Array([4]),
	new Uint8Array([8]),
	new Uint8Array([6,1]),
	new Uint8Array([2,3]),
	new Uint8Array([4,6]),
	new Uint8Array([8,2,1]),
	new Uint8Array([6,5,2]),
	new Uint8Array([2,1,5]),
	new Uint8Array([4,2,0,1]),
	new Uint8Array([8,4,0,2]),
	new Uint8Array([6,9,0,4]),
	new Uint8Array([2,9,1,8]),
	new Uint8Array([4,8,3,6,1]),
	new Uint8Array([8,6,7,2,3]),
	new Uint8Array([6,3,5,5,6]),
	new Uint8Array([2,7,0,1,3,1]),
	new Uint8Array([4,4,1,2,6,2]),
	new Uint8Array([8,8,2,4,2,5]),
	new Uint8Array([6,7,5,8,4,0,1]),
	new Uint8Array([2,5,1,7,9,0,2]),
	new Uint8Array([4,0,3,4,9,1,4]),
	new Uint8Array([8,0,6,8,8,3,8]),
	new Uint8Array([6,1,2,7,7,7,6,1]),
	new Uint8Array([2,3,4,4,5,5,3,3]),
	new Uint8Array([4,6,8,8,0,1,7,6]),
	new Uint8Array([8,2,7,7,1,2,4,3,1]),
	new Uint8Array([6,5,4,5,3,4,8,6,2]),
	new Uint8Array([2,1,9,0,7,8,6,3,5]),
	new Uint8Array([4,2,8,1,4,7,3,7,0,1]),
	new Uint8Array([8,4,6,3,8,4,7,4,1,2]),
	new Uint8Array([6,9,2,7,6,9,4,9,2,4]),
	new Uint8Array([2,9,5,4,3,9,9,8,5,8]),
	new Uint8Array([4,8,1,9,6,8,9,7,1,7,1]),
	new Uint8Array([8,6,3,8,3,7,9,5,3,4,3]),
	new Uint8Array([6,3,7,6,7,4,9,1,7,8,6]),
	new Uint8Array([2,7,4,3,5,9,8,3,4,7,3,1]),
	new Uint8Array([4,4,9,6,0,9,7,7,8,4,7,2]),
	new Uint8Array([8,8,8,3,1,8,5,5,7,9,4,5]),
	new Uint8Array([6,7,7,7,2,6,1,1,5,9,9,0,1]),
	new Uint8Array([2,5,5,5,5,2,3,2,0,9,9,1,2]),
	new Uint8Array([4,0,1,1,1,5,6,4,0,8,9,3,4]),
	new Uint8Array([8,0,2,2,2,0,3,9,0,6,9,7,8]),
	new Uint8Array([6,1,4,4,4,0,6,8,1,2,9,5,7,1]),
	new Uint8Array([2,3,8,8,8,0,2,7,3,4,8,1,5,3]),
	new Uint8Array([4,6,6,7,7,1,4,4,7,8,6,3,0,7]),
	new Uint8Array([8,2,3,5,5,3,8,8,4,7,3,7,0,4,1]),
	new Uint8Array([6,5,6,0,1,7,6,7,9,4,7,4,1,8,2]),
	new Uint8Array([2,1,3,1,2,4,3,5,9,9,4,9,2,6,5]),
	new Uint8Array([4,2,6,2,4,8,6,0,9,9,9,8,5,2,1,1]),
	new Uint8Array([8,4,2,5,8,6,3,1,8,9,9,7,1,5,2,2]),
	new Uint8Array([6,9,4,0,7,3,7,2,6,9,9,5,3,0,5,4]),
	new Uint8Array([2,9,9,0,4,7,4,5,2,9,9,1,7,0,0,9]),
	new Uint8Array([4,8,9,1,8,4,9,0,5,8,9,3,4,1,0,8,1]),
	new Uint8Array([8,6,9,3,6,9,8,1,0,7,9,7,8,2,0,6,3]),
	new Uint8Array([6,3,9,7,2,9,7,3,0,4,9,5,7,5,0,2,7]),
	new Uint8Array([2,7,8,5,5,8,5,7,0,8,8,1,5,1,1,4,4,1]),
	new Uint8Array([4,4,7,1,1,7,1,5,1,6,7,3,0,3,2,8,8,2]),
	new Uint8Array([8,8,4,3,2,4,3,0,3,2,5,7,0,6,4,6,7,5]),
	new Uint8Array([6,7,9,6,4,8,6,0,6,4,0,5,1,2,9,2,5,1,1]),
	new Uint8Array([2,5,9,3,9,6,3,1,2,9,0,0,3,4,8,5,0,3,2]),
	new Uint8Array([4,0,9,7,8,3,7,2,4,8,1,0,6,8,6,1,1,6,4]),
	new Uint8Array([8,0,8,5,7,7,4,5,8,6,3,0,2,7,3,3,2,2,9]),
];
