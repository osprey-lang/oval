import EventEmitter from '../lib/eventemitter2';
import {FileDropZone} from '../filedropzone';

export class StartPage {
	constructor(elem) {
		this.elem = elem;

		this.events = new EventEmitter({wildcard: true});

		this.initFileZone();
	}

	initFileZone() {
		const fileZone = this.elem.querySelector('.file-zone');

		const dropZone = new FileDropZone(fileZone, this.events);

		dropZone.on('drag.enter', e => {
			this.elem.classList.add('file-zone--has-file');
		});

		dropZone.on('drag.leave', e => {
			this.elem.classList.remove('file-zone--has-file');
		});

		dropZone.on('files', files => {
			if (files.length > 0) {
				// We only ever care about the first file. You can't have
				// multiple modules open at the same time.
				this.emitFile(files[0]);
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
