import {ModuleMemberVisitor, MetaKind, MemberKind} from '../module/modulemember';
import {Create} from '../html/create';
import {Icon} from './icon';
import {makeExpandable} from './expander';
import {formatParamList, ParamListFormatter} from './formatparamlist';
import {formatRequiredVersion} from './formatrequiredversion';

const MEMBER_ATTR = {class: 'member'};
const TYPE_ATTR = {class: 'member member--type'};
const NAME_ATTR = {class: 'member-name member-link'};

export class SidebarRenderer extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.target = target;
	}

	clickMember(member) {
		this.target.raise('member.click', member);
	}

	registerElement(member, element) {
		this.target.registerElement(member, element);
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

	renderChildren(parentElem, items, startOpen) {
		if (items.length === 0) {
			return;
		}

		const list = Create.ul(null,
			items.map(item => item.accept(this))
		);

		makeExpandable(parentElem, startOpen);
		parentElem.appendChild(list);
	}

	visitModule(module) {
		const fragment = Create.fragment();

		fragment.appendChild(this.renderModuleInfo(module));
		fragment.appendChild(this.renderReferences(module));
		fragment.appendChild(module.members.accept(this));

		return fragment;
	}

	renderModuleInfo(module) {
		const memberList = Create.ul();
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(module, null, 'Module info', true),
			memberList
		);
		makeExpandable(elem, true);

		memberList.appendChild(
			Create.li(MEMBER_ATTR,
				this.renderName(module, null, ['Name: ', Create.b(null, module.name)])
			)
		);
		memberList.appendChild(
			Create.li(MEMBER_ATTR,
				this.renderName(module, null, ['Version: ', Create.b(null, module.version)])
			)
		);
		memberList.appendChild(module.metadata.accept(this));
		memberList.appendChild(module.strings.accept(this));

		this.registerElement(module, elem);
		return elem;
	}

	renderReferences(module) {
		var elem = Create.li(MEMBER_ATTR,
			this.renderName(module.moduleRefs, null, 'References', true)
		);

		this.renderChildren(elem, module.moduleRefs, true);

		this.registerElement(module.moduleRefs, elem);
		return elem;
	}

	visitMetadata(meta) {
		switch (meta.metaKind) {
			case MetaKind.STRING_TABLE:
				return this.renderStringTable(meta);
			case MetaKind.METADATA_TABLE:
				return this.renderMetadataTable(meta);
			default:
				throw new Error(`Unsupported meta kind: ${meta.metaKind}`);
		}
	}

	renderStringTable(table) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(table, null, 'String table')
		);
		this.registerElement(table, elem);
		return elem;
	}

	renderMetadataTable(table) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(table, null, 'Metadata table')
		);
		this.registerElement(table, elem);
		return elem;
	}

	visitModuleRef(module) {
		var elem = Create.li(MEMBER_ATTR,
			this.renderName(module, Icon.module, [
				module.name,
				' \u2013 ',
				Create.i(null, formatRequiredVersion(module.version, module.versionConstraint))
			])
		);

		this.renderChildren(elem, module.members);

		this.registerElement(module, elem);
		return elem;
	}

	visitTypeRef(type) {
		const elem = Create.li(TYPE_ATTR,
			this.renderName(type, Icon.typeRef, type.name)
		);

		if (type.memberCount > 0) {
			this.renderChildren(elem, type);
		}

		this.registerElement(type, elem);
		return elem;
	}

	visitMethodRef(method) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(method, Icon.methodRef, `${method.name}(...)`)
		);

		this.registerElement(method, elem);
		return elem;
	}

	visitFieldRef(field) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(field, Icon.fieldRef, field.name)
		);

		this.registerElement(field, elem);
		return elem;
	}

	visitFunctionRef(func) {
		return this.visitMethodRef(func);
	}

	visitNamespace(namespace, combinedPath) {
		// If the namespace has only a single child, and that child is also a namespace,
		// we (visually) combine the two into a single namespace. Instead of this:
		//   - {} one
		//     - {} two
		//       - {} three
		//         - Type
		// we show this:
		//   - {} one.two.three
		//     - Type
		// which is generally nicer to use.

		if (namespace.canCollapse) {
			return this.combineNamespaces(namespace, combinedPath);
		}

		var displayName;
		var startOpen;
		if (namespace.isGlobal) {
			displayName = 'Global';
			startOpen = true;
		}
		else if (combinedPath) {
			displayName = combinedPath.concat(namespace).map(ns => ns.name).join('.');
			startOpen = combinedPath[0].parent.isGlobal;
		}
		else {
			displayName = namespace.name;
			startOpen = false;
		}

		const elem = Create.li(MEMBER_ATTR,
			this.renderName(namespace, Icon.namespace, displayName, namespace.isGlobal)
		);

		const members = namespace.getMembersSorted()
		this.renderChildren(elem, members, startOpen);

		this.registerElement(namespace, elem);
		return elem;
	}

	combineNamespaces(namespace, combinedPath) {
		if (!combinedPath) {
			combinedPath = [];
		}

		if (!namespace.isGlobal) {
			combinedPath.push(namespace);
		}

		return namespace._onlyChild.accept(this, combinedPath);
	}

	visitType(type) {
		const elem = Create.li(TYPE_ATTR,
			this.renderName(type, Icon.type, type.name)
		);

		if (type.memberCount > 0) {
			this.renderChildren(elem, type);
		}

		this.registerElement(type, elem);
		return elem;
	}

	visitConstant(constant) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(constant, Icon.constant, constant.name)
		);

		this.registerElement(constant, elem);
		return elem;
	}

	visitFunction(func) {
		return Create.fragment(
			func.map(overload => overload.accept(this))
		);
	}

	visitField(field) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(field, Icon.field, field.name)
		);

		this.registerElement(field, elem);
		return elem;
	}

	visitMethod(method) {
		return Create.fragment(
			method.map(overload => overload.accept(this))
		);
	}

	visitOverload(overload) {
		const paramList = formatParamList(overload, ParamListFormatter.text);
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(overload, Icon.overload, [overload.name, '(', paramList, ')'])
		);

		this.registerElement(overload, elem);
		return elem;
	}

	visitProperty(property) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(property, Icon.property, property.name)
		);

		this.registerElement(property, elem);
		return elem;
	}

	visitOperator(operator) {
		const elem = Create.li(MEMBER_ATTR,
			this.renderName(operator, Icon.operator, `operator ${operator.name}`)
		);

		this.registerElement(operator, elem);
		return elem;
	}
}
