import {ModuleMemberVisitor, MemberKind, MetaKind} from '../module/modulemember';

const REGEX_META_CHARS = /[-\/\\^$*+?.()|[\]{}]/g;

function escapeRegex(str) {
	return str.replace(REGEX_META_CHARS, '\\$&');
}

function getFuzzyMatcher(component) {
	// Could be fuzzier, but it works
	return new RegExp(escapeRegex(component), 'i');
}

function getExactMatcher(component) {
	// Exact modulo case :)
	return new RegExp('^' + escapeRegex(component) + '$', 'i');
}

function parseSearchPath(query) {
	query = String(query);

	// Components may be quoted (in which case their contents are matched verbatim), or
	// they may be any sequence of non-period, non-quote, non-whitespace character. This
	// means you can search for something like this:
	//   osprey.compiler."Expression"
	// Or this:
	//   osprey syntax node
	// For the sake of usability, an unterminated double quote consumes everything up
	// to the end. Otherwise you get weird results when typing.
	const componentPattern = /"([^"]*)(?:"|$)|([^."\s]+)/g;
	const components = [];

	var match;
	while (match = componentPattern.exec(query)) {
		var component;

		if (match[1] !== undefined) {
			// Quoted
			component = match[1];
			if (component.length === 0) {
				continue;
			}

			component = getExactMatcher(match[1]);
		}
		else if (match[2]) {
			// Non-quoted, so a bit fuzzy
			component = match[2].trim();
			if (component.length === 0) {
				continue;
			}

			component = getFuzzyMatcher(component);
		}

		components.push(component);
	}

	// It's easier to loop from low index to high, so let's put the first tested
	// component first in the list.
	components.reverse();

	return components;
}

export class SearchQuery {
	constructor(components) {
		this.components = components;
		this.maxIndex = components ? components.length : 0;
		this.simpleMatch = components.length === 1 ? components[0] : null;
	}

	matchesSimple(name) {
		return this.simpleMatch && this.simpleMatch.test(name);
	}

	matchesFull(member) {
		if (this.maxIndex === 0) {
			return false;
		}

		const declaringModule = member.declaringModule;

		var index = 0;
		var component = this.components[0];

		while (
			index < this.maxIndex && member &&
			// Stop at the module boundary (we don't want to match against the module's name)
			member !== declaringModule
		) {
			if (component.test(member.name)) {
				// The member matched the current component. Keep walking "up" the dotted chain.
				index++;
				component = this.components[index];
			}
			else if (index === 0) {
				// First component has to match.
				break;
			}

			// Always walk up the member chain.
			member = member.parent;
		}

		// If index === maxIndex, it means the whole chain matches, so the member matches.
		return index === this.maxIndex;
	}

	static from(query) {
		if (query instanceof SearchQuery) {
			return query;
		}

		const components = parseSearchPath(query);
		return new SearchQuery(components);
	}
}

export class MemberFilter extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.getElement = target.getElement;
	}

	filter(member, query) {
		query = SearchQuery.from(query);
		return member.accept(this, query);
	}

	matchChildren(children, query) {
		var anyMatches = false;

		children.forEach(child => {
			const matches = child.accept(this, query);

			if (matches) {
				anyMatches = true;
			}
		});

		return anyMatches;
	}

	setMemberMatches(member, matches) {
		const element = this.getElement(member);

		// If we don't find an element, there are two possibilities:
		//   1. The member may genuinely not have a corresponding element (e.g. if
		//      it's a method group);
		//   2. The member is a namespace with only one namespace child, in which
		//      case that child has the element (unless it, too, has only one child
		//      that happens to be a namespace... recurse).
		// In case 1, there's nothing to do, so just ignore it. In case 2, the child
		// will eventually be searched, and we probably don't want to show it as a
		// match unless the child itself actually matches.

		if (element) {
			if (matches) {
				element.classList.add('member--match-search');
			}
			else {
				element.classList.remove('member--match-search');
			}
		}
	}

	visitModule(module, query) {
		// Modules themselves never match any search query, but their members do.

		const anyModuleRefMatches = module.moduleRefs.accept(this, query);

		const anyMemberMatches = module.members.accept(this, query);

		return anyModuleRefMatches || anyMemberMatches;
	}

	visitMetadata(meta, query) {
		if (meta.metaKind === MetaKind.REFERENCES) {
			return this.matchModuleReferences(meta, query);
		}

		return false;
	}

	matchModuleReferences(modules, query) {
		const anyChildMatches = this.matchChildren(modules, query);
		this.setMemberMatches(modules, anyChildMatches);
		return anyChildMatches;
	}

	visitModuleRef(module, query) {
		const selfMatches = query.matchesSimple(module);
		const anyChildMatches = module.members.accept(this, query);

		this.setMemberMatches(module, selfMatches || anyChildMatches);
		return selfMatches || anyChildMatches;
	}

	visitTypeRef(type, query) {
		const selfMatches = query.matchesFull(type);
		const anyChildMatches = this.matchChildren(type, query);

		this.setMemberMatches(type, selfMatches || anyChildMatches);
		return selfMatches || anyChildMatches;
	}

	visitMethodRef(method, query) {
		const selfMatches = query.matchesFull(method);
		this.setMemberMatches(method, selfMatches);
		return selfMatches;
	}

	visitFieldRef(field, query) {
		const selfMatches = query.matchesFull(field);
		this.setMemberMatches(field, selfMatches);
		return selfMatches;
	}

	visitFunctionRef(func, query) {
		const selfMatches = query.matchesFull(func);
		this.setMemberMatches(func, selfMatches);
		return selfMatches;
	}

	visitNamespace(namespace, query) {
		const selfMatches = query.matchesFull(namespace);

		// If the namespace has been collapsed with its children, i.e. if a structure like this:
		//   {} one
		//     {} two
		//       {} three
		// has been collapsed into
		//   {} one.two.three
		// then if 'one' or 'two' matches, the whole thing should be visible.
		//const collapsedMatch = selfMatches && namespace.canCollapse;
		const anyChildMatches = this.matchChildren(namespace, query);

		this.setMemberMatches(namespace, selfMatches || anyChildMatches);
		return selfMatches || anyChildMatches;
	}

	visitType(type, query) {
		const selfMatches = query.matchesFull(type);
		const anyChildMatches = this.matchChildren(type, query);

		this.setMemberMatches(type, selfMatches || anyChildMatches);
		return selfMatches || anyChildMatches;
	}

	visitConstant(constant, query) {
		const selfMatches = query.matchesFull(constant);
		this.setMemberMatches(constant, selfMatches);
		return selfMatches;
	}

	visitFunction(func, query) {
		return this.matchChildren(func, query);
	}

	visitField(field, query) {
		const selfMatches = query.matchesFull(field);
		this.setMemberMatches(field, selfMatches);
		return selfMatches;
	}

	visitMethod(method, query) {
		return this.matchChildren(method, query);
	}

	visitOverload(overload, query) {
		const selfMatches = query.matchesFull(overload);
		this.setMemberMatches(overload, selfMatches);
		return selfMatches;
	}

	visitProperty(property, query) {
		const selfMatches = query.matchesFull(property);
		this.setMemberMatches(property, selfMatches);
		return selfMatches;
	}

	visitOperator(operator, query) {
		const selfMatches = query.matchesFull(operator);
		this.setMemberMatches(operator, selfMatches);
		return selfMatches;
	}
}
