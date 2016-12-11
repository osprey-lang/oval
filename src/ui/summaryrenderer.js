import {ModuleMemberVisitor, MetaKind, MemberKind} from '../module/modulemember';
import {Create} from '../html/create';
import {formatParamList, ParamListFormatter} from './formatparamlist';

const MODIFIERS_ATTR = {class: 'name-modifiers'};
const LINK_ATTR = {class: 'member-link'};

export const SummaryRenderOptions = Object.freeze({
	FULL_NAME: 1,
	NO_LINK: 2,
});

export class SummaryRenderer extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.target = target;
		this.paramListFormatter = ParamListFormatter.html;
		this.paramListFormatterStack = [];
	}

	pushParamListFormatter(value) {
		this.paramListFormatterStack.push(this.paramListFormatter);
		this.paramListFormatter = value;
	}

	popParamListFormatter() {
		if (this.paramListFormatterStack.length > 0) {
			this.paramListFormatter = this.paramListFormatterStack.pop();
		}
	}

	clickMember(member) {
		this.target.raise('member.select', member);
	}

	renderLink(member, contents) {
		const link = Create.span(LINK_ATTR, contents);
		link.addEventListener('click', () => this.clickMember(member), false);
		return link;
	}

	renderName(member, options, contents) {
		const displayName = contents
			? contents
			: (options & SummaryRenderOptions.FULL_NAME) ? member.fullName : member.name;
		return (options & SummaryRenderOptions.NO_LINK) ? displayName : this.renderLink(member, displayName);
	}

	getModifiers(member, memberKind) {
		var modifiers = '';

		if (member.isPublic) {
			modifiers += 'public ';
		}
		else if (member.isInternal) {
			modifiers += 'internal ';
		}
		else if (member.isProtected) {
			modifiers += 'protected ';
		}
		else if (member.isPrivate) {
			modifiers += 'private ';
		}

		// Don't output 'static' when we're dealing with a constant field,
		// since 'static const' looks weird.
		if (member.isStatic && !member.hasValue) {
			modifiers += 'static ';
		}
		if (member.isAbstract) {
			modifiers += 'abstract ';
		}
		if (member.isVirtual) {
			modifiers += 'virtual ';
		}
		if (member.isSealed) {
			modifiers += 'sealed ';
		}
		if (member.isOverride) {
			modifiers += 'override ';
		}
		if (member.isPrimitive) {
			modifiers += 'primitive ';
		}
		if (member.isNative) {
			modifiers += 'native ';
		}
		if (member.isCtor) {
			modifiers += 'ctor ';
		}
		if (member.isImpl) {
			modifiers += 'impl ';
		}
		if (member.isReadOnly) {
			modifiers += 'readonly ';
		}
		if (member.isWriteOnly) {
			modifiers += 'writeonly ';
		}

		return Create.span(MODIFIERS_ATTR,
			modifiers, Create.i(null, memberKind)
		);
	}

	getImportedModifiers(memberKind) {
		return Create.span(MODIFIERS_ATTR,
			'imported ', Create.i(null, memberKind)
		);
	}

	visitModule(module, options) {
		return Create.fragment(
			Create.i(MODIFIERS_ATTR, 'module '),
			this.renderName(module, options)
		);
	}

	visitMetadata(meta, options) {
		const renderLink = !(options & SummaryRenderOptions.NO_LINK);

		var displayName;
		switch (meta.metaKind) {
			case MetaKind.STRING_TABLE:
				displayName = 'String table';
				break;
			case MetaKind.METADATA_TABLE:
				displayName = 'Metadata table';
				break;
			case MetaKind.REFERENCES:
				displayName = 'References';
				break;
			default:
				throw new Error(`Unsupported meta kind: ${meta.metaKind}`);
		}

		return renderLink ? this.renderLink(meta, displayName) : Create.text(displayName);
	}

	visitModuleRef(module, options) {
		return Create.fragment(
			this.getImportedModifiers('module'),
			' ',
			this.renderName(module, options)
		);
	}

	visitTypeRef(type, options) {
		return Create.fragment(
			this.getImportedModifiers('class'),
			' ',
			this.renderName(type, options)
		);
	}

	visitMethodRef(method, options) {
		const displayName = (options & SummaryRenderOptions.FULL_NAME) ? method.fullName : method.name;
		const name = (options & SummaryRenderOptions.NO_LINK)
			? displayName + '(...)'
			: this.renderLink(method, displayName + '(...)');

		return Create.fragment(
			this.getImportedModifiers('method'),
			' ',
			name
		);
	}

	visitFieldRef(field, options) {
		return Create.fragment(
			this.getImportedModifiers('field'),
			' ',
			this.renderName(field, options)
		);
	}

	visitFunctionRef(func, options) {
		return this.visitMethodRef(func, options);
	}

	visitNamespace(namespace, options) {
		if (namespace.name === null) {
			return Create.fragment(
				this.renderName(namespace, options, 'Global declaration space')
			);
		}
		else {
			return Create.fragment(
				Create.i(MODIFIERS_ATTR, 'namespace '),
				this.renderName(namespace, options)
			);
		}
	}

	visitType(type, options) {
		return Create.fragment(
			this.getModifiers(type, 'class'),
			' ',
			this.renderName(type, options)
		);
	}

	visitConstant(constant, options) {
		return Create.fragment(
			this.getModifiers(constant, 'const'),
			' ',
			this.renderName(constant, options)
		);
	}

	visitFunction(func, options) {
		return Create.fragment(
			this.getModifiers(func, 'method group'),
			' ',
			this.renderName(func, options)
		);
	}

	visitField(field, options) {
		return Create.fragment(
			this.getModifiers(field, field.hasValue ? 'const' : 'field'),
			' ',
			this.renderName(field, options)
		);
	}

	visitMethod(method, options) {
		return Create.fragment(
			this.getModifiers(method, 'method group'),
			' ',
			this.renderName(method, options)
		);
	}

	visitOverload(overload, options) {
		const displayName = (options & SummaryRenderOptions.FULL_NAME) ? overload.fullName : overload.name;
		const paramList = formatParamList(overload, this.paramListFormatter);

		const name = (options & SummaryRenderOptions.NO_LINK)
			? [displayName, '(', paramList, ')']
			: this.renderLink(overload, [displayName, '(', paramList, ')']);

		return Create.fragment(
			this.getModifiers(overload, 'method'),
			' ',
			name
		);
	}

	visitProperty(property, options) {
		return Create.fragment(
			this.getModifiers(property, 'property'),
			' ',
			this.renderName(property, options)
		);
	}

	visitOperator(operator, options) {
		return Create.fragment(
			this.getModifiers(operator, 'operator'),
			' ',
			this.renderName(operator, options)
		);
	}
}
