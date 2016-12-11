import {ModuleMemberVisitor, MetaKind, MemberKind} from '../module/modulemember';
import {Create} from '../html/create';
import {Icon} from './icon';
import {makeExpandable} from './expander';
import {formatParamList, ParamListFormatter} from './formatparamlist';
import {formatRequiredVersion} from './formatrequiredversion';

const MEMBER_ATTR = {class: 'member'};
const NAME_ATTR = {class: 'member-name member-link'};

function highlightSimpleNameMatch(name, query) {
	const match = query.getSimpleNameMatch(name);
	if (match === null) {
		throw new Error('Cannot highlight matches of non-matching member');
	}

	return [
		name.substr(0, match.index),
		Create.b(null, name.substr(match.index, match.length)),
		name.substr(match.index + match.length)
	];
}

function highlightFullNameMatches(member, query) {
	const matches = query.getFullNameMatches(member);
	if (matches === null) {
		throw new Error('Cannot highlight matches of non-matching member');
	}

	const fullName = member.fullName;

	if (matches.length === 1) {
		// Common case, let's optimize for that
		const match = matches[0];
		return [
			fullName.substr(0, match.index),
			Create.b(null, fullName.substr(match.index, match.length)),
			fullName.substr(match.index + match.length)
		];
	}
	else {
		const parts = [];

		// This code is optimized for creating the smallest number of nodes, which
		// is usually the most expensive operation. If you change it, keep that in
		// mind!
		var lastEndIndex = 0;
		for (var i = 0; i < matches.length; i++) {
			const match = matches[i];

			// Append any text that comes between this match and the last.
			if (match.index !== lastEndIndex) {
				parts.push(fullName.substr(lastEndIndex, match.index - lastEndIndex));
			}

			// Append a <b> element for the match.
			parts.push(
				Create.b(null, fullName.substr(match.index, match.length))
			);

			lastEndIndex = match.index + match.length;
		}

		// Append remaining text, if the last match didn't run up to the end.
		if (lastEndIndex !== fullName.length) {
			parts.push(fullName.substr(lastEndIndex));
		}

		return parts;
	}
}

export class SearchResultRenderer extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.target = target;
	}

	clickMember(member) {
		this.target.raise('member.select', member);
	}

	renderAll(members, query) {
		return Create.fragment(
			members.map(member => this.render(member, query))
		);
	}

	render(member, query) {
		return member.accept(this, query);
	}

	renderName(member, icon, contents, generated) {
		const elem = Create.span(
			NAME_ATTR,
			icon && icon(member),
			contents
		);
		if (generated) {
			elem.classList.add('member-name--automatic');
		}

		elem.addEventListener('click', () => this.clickMember(member), false);

		return elem;
	}

	visitModule(module, query) {
		throw new Error('Not supported (Module)');
	}

	renderReferences(module, query) {
		throw new Error('Not supported (ModuleRef)');
	}

	visitMetadata(meta, query) {
		throw new Error('Not supported (metadata table)');
	}

	visitModuleRef(module, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(module, Icon.module, [
				highlightSimpleNameMatch(module.name, query),
				' \u2013 ',
				Create.i(null, formatRequiredVersion(module.version, module.versionConstraint))
			])
		);
	}

	visitTypeRef(type, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				type,
				Icon.typeRef,
				highlightFullNameMatches(type, query)
			)
		);
	}

	visitMethodRef(method, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				method,
				Icon.methodRef,
				[highlightFullNameMatches(method, query), '(...)']
			)
		);
	}

	visitFieldRef(field, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				field,
				Icon.fieldRef,
				highlightFullNameMatches(field, query)
			)
		);
	}

	visitFunctionRef(func, query) {
		return this.visitMethodRef(func, query);
	}

	visitNamespace(namespace, query) {
		if (namespace.isGlobal) {
			throw new Error('Cannot render global namespace search result');
		}
		return Create.li(MEMBER_ATTR,
			this.renderName(
				namespace,
				Icon.namespace,
				highlightFullNameMatches(namespace, query),
				namespace.isGlobal
			)
		);
	}

	visitType(type, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(type, Icon.type, highlightFullNameMatches(type, query))
		);
	}

	visitConstant(constant, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				constant,
				Icon.constant,
				highlightFullNameMatches(constant, query)
			)
		);
	}

	visitFunction(func, query) {
		return Create.fragment(
			func.map(overload => overload.accept(this, query))
		);
	}

	visitField(field, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				field,
				Icon.field,
				highlightFullNameMatches(field, query)
			)
		);
	}

	visitMethod(method, query) {
		return Create.fragment(
			method.map(overload => overload.accept(this, query))
		);
	}

	visitOverload(overload, query) {
		const paramList = formatParamList(overload, ParamListFormatter.text);
		return Create.li(MEMBER_ATTR,
			this.renderName(
				overload,
				Icon.overload,
				[highlightFullNameMatches(overload, query), '(', paramList, ')']
			)
		);
	}

	visitProperty(property, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				property,
				Icon.property,
				highlightFullNameMatches(property, query)
			)
		);
	}

	visitOperator(operator, query) {
		return Create.li(MEMBER_ATTR,
			this.renderName(
				operator,
				Icon.operator,
				highlightFullNameMatches(operator, query)
			)
		);
	}
}
