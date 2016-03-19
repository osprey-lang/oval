import {StartPage} from './startpage';
import {ModulePage} from './modulepage';
import {readModule} from '../module/modulereader';

export class UI {
	constructor(elem) {
		this.elem = elem;

		this.initStartPage();
		this.initModulePage();
	}

	initStartPage() {
		const startPageElem = this.elem.querySelector('.start-screen');
		const startPage = new StartPage(startPageElem);

		startPage.on('file.open', file => {
			this.openFile(file);
		});

		this.startPage = startPage;
		this.elem.classList.add('main--start');
	}

	initModulePage() {
		const modulePageElem = this.elem.querySelector('.module-screen');
		const modulePage = new ModulePage(modulePageElem);

		modulePage.on('file.open', file => {
			this.openFile(file);
		});

		this.modulePage = modulePage;
	}

	openFile(file) {
		console.log('Opening file:', file);

		readModule(file)
			.then(module => {
				this.elem.classList.remove('main--start');
				this.elem.classList.add('main--module');
				this.modulePage.currentModule = module;
			})
			.catch(error => {
				console.error(error);
			});
	}
}
