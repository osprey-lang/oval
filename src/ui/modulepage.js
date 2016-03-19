import {SidebarRenderer} from './sidebarrenderer';
import {DetailsRenderer} from './detailsrenderer';
import {MemberFilter} from './memberfilter';
import {FileDropZone} from '../filedropzone';
import EventEmitter from '../lib/eventemitter2';

const CURRENT_MEMBER_CLASS = 'member--current';
const FILTERED_LIST_CLASS = 'member-list--filtered';

export class ModulePage {
	constructor(elem) {
		this.elem = elem;

		this.events = new EventEmitter({wildcard: true});
		this._currentModule = null;
		this._currentMember = null;
		this._memberToElement = new WeakMap();

		this.initFileOpener();
		this.initMemberList();
		this.initMemberFilter();
		this.initDetailView();
	}

	get currentModule() {
		return this._currentModule;
	}

	set currentModule(value) {
		if (value === this._currentModule) {
			return;
		}

		const oldValue = this._currentModule;
		this._currentModule = value;
		this.events.emit('module.change', {newValue: value, oldValue: oldValue});

		// The current member cannot possibly be from the new module,
		// so select the module.
		this.currentMember = value;
	}

	get currentMember() {
		return this._currentMember;
	}

	set currentMember(value) {
		if (value === this._currentMember) {
			return;
		}

		const oldValue = this._currentMember;
		this._currentMember = value;
		this.events.emit('member.change', {newValue: value, oldValue: oldValue});
	}

	initFileOpener() {
		const openZone = this.elem.querySelector('.open-zone');

		const dropZone = new FileDropZone(openZone, this.events);

		dropZone.on('files', files => {
			if (files.length > 0) {
				// We only ever care about the first file. You can't have multiple
				// modules open at the same time.
				this.emitFile(files[0]);
			}
		});
	}

	initMemberList() {
		const memberList = this.elem.querySelector('.member-list ul');

		const renderer = new SidebarRenderer({
			raise: (event, arg) => {
				this.events.emit(event, arg);
			},

			registerElement: (member, element) => {
				this._memberToElement.set(member, element);
			},
		});

		this.on('member.click', member => {
			this.currentMember = member;
		});

		this.on('module.change', e => {
			memberList.innerHTML = '';

			if (e.newValue !== null) {
				const moduleElem = renderer.render(e.newValue);
				memberList.appendChild(moduleElem);
			}
		});

		this.on('member.change', e => {
			const oldElem = this._memberToElement.get(e.oldValue);
			if (oldElem) {
				oldElem.classList.remove(CURRENT_MEMBER_CLASS);
			}

			const newElem = this._memberToElement.get(e.newValue);
			if (newElem) {
				newElem.classList.add(CURRENT_MEMBER_CLASS);
			}
		});
	}

	initMemberFilter() {
		const memberList = this.elem.querySelector('.member-list');
		const filterInput = this.elem.querySelector('.member-search input');

		const searcher = new MemberFilter({
			getElement: member => this._memberToElement.get(member),
		});

		filterInput.addEventListener('input', e => {
			const query = filterInput.value.trim();

			if (query.length > 0) {
				memberList.classList.add(FILTERED_LIST_CLASS);
				searcher.filter(this.currentModule, query);
			}
			else {
				memberList.classList.remove(FILTERED_LIST_CLASS);
			}
		}, false);
	}

	initDetailView() {
		const heading = this.elem.querySelector('.member-heading');
		const currentName = heading.querySelector('.member-current .member-name');
		const parentName = heading.querySelector('.member-parent .member-name');

		const details = this.elem.querySelector('.member-contents');

		const renderer = new DetailsRenderer({
			current: currentName,
			parent: parentName,
			details: details,

			raise: (event, arg) => {
				this.events.emit(event, arg);
			},
		});

		this.on('member.change', e => {
			const member = e.newValue;

			if (member !== null) {
				renderer.render(member);
			}
			else {
				currentName.innerHTML = '';
				parentName.innerHTML = '';
				details.innerHTML = '';
			}
		});
	}

	emitFile(file) {
		this.events.emit('file.open', file);
	}

	on(event, handler) {
		return this.events.on(event, handler);
	}
}
