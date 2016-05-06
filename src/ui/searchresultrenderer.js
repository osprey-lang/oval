import {ModuleMemberVisitor, MetaKind, MemberKind} from '../module/modulemember';
import {Create} from '../html/create';
import {Icon} from './icon';
import {makeExpandable} from './expander';
import {formatParamList, ParamListFormatter} from './formatparamlist';

const MEMBER_ATTR = {class: 'member'};
const NAME_ATTR = {class: 'member-name member-link'};

export class SearchResultRenderer extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.target = target;
	}

	clickMember(member) {
		this.target.raise('member.click', member);
	}

	renderAll(members) {
		return Create.fragment(
			members.map(member => this.render(member))
		);
	}

	render(member) {
		return member.accept(this);
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

	visitModule(module) {
		throw new Error('Not supported (Module)');
	}

	renderReferences(module) {
		throw new Error('Not supported (ModuleRef)');
	}

	visitMetadata(meta) {
		throw new Error('Not supported (metadata table)');
	}

	visitModuleRef(module) {
		return Create.li(MEMBER_ATTR,
			this.renderName(module, Icon.module, [
				module.name, ' – ', Create.i(null, 'v', module.version)
			])
		);
	}

	visitTypeRef(type) {
		return Create.li(MEMBER_ATTR,
			this.renderName(type, Icon.typeRef, type.fullName)
		);
	}

	visitMethodRef(method) {
		return Create.li(MEMBER_ATTR,
			this.renderName(method, Icon.methodRef, `${method.fullName}(...)`)
		);
	}

	visitFieldRef(field) {
		return Create.li(MEMBER_ATTR,
			this.renderName(field, Icon.fieldRef, field.fullName)
		);
	}

	visitFunctionRef(func) {
		return this.visitMethodRef(func);
	}

	visitNamespace(namespace) {
		const displayName = namespace.isGlobal ? 'Global' : namespace.fullName;

		return Create.li(MEMBER_ATTR,
			this.renderName(namespace, Icon.namespace, displayName, namespace.isGlobal)
		);
	}

	visitType(type) {
		return Create.li(MEMBER_ATTR,
			this.renderName(type, Icon.type, type.fullName)
		);
	}

	visitConstant(constant) {
		return Create.li(MEMBER_ATTR,
			this.renderName(constant, Icon.constant, constant.fullName)
		);
	}

	visitFunction(func) {
		return Create.fragment(
			func.map(overload => overload.accept(this))
		);
	}

	visitField(field) {
		return Create.li(MEMBER_ATTR,
			this.renderName(field, Icon.field, field.fullName)
		);
	}

	visitMethod(method) {
		return Create.fragment(
			method.map(overload => overload.accept(this))
		);
	}

	visitOverload(overload) {
		const paramList = formatParamList(overload, ParamListFormatter.text);
		return Create.li(MEMBER_ATTR,
			this.renderName(overload, Icon.overload, [overload.fullName, '(', paramList, ')'])
		);
	}

	visitProperty(property) {
		return Create.li(MEMBER_ATTR,
			this.renderName(property, Icon.property, property.fullName)
		);
	}

	visitOperator(operator) {
		return Create.li(MEMBER_ATTR,
			this.renderName(operator, Icon.operator, operator.fullName)
		);
	}
}
