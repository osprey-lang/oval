import {ModuleMemberVisitor, MemberKind, MetaKind} from '../module/modulemember';
import {FilterWeights} from './filterweights';

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

	scoreMatch(regex, name) {
		const m = regex.exec(name);
		if (!m) {
			return 0;
		}

		// Full matches confer a large score.
		const matchLength = m[0].length;
		if (matchLength === name.length) {
			return FilterWeights.NAME_FULL;
		}

		// Matches at the very beginning a somewhat smaller but still respectable score.
		if (m.index === 0) {
			return FilterWeights.NAME_START;
		}

		// Other matches are scored based on their position in the word: the further down
		// the name, the smaller the score.
		const progress = 1 - m.index / (name.length - matchLength);
		return FilterWeights.NAME_PARTIAL_BASE + FilterWeights.NAME_PARTIAL * progress;
	}

	matchesSimple(name) {
		if (!this.simpleMatch) {
			return 0;
		}
		return this.scoreMatch(this.simpleMatch, name);
	}

	matchesFull(member) {
		if (this.maxIndex === 0) {
			return false;
		}

		const declaringModule = member.declaringModule;

		var totalScore = 0;
		var index = 0;
		var lastMatch = 0;
		var distanceFromStart = 0; // Number of ancestor steps from initial member
		var component = this.components[0];

		while (
			index < this.maxIndex && member &&
			// Stop at the module boundary (we don't want to match against the module's name)
			member !== declaringModule
		) {
			var score = this.scoreMatch(component, member.name);
			if (score > 0) {
				// The member matched the current component, let's calculate its final score.
				totalScore += score * FilterWeights.getAncestorFactor(distanceFromStart, distanceFromStart - lastMatch);
				lastMatch = distanceFromStart;

				// Keep walking "up" the dotted chain.
				index++;
				component = this.components[index];
			}
			else if (index === 0) {
				// First component has to match.
				break;
			}

			// Always walk up the member chain.
			member = member.parent;
			distanceFromStart++;
		}

		// If index === maxIndex, it means the whole chain matches, so the member matches.
		return index === this.maxIndex ? totalScore : 0;
	}

	getSimpleNameMatch(name) {
		if (!this.simpleMatch) {
			return null;
		}

		const match = this.simpleMatch.exec(name);
		return {
			index: match.index,
			length: match[0].length,
		};
	}

	getFullNameMatches(member) {
		if (this.maxIndex === 0) {
			return null;
		}

		const declaringModule = member.declaringModule;
		const matches = [];

		var index = 0;
		var component = this.components[0];

		while (
			index < this.maxIndex && member &&
			// Stop at the module boundary (we don't want to match against the module's name)
			member !== declaringModule
		) {
			const parent = member.parent;

			var match = component.exec(member.name);
			if (match) {
				// In the original member's name, the current member's name begins after
				// the dot following the parent's full name. To get this member name's
				// index in the full name, we add this offset.
				const memberNameStartIndex =
					// Note: global namespace has no name
					parent && parent !== declaringModule && parent.fullName !== null
						// fullName + dot
						? parent.fullName.length + 1
						// No preceding parent, so distance 0
						: 0;

				// Components are ordered back-to-front, but we want the matches to go
				// from low to high character index. It's probably better to unshift
				// here than to sort later.
				matches.unshift({
					index: match.index + memberNameStartIndex,
					length: match[0].length,
				});

				// Keep walking "up" the dotted chain.
				index++;
				component = this.components[index];
			}
			else if (index === 0) {
				// First component has to match.
				break;
			}

			// Always walk up the member chain.
			member = parent;
		}

		// If index === maxIndex, it means the whole chain matches, so the member matches.
		return index === this.maxIndex ? matches : null;
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
	constructor() {
		super();
	}

	filter(member, query) {
		query = SearchQuery.from(query);
		this.results = [];
		member.accept(this, query);

		return this.results
			// Sort by score (highest first), then by name.
			.sort((a, b) => {
				if (a.score !== b.score) {
					return b.score - a.score;
				}
				a = a.member;
				b = b.member;

				// Generally we want global members first; the MemberKind values
				// are deliberately ordered that way.
				if (a.kind !== b.kind) {
					return a.kind - b.kind;
				}

				if (a.fullName < b.fullName) {
					return -1;
				}
				if (a.fullName > b.fullName) {
					return 1;
				}
				return 0;
			})
			// We only want to expose the member at the moment
			.map(r => r.member);
	}

	matchChildren(children, query) {
		children.forEach(child => child.accept(this, query));
	}

	addResult(member, score) {
		this.results.push({
			member: member,
			score: score,
		});
	}

	visitModule(module, query) {
		// Modules themselves never match any search query, but their members do.
		module.moduleRefs.accept(this, query);
		module.members.accept(this, query);
	}

	visitMetadata(meta, query) {
		if (meta.metaKind === MetaKind.REFERENCES) {
			this.matchModuleReferences(meta, query);
		}
	}

	matchModuleReferences(modules, query) {
		this.matchChildren(modules, query);
	}

	visitModuleRef(module, query) {
		const score = query.matchesSimple(module.name);
		if (score > 0) {
			this.addResult(module, score);
		}
		module.members.accept(this, query);
	}

	visitTypeRef(type, query) {
		const score = query.matchesFull(type);
		if (score > 0) {
			this.addResult(type, score);
		}
		this.matchChildren(type, query);
	}

	visitMethodRef(method, query) {
		const score = query.matchesFull(method);
		if (score > 0) {
			this.addResult(method, score);
		}
	}

	visitFieldRef(field, query) {
		const score = query.matchesFull(field);
		if (score > 0) {
			this.addResult(field, score);
		}
	}

	visitFunctionRef(func, query) {
		const score = query.matchesFull(func);
		if (score > 0) {
			this.addResult(func, score);
		}
	}

	visitNamespace(namespace, query) {
		if (!namespace.isGlobal) {
			const score = query.matchesFull(namespace);
			if (score > 0) {
				this.addResult(namespace, score);
			}
		}
		this.matchChildren(namespace, query);
	}

	visitType(type, query) {
		const score = query.matchesFull(type);
		if (score > 0) {
			this.addResult(type, score);
		}
		this.matchChildren(type, query);
	}

	visitConstant(constant, query) {
		const score = query.matchesFull(constant);
		if (score > 0) {
			this.addResult(constant, score);
		}
	}

	visitFunction(func, query) {
		this.matchChildren(func, query);
	}

	visitField(field, query) {
		const score = query.matchesFull(field);
		if (score > 0) {
			this.addResult(field, score);
		}
	}

	visitMethod(method, query) {
		this.matchChildren(method, query);
	}

	visitOverload(overload, query) {
		const score = query.matchesFull(overload);
		if (score > 0) {
			this.addResult(overload, score);
		}
	}

	visitProperty(property, query) {
		const score = query.matchesFull(property);
		if (score > 0) {
			this.addResult(property, score);
		}
	}

	visitOperator(operator, query) {
		const score = query.matchesFull(operator);
		if (score > 0) {
			this.addResult(operator, score);
		}
	}
}
