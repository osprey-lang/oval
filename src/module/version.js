export class Version {
	constructor(major, minor, patch) {
		this.major = major;
		this.minor = minor;
		this.patch = patch;
	}

	equals(other) {
		return Version.equals(this, other);
	}

	compareTo(other) {
		return Version.compare(this, other);
	}

	toString() {
		return `${this.major}.${this.minor}.${this.patch}`;
	}

	static equals(a, b) {
		return a.major === b.major &&
			a.minor === b.minor &&
			a.patch === b.patch;
	}

	static compare(a, b) {
		if (a.major !== b.major) {
			return a.major < b.major ? -1 : 1;
		}

		if (a.minor !== b.minor) {
			return a.minor < b.minor ? -1 : 1;
		}

		if (a.patch !== b.patch) {
			return a.patch < b.patch ? -1 : 1;
		}

		return 0;
	}
}
