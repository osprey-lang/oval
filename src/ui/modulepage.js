import {SidebarRenderer} from './sidebarrenderer';
import {SearchResultRenderer} from './searchresultrenderer';
import {DetailsRenderer} from './detailsrenderer';
import {SearchQuery, MemberFilter} from './memberfilter';
import {NavigationStateManager} from './navigationstatemanager';
import {FileDropZone} from '../filedropzone';
import {Create} from '../html/create';
import EventEmitter from '../lib/eventemitter2';

const CURRENT_MEMBER_CLASS = 'member--current';
const FILTERED_LIST_CLASS = 'sidebar--filtered';
const HAS_MORE_RESULTS_CLASS = 'member-list__search-results--has-more';

// Maximum number of search results per "page". Limited not because searching
// is slow, but because re-rendering the results takes a fair amount of time.
const RESULTS_PER_PAGE = 20;

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
		this.initNavigationStateManager();
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
		const memberList = this.elem.querySelector('.member-list__hierarchy');

		const renderer = new SidebarRenderer({
			raise: (event, arg) => {
				this.events.emit(event, arg);
			},

			registerElement: (member, element) => {
				this._memberToElement.set(member, element);
			},
		});

		this.on('member.select', member => {
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
		const sidebar = this.elem.querySelector('.sidebar');
		const searchResultList = this.elem.querySelector('.member-list__search-results');
		const filterInput = this.elem.querySelector('.member-search input');
		const showMoreItem = this.elem.querySelector('.member-list__search-results__more');
		const showMoreButton = showMoreItem.querySelector('button');

		const renderer = new SearchResultRenderer({
			raise: (event, arg) => {
				this.events.emit(event, arg);
			},
		});

		const searcher = new MemberFilter();

		var lastQueryString = "";
		var currentResults = null;
		var currentOffset = 0;
		var currentQuery = null; // SearchQuery

		const appendMoreResults = () => {
			const fragment = Create.fragment();

			const end = Math.min(currentOffset + RESULTS_PER_PAGE, currentResults.length);
			for (var i = currentOffset; i < end; i++) {
				fragment.appendChild(renderer.render(currentResults[i], currentQuery));
			}

			searchResultList.insertBefore(fragment, showMoreItem);
			currentOffset += RESULTS_PER_PAGE;

			if (currentOffset < currentResults.length) {
				searchResultList.classList.add(HAS_MORE_RESULTS_CLASS);
			}
			else {
				searchResultList.classList.remove(HAS_MORE_RESULTS_CLASS);
			}
		};

		const setResults = (results) => {
			searchResultList.innerHTML = '';

			currentResults = results;
			currentOffset = 0;
			if (results) {
				searchResultList.appendChild(showMoreItem);
				appendMoreResults();
			}
		};

		filterInput.addEventListener('input', e => {
			const query = filterInput.value.trim();

			if (query !== lastQueryString) {
				lastQueryString = query;

				if (query.length > 0) {
					currentQuery = SearchQuery.from(query);
					sidebar.classList.add(FILTERED_LIST_CLASS);
					const results = searcher.filter(this.currentModule, currentQuery);
					setResults(results);
				}
				else {
					currentQuery = null;
					sidebar.classList.remove(FILTERED_LIST_CLASS);
					setResults(null);
				}
			}
		}, false);

		showMoreButton.addEventListener('click', appendMoreResults, false);
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

	initNavigationStateManager() {
		const stateManager = new NavigationStateManager(this);
	}

	emitFile(file) {
		this.events.emit('file.open', file);
	}

	on(event, handler) {
		return this.events.on(event, handler);
	}
}
