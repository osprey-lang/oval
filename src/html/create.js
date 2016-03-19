const join = [].join;

const isEventHandler = /^on/;

function booleanAttribute(elem, name, value) {
	elem[name] = !!value;
}

const specialAttributes = {
	// Classes can be specified as an array or a single string.
	class: (elem, name, value) => {
		if (Array.isArray(value)) {
			for (var i = 0; i < value.length; i++) {
				elem.classList.add(value[i]);
			}
		}
		else {
			elem.className = String(value);
		}
	},

	checked: booleanAttribute,
	disabled: booleanAttribute,
};

function isAppendableNode(obj) {
	// Good enough for our needs!
	return obj != null && obj.nodeType !== undefined;
}

function setAttributes(elem, attrs) {
	for (var name in attrs) {
		if (!attrs.hasOwnProperty(name)) {
			continue;
		}

		const value = attrs[name];

		if (isEventHandler.test(name)) {
			elem.addEventListener(name.substr(2), value, false);
		}
		else if (specialAttributes.hasOwnProperty(name)) {
			specialAttributes[name](elem, name, value);
		}
		else {
			elem.setAttribute(name, value);
		}
	}
}

// Note: previously there was an appendChildren function that took a
// parent node, an array-like value, and a start index. Unfortunately
// it performed too poorly, primarily because 'arguments' was often
// passed to it. We get much better performance when inlining it as
// a for loop.

function appendChild(parent, child) {
	if (!isAppendableNode(child)) {
		// Deliberately allow null and undefined to be ignored. This makes it
		// easier to exclude certain content by simply setting it to null,
		// without having multiple (incompatible) parameter lists and such.
		if (child == null) {
			return;
		}

		if (Array.isArray(child)) {
			for (var i = 0; i < child.length; i++) {
				appendChild(parent, child[i]);
			}
			return;
		}
		else {
			child = createText(child);
		}
	}

	parent.appendChild(child);
}

function createText(value) {
	var text;
	if (arguments.length === 1) {
		text = String(value);
	}
	else {
		text = '';
		for (var i = 0; i < arguments.length; i++) {
			text += arguments[i];
		}
	}
	return document.createTextNode(text);
}

function createElem(tag, attrs) {
	const elem = document.createElement(tag);

	if (attrs) {
		setAttributes(elem, attrs);
	}

	if (arguments.length > 2) {
		for (var i = 2; i < arguments.length; i++) {
			appendChild(elem, arguments[i]);
		}
	}

	return elem;
}

function createFragment() {
	const fragment = document.createDocumentFragment();

	if (arguments.length > 0) {
		for (var i = 0; i < arguments.length; i++) {
			appendChild(fragment, arguments[i]);
		}
	}

	return fragment;
}

export const Create = Object.freeze({
	text: createText,
	elem: createElem,
	fragment: createFragment,

	// Block-level elements
	div: createElem.bind(null, 'div'),
	ul: createElem.bind(null, 'ul'),
	li: createElem.bind(null, 'li'),
	p: createElem.bind(null, 'p'),

	// Inline and inline-block elements
	span: createElem.bind(null, 'span'),
	sub: createElem.bind(null, 'sub'),
	b: createElem.bind(null, 'b'),
	i: createElem.bind(null, 'i'),
});
