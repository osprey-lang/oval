const pendingResources = [];

class Resource {
	constructor(uri, loader) {
		this.uri = uri;
		this.loader = loader;
	}

	fetch() {
		return get(this.uri)
			.then(response => {
				return {loader: this.loader, response: response};
			});
	}
}

function get(uri) {
	return new Promise((resolve, reject) => {
		const req = new XMLHttpRequest();
		req.open('GET', uri);

		req.onreadystatechange = () => {
			if (req.readyState === 4) {
				if (req.status === 200) {
					resolve(req);
				}
				else {
					console.error('Resource load failure:', uri, req);
					reject(new Error(`Failed to load resource '${uri}': got status ${req.status}`));
				}
			}
		};

		req.send(null);
	});
}

export function requireResource(uri, loader) {
	pendingResources.push(new Resource(uri, loader));
}

export function loadResources() {
	return new Promise((resolve, reject) => {
		// First, request all the resource data.
		const requests = pendingResources.map(res => res.fetch());

		// Only after we know everything has loaded successfully
		// do we bother calling all the loader callbacks. If even
		// a single request fails, we abort.
		Promise.all(requests)
			.then(responses => {
				responses.forEach(result => {
					const loader = result.loader;
					loader(result.response);
				})

				// All done!
				resolve();
			})
			.catch(reject);
	});
}
