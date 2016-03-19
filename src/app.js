import {loadResources} from './resource';
import {UI} from './ui/ui';

window.addEventListener('load', () => {
	loadResources()
		.then(() => {
			// Stop the loading throbber, if there is one.
			window.Oval.loaded();

			const uiElem = document.querySelector('.main');
			const ui = new UI(uiElem);
		})
		.catch(error => {
			alert(`Unable to load resource: ${error.message}`);
			console.error('Resource error', error);
		});
}, false);
