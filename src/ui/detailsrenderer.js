import {ModuleMemberVisitor, MetaKind, MemberKind} from '../module/modulemember';
import {Create} from '../html/create';
import {Icon} from './icon';
import {formatParamList, ParamListFormatter} from './formatparamlist';
import {formatRequiredVersion} from './formatrequiredversion';
import {SummaryRenderer, SummaryRenderOptions} from './summaryrenderer';
import {MemberListRenderer, MemberListRenderOptions} from './memberlistrenderer';
import {ConstantValueRenderer, formatInt, formatReal, formatToken} from './constantvaluerenderer';
import {MethodBodyRenderer, RenderedMethodData} from './methodbodyrenderer';

const STRING_TYPE = 'aves.String';

const MEMBER_ATTR = {class: 'member'};
const LINK_ATTR = {class: 'member-link'};
const MEMBER_LIST_ATTR = {class: 'member-list'};
const LIST_CAPTION_ATTR = {class: 'list-caption'};
const STRING_ATTR = {class: 'constant-string'};
const STRING_BLOCK_ATTR = {class: 'string-block'};
const PARAM_ATTR = {class: 'code-item code-item--param'};

export class DetailsRenderer extends ModuleMemberVisitor {
	constructor(target) {
		super();

		this.target = target;
		this.nameElem = target.current;
		this.parentElem = target.parent;
		this.detailsElem = target.details;

		this.summaryRenderer = new SummaryRenderer(target);
		this.constantRenderer = new ConstantValueRenderer(target);
		this.memberListRenderer = new MemberListRenderer(
			this.summaryRenderer,
			this.constantRenderer
		);
		this.methodBodyRenderer = new MethodBodyRenderer(target);
	}

	clickMember(member) {
		this.target.raise('member.click', member);
	}

	render(member) {
		this.nameElem.innerHTML = '';
		this.parentElem.innerHTML = '';
		this.detailsElem.innerHTML = '';

		// this.nameElem is rendered each member's visit method. This is to permit method
		// overloads to override the default appearance (parameters are made clickable).

		if (member.parent) {
			this.parentElem.appendChild(member.parent.accept(this.summaryRenderer, SummaryRenderOptions.FULL_NAME));
		}
		else {
			this.parentElem.appendChild(this.renderNoParent())
		}

		this.detailsElem.appendChild(member.accept(this));
	}

	renderName(member) {
		this.nameElem.appendChild(member.accept(this.summaryRenderer, SummaryRenderOptions.NO_LINK));
	}

	renderNoParent() {
		return Create.i(null, 'This item has no parent');
	}

	renderNoMoreDetails() {
		return Create.p(null, 'No detailed information is available for this item.');
	}

	renderLink(member, contents) {
		const link = Create.span(LINK_ATTR, contents);
		link.addEventListener('click', () => this.clickMember(member), false);
		return link;
	}

	renderDeclaringModule(module) {
		return Create.p(null,
			'Imported from: ',
			this.renderLink(module, [
				`${module.name} \u2013 `,
				Create.i(null, formatRequiredVersion(module.version, module.versionConstraint))
			])
		);
	}

	renderDerivedTypes(type) {
		var expandButton = null;
		var paragraph = null;

		const expandDerivedTypes = () => {
			const derivedTypesList = this.renderDerivedTypesList(type);

			paragraph.parentNode.insertBefore(derivedTypesList, paragraph.nextSibling);
			paragraph.removeChild(expandButton);
		};

		expandButton = Create.elem('button',
			{class: 'button--inline', onclick: expandDerivedTypes},
			'Show'
		);

		paragraph = Create.p(null,
			Create.i(null, 'Derived types: '), expandButton
		);

		return paragraph;
	}

	renderDerivedTypesList(type) {
		const derivedTypes = type.derivedTypes
			.slice(0)
			.sort((a, b) => {
				if (a.fullName < b.fullName) {
					return -1;
				}
				if (a.fullName > b.fullName) {
					return 1;
				}
				return 0;
			});

		return Create.ul({class: 'derived-types'},
			derivedTypes.map(derivedType =>
				Create.li(MEMBER_ATTR, this.renderLink(derivedType, derivedType.fullName))
			)
		);
	}

	visitModule(module) {
		this.renderName(module);

		const fragment = Create.fragment();

		this.renderModuleInfo(module, fragment);
		this.renderModuleReferences(module, fragment);
		this.renderMainNamespaces(module, fragment);

		return fragment;
	}

	renderModuleInfo(module, parent) {
		parent.appendChild(
			Create.p(LIST_CAPTION_ATTR, 'Module information:')
		);

		const moduleInfo = Create.ul(null,
			Create.li(null, 'Name: ', Create.b(null, module.name)),
			Create.li(null, 'Version: ', Create.b(null, module.version))
		);

		if (module.nativeLibrary) {
			moduleInfo.appendChild(
				Create.li(null, 'Native library: ', Create.b(null, module.nativeLibrary))
			);
		}

		// Show some basic metadata, if it exists
		this.renderAuthor(module, moduleInfo);
		this.renderLicense(module, moduleInfo);

		parent.appendChild(moduleInfo);

		if (module.mainMethod) {
			parent.appendChild(
				this.renderImplementingMethod('Main method: ', module.mainMethod)
			);
		}
	}

	renderAuthor(module, parent) {
		const author = module.metadata.get('author');
		const authorUrl = module.metadata.get('author_url');

		if (!author && !authorUrl) {
			return;
		}

		const authorName = authorUrl
			? Create.elem('a', {href: authorUrl, title: authorUrl, target: '_blank'}, author || authorUrl)
			: Create.b(null, author);

		parent.appendChild(
			Create.li(null, 'Author: ', authorName)
		);
	}

	renderLicense(module, parent) {
		const license = module.metadata.get('license');
		const licenseUrl = module.metadata.get('license_url');

		if (!license && !licenseUrl) {
			return;
		}

		const licenseName = licenseUrl
			? Create.elem('a', {href: licenseUrl, title: licenseUrl, target: '_blank'}, license || licenseUrl)
			: Create.b(null, license);

		parent.appendChild(
			Create.li(null, 'License: ', licenseName)
		);
	}

	renderModuleReferences(module, parent) {
		if (module.moduleRefs.length > 0) {
			parent.appendChild(
				Create.p(LIST_CAPTION_ATTR, 'Module references:')
			);
			parent.appendChild(
				Create.ul(MEMBER_LIST_ATTR,
					module.moduleRefs.map(moduleRef => moduleRef.accept(this.memberListRenderer))
				)
			);
		}
		else {
			parent.appendChild(
				Create.p(LIST_CAPTION_ATTR, 'Module references: ', Create.i(null, '(none)'))
			);
		}
	}

	renderMainNamespaces(module, parent) {
		const mainNamespaces = this.findMainNamespaces(module);

		if (mainNamespaces.length > 0) {
			parent.appendChild(
				Create.p(LIST_CAPTION_ATTR, 'Main namespaces:')
			);

			this.memberListRenderer.pushSettings(MemberListRenderOptions.FULL_NAME);
			parent.appendChild(
				Create.ul(MEMBER_LIST_ATTR,
					mainNamespaces.map(namespace => namespace.accept(this.memberListRenderer))
				)
			);
			this.memberListRenderer.popSettings();
		}
		else {
			parent.appendChild(
				Create.p(LIST_CAPTION_ATTR, 'Main namespaces: ', Create.i(null, 'unable to determine'))
			);
		}
	}

	findMainNamespaces(module) {
		// Collapse consecutive namespace like in the sidebar: if the namespace
		// only has one child, and that child is a namespace, we use that child.
		// So if you have a namespace structure like this:
		//   osprey
		//     compiler
		//       extensions
		//         (everything in here)
		// the primary namespace will be shown as osprey.compiler.extensions,
		// rather than osprey.
		const namespace = this.collapseNamespace(module.members);

		if (namespace.isGlobal) {
			// If we're left with the global declaration space, the module probably
			// has its members spread out across various namespaces. Find namespaces
			// inside the global declaration space and collapse them instead. If the
			// module has members like this:
			//   alpha
			//     beta
			//       gamma
			//         (some stuff here)
			//   one
			//     two
			//       (rest goes here)
			// Its primary namespaces will be alpha.beta.gamma and one.two.
			return namespace.getMembers()
				.filter(member => member.kind === MemberKind.NAMESPACE)
				.map(namespace => this.collapseNamespace(namespace));
		}
		else {
			// If we /don't/ have the global declaration space here, we must have
			// traversed down into a namespace somewhere.
			return [namespace];
		}
	}

	collapseNamespace(namespace) {
		while (namespace.canCollapse) {
			namespace = namespace._onlyChild;
		}

		return namespace;
	}

	visitMetadata(meta) {
		this.renderName(meta);

		switch (meta.metaKind) {
			case MetaKind.STRING_TABLE:
				return this.renderStringTable(meta);
			case MetaKind.METADATA_TABLE:
				return this.renderMetadataTable(meta);
			case MetaKind.REFERENCES:
				return this.renderReferences(meta);
			default:
				throw new Error(`Unsupported meta kind: ${meta.metaKind}`);
		}
	}

	renderStringTable(table) {
		if (table.length > 0) {
			const fragment = Create.fragment(
				Create.p(null, `Total strings: ${table.length}`),

				Create.elem('dl', null,
					table.map((string, token) => [
						Create.elem('dt', null, Create.elem('code', null, formatToken(token))),
						Create.elem('dd', STRING_BLOCK_ATTR, Create.span(STRING_ATTR, string))
					])
				)
			);

			return fragment;
		}
		else {
			return Create.p(null, 'This module defines no string values.');
		}
	}

	renderMetadataTable(table) {
		if (table.length > 0) {
			const fragment = Create.fragment(
				Create.p(null, `Total metadata entries: ${table.length}`),

				Create.elem('dl', null,
					table.map((key, value) => [
						Create.elem('dt', null, '"', Create.span(STRING_ATTR, key), '":'),
						Create.elem('dd', STRING_BLOCK_ATTR, Create.span(STRING_ATTR, value))
					])
				)
			);

			return fragment;
		}
		else {
			return Create.p(null, 'This module contains no metadata entries.');
		}
	}

	renderReferences(meta) {
		if (meta.length > 0) {
			const memberList = Create.ul(MEMBER_LIST_ATTR,
				meta.map(member => member.accept(this.memberListRenderer))
			);

			return memberList;
		}
		else {
			return Create.p(null, 'This module has no references.');
		}
	}

	visitModuleRef(module) {
		this.renderName(module);

		var importedMembers;

		if (module.members.memberCount > 0) {
			this.memberListRenderer.pushSettings(MemberListRenderOptions.TRAVERSE_NAMESPACES | MemberListRenderOptions.FULL_NAME);

			const memberList = Create.ul(MEMBER_LIST_ATTR,
				module.members.map(member => member.accept(this.memberListRenderer))
			);
			this.memberListRenderer.popSettings();

			importedMembers = [
				Create.p(LIST_CAPTION_ATTR, 'Imported global members:'),
				memberList
			];
		}
		else {
			importedMembers = Create.p(null, 'No members are imported from this module.');
		}

		return Create.fragment(
			Create.p(null, 'Required version: ' + formatRequiredVersion(module.version, module.versionConstraint)),
			importedMembers
		);
	}

	visitTypeRef(type) {
		this.renderName(type);

		const fragment = Create.fragment();

		var derivedTypes;
		if (type.derivedTypes) {
			derivedTypes = this.renderDerivedTypes(type);
		}

		var importedMembers;
		if (type.memberCount > 0) {
			importedMembers = Create.ul(MEMBER_LIST_ATTR,
				type.map(member => member.accept(this.memberListRenderer))
			);
		}
		else {
			importedMembers = Create.p(null, 'No members are imported from this type.');
		}

		return Create.fragment(
			this.renderDeclaringModule(type.declaringModule),
			derivedTypes,
			importedMembers
		);
	}

	visitMethodRef(method) {
		this.renderName(method);

		return Create.fragment(
			this.renderDeclaringModule(method.declaringModule),
			this.renderNoMoreDetails()
		);
	}

	visitFieldRef(field) {
		this.renderName(field);

		return Create.fragment(
			this.renderDeclaringModule(field.declaringModule),
			this.renderNoMoreDetails()
		);
	}

	visitFunctionRef(func) {
		this.renderName(func);

		return Create.fragment(
			this.renderDeclaringModule(func.declaringModule),
			this.renderNoMoreDetails()
		);
	}

	visitNamespace(namespace) {
		this.renderName(namespace);

		const members = namespace.getMembersSorted();

		const memberList = Create.ul(MEMBER_LIST_ATTR,
			members.map(member => member.accept(this.memberListRenderer))
		);

		return memberList;
	}

	visitType(type) {
		this.renderName(type);

		const fragment = Create.fragment();

		if (type.baseType) {
			const baseType = Create.p(null,
				Create.i(null, 'Extends: '), this.renderLink(type.baseType, type.baseType.fullName)
			);
			fragment.appendChild(baseType);
		}

		if (type.sharedType) {
			const sharedType = Create.p(null,
				Create.i(null, 'Shares: '), this.renderLink(type.sharedType, type.sharedType.fullName)
			);
			fragment.appendChild(sharedType);
		}

		if (type.derivedTypes) {
			fragment.appendChild(this.renderDerivedTypes(type));
		}

		if (type.memberCount > 0) {
			const memberList = Create.ul(MEMBER_LIST_ATTR,
				type.map(member => member.accept(this.memberListRenderer))
			);

			fragment.appendChild(memberList);
		}

		return fragment;
	}

	visitConstant(constant) {
		this.renderName(constant);

		return this.renderConstantValue(constant.value, constant.module);
	}

	visitFunction(func) {
		this.renderName(func);

		return Create.ul(MEMBER_LIST_ATTR,
			func.map(overload => overload.accept(this.memberListRenderer))
		);
	}

	visitField(field) {
		this.renderName(field);

		if (field.hasValue) {
			return this.renderConstantValue(field.value, field.module);
		}
		else {
			return this.renderNoMoreDetails();
		}
	}

	visitMethod(method) {
		this.renderName(method);

		return Create.ul(MEMBER_LIST_ATTR,
			method.map(overload => overload.accept(this.memberListRenderer))
		);
	}

	visitOverload(overload) {
		// The main logic for rendering method bodies is in MethodBodyRenderer,
		// but we take care of rendering abstract and native methods here.

		if (overload.isAbstract) {
			this.renderName(overload);

			return Create.fragment(
				Create.p(null,
					'This method is abstract, so there is no body to be shown.'
				)
			);
		}

		if (overload.isNative) {
			this.renderName(overload);

			return Create.fragment(
				Create.p(null,
					'Native entry point: ', Create.elem('code', null, overload.entryPoint)
				),
				Create.p(null,
					'This method is implemented in native code, so the body is not available here.'
				)
			);
		}

		// If the method has a body, we use a custom parameter list formatter
		// to turn the parameters into clickable things, so you can highlight
		// them in the method body by clicking the header.

		const data = new RenderedMethodData(overload);

		// Instance methods have a hidden 'this' parameter, so we need to add
		// 1 to all parameter indices.
		const argOffset = overload.isStatic ? 0 : 1;

		const paramListFormatter = Object.create(ParamListFormatter.html, {
			param: {
				value: param => {
					const elem = Create.span(PARAM_ATTR, param.name);
					data.addCodeItem(`arg:${param.index + argOffset}`, elem, true);
					return elem;
				}
			}
		});

		this.summaryRenderer.pushParamListFormatter(paramListFormatter);
		this.renderName(overload);
		this.summaryRenderer.popParamListFormatter();

		return this.methodBodyRenderer.render(overload, data);
	}

	visitProperty(property) {
		this.renderName(property);

		return Create.fragment(
			this.renderImplementingMethod('Getter: ', property.getter),
			this.renderImplementingMethod('Setter: ', property.setter)
		);
	}

	visitOperator(operator) {
		this.renderName(operator);

		return Create.fragment(
			this.renderImplementingMethod('Implemented by: ', operator.method)
		);
	}

	renderImplementingMethod(label, method) {
		if (method === null) {
			return Create.p(null, label, Create.i(null, 'none'));
		}

		// If the method has only one overload, show it "inline", as it were
		if (method.length === 1) {
			return Create.p(null,
				label,
				method.map(overload => overload.accept(this.summaryRenderer))
			);
		}

		// Otherwise, render a list of all overloads. We want to hide method
		// groups as much as possible.
		return Create.fragment(
			Create.p(LIST_CAPTION_ATTR, label),
			Create.ul(MEMBER_LIST_ATTR,
				method.map(overload => overload.accept(this.memberListRenderer))
			)
		);
	}

	renderConstantValue(value, module) {
		const fragment = Create.fragment();

		// Try to show strings in a specially marked-up block instead.
		var renderedValue = false;
		if (!value.isNull && value.type.fullName === STRING_TYPE) {
			renderedValue = this.renderStringValue(value, module, fragment);
		}

		if (!renderedValue) {
			fragment.appendChild(
				Create.p(null,
					'Constant value: ',
					this.constantRenderer.render(value, module)
				)
			);
		}

		if (!value.isNull) {
			fragment.appendChild(
				Create.p(null,
					'Type: ',
					this.renderLink(value.type, value.type.fullName)
				)
			);

			fragment.appendChild(Create.p(LIST_CAPTION_ATTR, 'Data views:'));

			const rawValue = value.rawValue;
			fragment.appendChild(
				Create.ul(MEMBER_LIST_ATTR,
					Create.li(null, 'Raw: ', this.renderRawBytes(rawValue)),
					Create.li(null, 'Int: ', formatInt(rawValue, true)),
					Create.li(null, 'UInt: ', formatInt(rawValue, false)),
					Create.li(null, 'Real: ', formatReal(rawValue.getFloat64(0, true)))
				)
			);
		}

		return fragment;
	}

	renderStringValue(value, module, fragment) {
		const stringToken = value.rawValue.getUint32(0, true);
		const stringValue = module.strings.get(stringToken, false);

		if (stringValue !== null) {
			fragment.appendChild(Create.p(null, 'Constant value:'));
			fragment.appendChild(Create.p(STRING_BLOCK_ATTR, Create.span(STRING_ATTR, stringValue)));

			return true;
		}

		return false;
	}

	renderRawBytes(value) {
		var text = '';

		for (var i = 0; i < value.byteLength; i++) {
			if (i > 0) {
				text += '\u00a0'; // No-Break Space
			}
			const byte = value.getUint8(i);
			const byteString = byte < 0x10
				? '0' + byte.toString(16)
				: byte.toString(16);

			text += byteString;
		}

		return Create.elem('code', null, text);
	}
}
