import {MemberKind, MetaKind, ModuleMemberVisitor} from '../module/modulemember';

/**
 * The basic idea behind the code in NavigationStateManager is to avoid storing
 * the entire module in the browser's history states. Not only do we not want to
 * re-read the entire thing when the state changes, the module is also likely to
 * be too large for the browser history.
 *
 * Fortunately for us, most members have a token that is unique within the module
 * file, so whenever possible, we only need to store that token in the history.
 * In some cases we need more information - e.g. properties are stored as parent
 * type token + member name, operators as parent type token + operator index, and
 * so on.
 *
 * Multiple modules can be opened in a single session, though only one at a time.
 * We can't modify the history any which way we like, meaning it could contain
 * states for members of previously opened modules. Since we can't return to a
 * previously opened module (because we don't keep them around, to prevent memory
 * leaks), and we certainly can't reopen it (no file system access), the best we
 * can do is ignore attempts to navigate to members from a module other than the
 * current. To identify each state's module, we associate each module with an ID,
 * which is just a random integer.
 *
 * The choice of random integer may seen strange. Why not use a sequentially
 * allocated number instead? The problem is that navigating away from Oval will
 * reset the counter, and if the user returns, they might open another module,
 * which will get ID 0, which the history stack might contain entries for... and
 * then they press the back button and unexpected things pop up.
 */

const StateMemberKind = Object.freeze({
	// The module itself.
	MODULE: "module",
	// Member with token (all kinds), contains a token.
	MEMBER: "member",
	// Method overload, contains a method/function token and an overload index.
	OVERLOAD: "overload",
	// Property definition, contains a parent type token and a member name.
	PROPERTY: "property",
	// Operator definition, contains a parent type token and a member name.
	OPERATOR: "operator",
	// Metadata member (MetadataMember), contains a meta kind. Only a subset of metadata
	// members are supported.
	METADATA: "metadata",
	// Global constant, contains the fully qualified name.
	CONSTANT: "constant",
	// Namespace declared by the open module, contains the full namespace name. If the
	// namespace name is null, refers to the global declaration space.
	NAMESPACE: "namespace",
	// Namespace from a moduleref, contains a moduleref token and the full namespace name.
	// If the namespace name is null, refers to the global declaration space.
	IMPORTED_NAMESPACE: "namespace_ref",
});

function getModuleIdentifier(module) {
	if (!module.$historyStateId) {
		const MAX_ID = 0xffffffff;
		module.$historyStateId = Math.floor(MAX_ID * Math.random()) + 1;
	}

	return module.$historyStateId;
}

export class NavigationStateManager {
	constructor(page) {
		this.page = page;
		this.stateFactory = new HistoryStateFactory(
			() => getModuleIdentifier(this.page.currentModule)
		);
		// When we change the page's current member in response to the 'popstate' event,
		// we still get a member.change event from the page. Storing the current member
		// here allows us to ignore that event.
		this.currentMember = null;

		this.bindEvents();
	}

	bindEvents() {
		this.page.on('module.change', e => this.changeModule(e.newValue));

		this.page.on('member.change', e => this.changeMember(e.newValue));

		window.addEventListener('popstate', e => {
			this.navigateTo(e.state);
		}, false);
	}

	changeModule(module) {
		// A member.change event is emitted when the module changes, so we don't
		// need to worry about that here. Just make sure the module has an identifier.
		getModuleIdentifier(module);
	}

	changeMember(newMember) {
		if (this.currentMember === newMember) {
			// If we get here, we're reacting to a 'popstate' event, so we should not
			// attempt to create a new history state for the navigation.
			return;
		}

		// Note: pushState() takes the *new* state of the page. If this.currentMember
		// is null, it means the first module has just been opened, so we can use
		// replaceState() instead, to avoid pushing an empty, meaningless state onto
		// the history stack.
		var historyState = this.stateFactory.create(newMember);
		if (this.currentMember === null) {
			window.history.replaceState(historyState, '');
		}
		else {
			window.history.pushState(historyState, '');
		}

		this.currentMember = newMember;
	}

	navigateTo(state) {
		const member = this.memberFromState(state);
		if (member) {
			// Set this.currentMember first, because setting it on this.page will
			// trigger the member.change event, and we don't want to add a history
			// state when navigating.
			this.currentMember = member;
			this.page.currentMember = member;
		}
	}

	memberFromState(state) {
		if (state == null) { // allow null or undefined
			return null;
		}

		const currentModule = this.page.currentModule;
		if (getModuleIdentifier(currentModule) !== state.module) {
			// The state belongs to a member from a different module
			// than the one currently open.
			return null;
		}

		switch (state.kind) {
			case StateMemberKind.MODULE:
				return currentModule;
			case StateMemberKind.MEMBER:
				return currentModule.resolveToken(state.token, false);
			case StateMemberKind.OVERLOAD:
				return this.overloadFromState(currentModule, state);
			case StateMemberKind.PROPERTY:
				return this.propertyFromState(currentModule, state);
			case StateMemberKind.OPERATOR:
				return this.operatorFromState(currentModule, state);
			case StateMemberKind.METADATA:
				return this.metadataFromState(currentModule, state);
			case StateMemberKind.CONSTANT:
				return this.constantFromState(currentModule, state);
			case StateMemberKind.NAMESPACE:
				return this.namespaceFromState(currentModule, state);
			case StateMemberKind.IMPORTED_NAMESPACE:
				return this.importedNamespaceFromState(currentModule, state);
			default:
				return null;
		}
	}

	overloadFromState(module, state) {
		const method = module.resolveToken(state.method, false);
		if (!method || method.kind !== MemberKind.METHOD) {
			return null;
		}
		return method.getOverload(state.index);
	}

	propertyFromState(module, state) {
		const type = module.resolveToken(state.type, false);
		if (!type || type.kind !== MemberKind.TYPE) {
			return null;
		}
		return type.getMember(state.name);
	}

	operatorFromState(module, state) {
		const type = module.resolveToken(state.type, false);
		if (!type || type.kind !== MemberKind.TYPE) {
			return null;
		}
		return type.getMember(state.name);
	}

	metadataFromState(module, state) {
		switch (state.metaKind) {
			case MetaKind.STRING_TABLE:
				return module.strings;
			case MetaKind.METADATA_TABLE:
				return module.metadata;
			case MetaKind.REFERENCES:
				// The only REFERENCES table that is reachable from the UI is
				// the moduleRefs table.
				return module.moduleRefs;
			default:
				return null;
		}
	}

	constantFromState(module, state) {
		var path = state.fullName.split('.');
		return this.resolvePath(module.members, path, 0);
	}

	namespaceFromState(module, state) {
		if (state.fullName === null) {
			return module.members;
		}
		else {
			const path = state.fullName.split('.');
			return this.resolvePath(module.members, path, 0);
		}
	}

	importedNamespaceFromState(module, state) {
		const declaringModule = module.resolveToken(state.declaringModule, false);
		if (!declaringModule || declaringModule.kind !== MemberKind.MODULE_REF) {
			return null;
		}

		if (state.fullName === null) {
			return declaringModule.members;
		}
		else {
			const path = state.fullName.split('.');
			return this.resolvePath(declaringModule.members, path, 0);
		}
	}

	resolvePath(member, path, index) {
		if (index === path.length) {
			return member;
		}

		if (!member || member.kind !== MemberKind.NAMESPACE) {
			// Can only look up members through namespaces
			return null;
		}

		const nextMember = member.get(path[index]);
		if (!nextMember) {
			return null;
		}

		return this.resolvePath(nextMember, path, index + 1);
	}
}

class HistoryStateFactory extends ModuleMemberVisitor {
	constructor(getCurrentModuleIdentifier) {
		super();
		this.getCurrentModuleIdentifier = getCurrentModuleIdentifier;
	}

	create(member) {
		const state = member.accept(this);
		state.module = this.getCurrentModuleIdentifier();
		return state;
	}

	visitModule(module) {
		return {
			kind: StateMemberKind.MODULE,
		};
	}

	visitMetadata(meta) {
		switch (meta.metaKind) {
			case MetaKind.STRING_TABLE:
			case MetaKind.METADATA_TABLE:
			case MetaKind.REFERENCES:
				return {
					kind: StateMemberKind.METADATA,
					metaKind: meta.metaKind,
				};
			default:
				throw new Error(`Unsupported meta kind: ${meta.metaKind}`);
		}
	}

	visitModuleRef(module) {
		return {
			kind: StateMemberKind.MEMBER,
			token: module.token,
		};
	}

	visitTypeRef(type) {
		return {
			kind: StateMemberKind.MEMBER,
			token: type.token,
		};
	}

	visitMethodRef(method) {
		return {
			kind: StateMemberKind.MEMBER,
			token: method.token,
		};
	}

	visitFieldRef(field) {
		return {
			kind: StateMemberKind.MEMBER,
			token: field.token,
		};
	}

	visitFunctionRef(func) {
		return {
			kind: StateMemberKind.MEMBER,
			token: func.token,
		};
	}

	visitNamespace(namespace) {
		const declaringModule = namespace.declaringModule;
		if (declaringModule.kind === MemberKind.MODULE_REF) {
			return {
				kind: StateMemberKind.IMPORTED_NAMESPACE,
				declaringModule: declaringModule.token,
				fullName: namespace.fullName,
			};
		}
		else {
			return {
				kind: StateMemberKind.NAMESPACE,
				fullName: namespace.fullName,
			};
		}
	}

	visitType(type) {
		return {
			kind: StateMemberKind.MEMBER,
			token: type.token,
		};
	}

	visitConstant(constant) {
		return {
			kind: StateMemberKind.CONSTANT,
			fullName: constant.fullName,
		};
	}

	visitFunction(func) {
		return {
			kind: StateMemberKind.MEMBER,
			token: func.token,
		};
	}

	visitField(field) {
		return {
			kind: StateMemberKind.MEMBER,
			token: field.token,
		};
	}

	visitMethod(method) {
		return {
			kind: StateMemberKind.MEMBER,
			token: method.token,
		};
	}

	visitOverload(overload) {
		const method = overload.methodGroup;
		return {
			kind: StateMemberKind.OVERLOAD,
			method: method.token,
			index: method.indexOf(overload),
		};
	}

	visitProperty(property) {
		return {
			kind: StateMemberKind.PROPERTY,
			type: property.parent.token,
			name: property.name,
		};
	}

	visitOperator(operator) {
		return {
			kind: StateMemberKind.MEMBER,
			type: operator.parent.token,
			// Operators are also looked up by name
			name: operator.name,
		};
	}
}
