import {Create} from '../html/create';
import {ModuleMemberVisitor} from '../module/modulemember';
import {formatRequiredVersion} from './formatrequiredversion';

export const MemberListRenderOptions = Object.freeze({
	FULL_NAME: 1,
	NO_LINK: 2,
	TRAVERSE_NAMESPACES: 4,
})

const MEMBER_ATTR = {class: 'member'};
const NAME_ATTR = {class: 'member-name'};

export class MemberListRenderer extends ModuleMemberVisitor {
	constructor(summaryRenderer, constantRenderer) {
		super();

		this.summaryRenderer = summaryRenderer;
		this.constantRenderer = constantRenderer;

		this.options = 0;
		this.optionsStack = [];
	}

	pushSettings(options) {
		this.optionsStack.push(this.options);
		this.options = options;
	}

	popSettings() {
		if (this.optionsStack.length > 0) {
			this.options = this.optionsStack.pop();
		}
	}

	wrapItem(contents) {
		return Create.li(MEMBER_ATTR,
			Create.span(NAME_ATTR, contents)
		);
	}

	visitModule(module) {
		return this.wrapItem(this.summaryRenderer.visitModule(module, this.options));
	}

	visitMetadata(meta) {
		return this.wrapItem(this.summaryRenderer.visitMetadata(meta, this.options));
	}

	visitModuleRef(module) {
		return this.wrapItem([
			this.summaryRenderer.visitModuleRef(module, this.options),
			' \u2013 ',
			Create.i(null, formatRequiredVersion(module.version, module.versionConstraint))
		]);
	}

	visitTypeRef(type) {
		return this.wrapItem(this.summaryRenderer.visitTypeRef(type, this.options));
	}

	visitMethodRef(method) {
		return this.wrapItem(this.summaryRenderer.visitMethodRef(method, this.options));
	}

	visitFieldRef(field) {
		return this.wrapItem(this.summaryRenderer.visitFieldRef(field, this.options));
	}

	visitFunctionRef(func) {
		return this.wrapItem(this.summaryRenderer.visitFunctionRef(func, this.options));
	}

	visitNamespace(namespace) {
		if (this.options & MemberListRenderOptions.TRAVERSE_NAMESPACES) {
			return Create.fragment(
				namespace.map(member => member.accept(this))
			);
		}
		return this.wrapItem(this.summaryRenderer.visitNamespace(namespace, this.options));
	}

	visitType(type) {
		return this.wrapItem(this.summaryRenderer.visitType(type, this.options));
	}

	visitConstant(constant) {
		const constValue = this.summaryRenderer.visitConstant(constant, this.options);

		constValue.appendChild(Create.text(' = '));
		constValue.appendChild(this.constantRenderer.render(constant.value, constant.module));

		return this.wrapItem(constValue);
	}

	visitFunction(func) {
		return Create.fragment(
			func.map(overload => overload.accept(this))
		);
	}

	visitField(field) {
		const fieldValue = this.summaryRenderer.visitField(field, this.options);

		if (field.hasValue) {
			// Render the constant value here as well
			fieldValue.appendChild(Create.text(' = '));
			fieldValue.appendChild(this.constantRenderer.render(field.value, field.module));
		}

		return this.wrapItem(fieldValue);
	}

	visitMethod(method) {
		return Create.fragment(
			method.map(overload => overload.accept(this))
		);
	}

	visitOverload(overload) {
		return this.wrapItem(this.summaryRenderer.visitOverload(overload, this.options));
	}

	visitProperty(property) {
		return this.wrapItem(this.summaryRenderer.visitProperty(property, this.options));
	}

	visitOperator(operator) {
		return this.wrapItem(this.summaryRenderer.visitOperator(operator, this.options));
	}
}
