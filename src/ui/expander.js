import {Create} from '../html/create';

const MEMBER_EXPANDED = 'member--expanded';

export function makeExpandable(elem, startOpen) {
	const expander = Create.i({class: 'member__expander fa fa-fw'});

	expander.addEventListener('click', () => {
		elem.classList.toggle(MEMBER_EXPANDED);
	}, false);

	elem.insertBefore(expander, elem.firstChild);

	if (startOpen) {
		elem.classList.add(MEMBER_EXPANDED);
	}

	return elem;
}
