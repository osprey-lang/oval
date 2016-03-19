export class Version {
	constructor(major, minor, build, revision) {
		this.major = major;
		this.minor = minor;
		this.build = build;
		this.revision = revision;
	}

	equals(other) {
		return Version.equals(this, other);
	}

	compareTo(other) {
		return Version.compare(this, other);
	}

	toString() {
		return `${this.major}.${this.minor}.${this.build}.${this.revision}`;
	}

	static equals(a, b) {
		return a.major === b.major &&
			a.minor === b.minor &&
			a.build === b.build &&
			a.revision === b.revision;
	}

	static compare(a, b) {
		if (a.major !== b.major) {
			return a.major < b.major ? -1 : 1;
		}

		if (a.minor !== b.minor) {
			return a.minor < b.minor ? -1 : 1;
		}

		if (a.build !== b.build) {
			return a.build < b.build ? -1 : 1;
		}

		if (a.revision !== b.revision) {
			return a.revision < b.revision ? -1 : 1;
		}

		return 0;
	}
}
