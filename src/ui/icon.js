import {Create} from '../html/create';
import {requireResource} from '../resource';

requireResource('img/icons.svg', response => {
	var svgText = response.responseText;
	// Strip the <?xml ?> directive from the response
	svgText = svgText.replace(/<\?xml [^>]*\?>/, '');

	// Quick and dirty!
	const container = Create.div({class: 'resource'});
	container.innerHTML = svgText;

	document.body.appendChild(container);
});

const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_XLINK = 'http://www.w3.org/1999/xlink';

// cloneNode() turns out to perform slightly better than repeatedly
// calling createElementNS() and setAttributeNS(), so let's create
// some prototype nodes that we can clone.

const ICON_PROTOTYPE = (() => {
	const svg = document.createElementNS(NS_SVG, 'svg');
	svg.classList.add('member-icon');

	const use = document.createElementNS(NS_SVG, 'use');
	svg.appendChild(use);

	return svg;
})();

const BADGE_PROTOTYPE = (() => {
	const use = document.createElementNS(NS_SVG, 'use');
	use.classList.add('member-icon__badge');
	return use;
})();

export function makeIcon(iconName) {
	const svg = ICON_PROTOTYPE.cloneNode(true);
	const use = svg.childNodes[0];
	use.setAttributeNS(NS_XLINK, 'href', `#icon-${iconName}`);
	return svg;
}

export function addBadge(icon, badgeName) {
	const badge = BADGE_PROTOTYPE.cloneNode(true);
	badge.setAttributeNS(NS_XLINK, 'href', `#badge-${badgeName}`);
	icon.appendChild(badge);
}

export const Icon = Object.freeze({
	module() {
		return makeIcon('module');
	},

	typeRef() {
		const icon = makeIcon('type');
		addBadge(icon, 'ref');

		return icon;
	},

	methodRef() {
		const icon = makeIcon('method');
		addBadge(icon, 'ref');

		return icon;
	},

	fieldRef() {
		const icon = makeIcon('field');
		addBadge(icon, 'ref');

		return icon;
	},

	namespace() {
		return makeIcon('namespace');
	},

	type(type) {
		const icon = makeIcon(type.isAbstract ? 'type-abstract' : 'type');

		if (type.isInternal) {
			addBadge(icon, 'internal');
		}

		return icon;
	},

	field(field) {
		const icon = makeIcon('field');

		if (field.isInternal) {
			addBadge(icon, 'internal');
		}
		else if (field.isProtected) {
			addBadge(icon, 'protected');
		}
		else if (field.isPrivate) {
			addBadge(icon, 'private');
		}

		return icon;
	},

	overload(overload) {
		const icon = makeIcon(overload.isAbstract ? 'method-abstract' : 'method');

		if (overload.isInternal) {
			addBadge(icon, 'internal');
		}
		else if (overload.isProtected) {
			addBadge(icon, 'protected');
		}
		else if (overload.isPrivate) {
			addBadge(icon, 'private');
		}

		return icon;
	},

	property(property) {
		const icon = makeIcon(property.isAbstract ? 'property-abstract' : 'property');

		if (property.isInternal) {
			addBadge(icon, 'internal');
		}
		else if (property.isProtected) {
			addBadge(icon, 'protected');
		}
		else if (property.isPrivate) {
			addBadge(icon, 'private');
		}

		return icon;
	},

	operator() {
		return makeIcon('operator');
	},

	constant(constant) {
		const icon = makeIcon('field');

		if (constant.isInternal) {
			addBadge(icon, 'internal');
		}

		return icon;
	},

	baseType() {
		return makeIcon('base-type');
	},

	sharedType() {
		return makeIcon('shared-type');
	},

	derivedTypes() {
		return makeIcon('derived-types');
	},
});
