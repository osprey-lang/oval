import {ModuleMember, MemberKind} from './modulemember';

export class Namespace extends ModuleMember {
	constructor(parent, name) {
		super(MemberKind.NAMESPACE, parent);

		this._name = name;
		this._members = new Map();
		this._onlyChild = null;
	}

	get name() {
		return this._name;
	}

	get fullName() {
		if (!this._fullName) {
			if (!this.parent) {
				// Don't cache the name until we have a parent
				return this.name;
			}
			else if (this.parent.kind === MemberKind.NAMESPACE && !this.parent.isGlobal) {
				this._fullName = this.parent.fullName + '.' + this.name;
			}
			else {
				this._fullName = this.name;
			}
		}
		return this._fullName;
	}

	get isGlobal() {
		return this._name === null;
	}

	get memberCount() {
		return this._members.size;
	}

	get canCollapse() {
		return this._onlyChild && this._onlyChild.kind == MemberKind.NAMESPACE;
	}

	get(name) {
		return this._members.get(name) || null;
	}

	getMembers() {
		var children = new Array(this._members.size);
		this._members.forEach(value => {
			children[children.length] = value;
		});
		return children;
	}

	getMembersSorted() {
		var children = this.getMembers();
		children.sort((a, b) => {
			if (a.kind !== b.kind) {
				return a.kind - b.kind;
			}

			if (a.name < b.name) {
				return -1;
			}
			if (a.name > b.name) {
				return 1;
			}
			return 0;
		});
		return children;
	}

	forEach(fn) {
		this._members.forEach(value => fn(value));
	}

	map(fn) {
		const result = [];
		this._members.forEach(value => {
			result.push(fn(value));
		});
		return result;
	}

	_add(member) {
		if (this._members.has(member.name)) {
			throw new Error(`Namespace '${this.fullName}' already has a member named '${member.name}'`);
		}

		this._members.set(member.name, member);
		member._parent = this;

		if (this._members.size === 1) {
			this._onlyChild = member;
		}
		else {
			this._onlyChild = null;
		}
	}

	_resolveName(qualifiedName) {
		if (qualifiedName === '') {
			return this;
		}

		const path = qualifiedName.split('.');
		return this._resolvePath(path, 0);
	}

	_resolvePath(path, pathIndex) {
		if (pathIndex === path.length) {
			return this;
		}

		// We are not at the last component in the path, so we have to
		// add an intermediate namespace. If there is already a member
		// with the current component name, it must be a namespace, in
		// which case we add to it; otherwise, we throw.
		const childName = path[pathIndex];
		var child = this.get(childName);

		if (child) {
			if (child.kind !== MemberKind.NAMESPACE) {
				throw new Error(`Cannot resolve path: member '${this.fullName}.${childName}' is not a namespace`);
			}
		}
		else {
			child = new Namespace(this.isGlobal ? this.parent : this, childName);
			this._add(child);
		}

		// Continue down the path
		return child._resolvePath(path, pathIndex + 1);
	}

	accept(visitor, arg) {
		return visitor.visitNamespace(this, arg);
	}
}
