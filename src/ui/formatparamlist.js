import {Create} from '../html/create';

const textFormatter = Object.freeze({
	start: () => [],
	collect: (parts, part) => {
		parts.push(part);
		return parts;
	},
	end: parts => parts.join(''),

	ref: () => 'ref ',
	param: param => param.name,
	optional: () => '?',
	variadic: () => '...',
	separator: () => ', ',
});

const htmlFormatter = Object.freeze({
	start: () => Create.fragment(),
	collect: (fragment, node) => {
		fragment.appendChild(node);
		return fragment;
	},
	end: fragment => fragment,

	ref: () => Create.span({class: 'name-modifiers'}, 'ref '),
	param: param => Create.text(param.name),
	optional: () => Create.sub(null, 'opt'),
	variadic: () => Create.text('...'),
	separator: () => Create.text(', '),
});

export const ParamListFormatter = Object.freeze({
	text: textFormatter,
	html: htmlFormatter,
});

export function formatParamList(overload, formatter) {
	formatter = formatter || textFormatter;

	var result = formatter.start();

	const parameters = overload.parameters;
	const paramCount = parameters.length;
	for (var i = 0; i < paramCount; i++) {
		if (i > 0) {
			result = formatter.collect(result, formatter.separator());
		}

		const param = parameters[i];
		if (param.isRef) {
			result = formatter.collect(result, formatter.ref());
		}

		result = formatter.collect(result, formatter.param(param));

		if (param.isVariadic) {
			result = formatter.collect(result, formatter.variadic());
		}
		else if (param.isOptional) {
			result = formatter.collect(result, formatter.optional());
		}
	}

	result = formatter.end(result);
	return result;
}
