import EventEmitter from './lib/eventemitter2';

export class FileDropZoneEvent {
	constructor(eventType, e) {
		this.eventType = eventType;
		this.e = e;
	}

	get dataTransfer() {
		if (!this.e) {
			return null;
		}

		return this.e.dataTransfer || null;
	}
}

/**
 * The FileDropZone class implements an area onto which the user can drop files, using
 * the HTML drag-and-drop feature. The file drop zone also shows a file browser when
 * clicked.
 *
 * This class assumes the child elements of the drop zone have 'pointer-events: none;',
 * to prevent all sorts of nasty drag-and-drop problems. It will also create a file
 * input, which should be hidden.
 */
export class FileDropZone {
	constructor(elem, eventEmitter) {
		this.elem = elem;
		this.events = eventEmitter || new EventEmitter({wildcard: true});

		this.bindDropEvents();
		this.bindClickEvents();
	}

	on(event, handler) {
		return this.events.on(event, handler);
	}

	bindDropEvents() {
		const elem = this.elem; // convenience

		// So, drag events are a little bit messy.
		// We get the dragenter event every time the cursor moves above anything inside
		// this.elem. This is not a problem; in fact, this is fine.
		// The dragleave event is trickier. Like dragenter, it is raised any time the
		// cursor /leaves/ anything inside this.elem, including this.elem. However, the
		// target property of the event only contains the element we're moving away from,
		// and there is no relatedTarget!
		// As a result, this code will simply assume 'pointer-events: none' is set on
		// all child nodes. This is by FAR the simplest cross-browser solution to keeping
		// track of drag state.

		elem.addEventListener('dragenter', e => {
			e.preventDefault();
			e.stopPropagation();

			this.events.emit('drag.enter', new FileDropZoneEvent('enter', e));
		}, false);

		elem.addEventListener('dragover', e => {
			e.preventDefault();
			e.stopPropagation();

			this.events.emit('drag.over', new FileDropZoneEvent('over', e));
		}, false);

		elem.addEventListener('dragleave', e => {
			this.events.emit('drag.leave', new FileDropZoneEvent('leave', e));
		}, false);

		elem.addEventListener('drop', e => {
			e.preventDefault();
			e.stopPropagation();

			const dt = e.dataTransfer;
			if (dt.files.length === 0) {
				return;
			}

			this.events.emit('files', dt.files);
		}, false);
	}

	bindClickEvents() {
		this.createFileInput();

		this.elem.addEventListener('click', e => {
			e.preventDefault();
			this.showFileBrowser();
		}, false);
	}

	createFileInput() {
		const input = document.createElement('input');
		input.type = 'file';

		document.body.appendChild(input);

		input.addEventListener('change', e => {
			if (input.files.length > 0) {
				this.events.emit('files', input.files);
			}

			// Once the user has selected a file, we have to replace the
			// file input. Otherwise they won't be able to select the same
			// file again, as that won't trigger the change event.
			document.body.removeChild(input);
			this.createFileInput();
		}, false);

		this.fileInput = input;
	}

	showFileBrowser() {
		this.fileInput.click();
	}
}
