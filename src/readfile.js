export function readFile(file) {
	return new Promise((resolve, reject) => {
		var reader = new window.FileReader();

		reader.onload = () => {
			resolve(reader.result);
		};

		reader.onerror = () => {
			reject(reader.error);
		};

		reader.readAsArrayBuffer(file);
	});
}
