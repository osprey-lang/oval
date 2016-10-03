import {VersionConstraint} from '../module/refs';

export function formatRequiredVersion(version, versionConstraint) {
	switch (versionConstraint) {
		case VersionConstraint.EXACT:
			return formatExact(version);
		case VersionConstraint.FIXED_MINOR:
			return formatFixedMinor(version);
		case VersionConstraint.FIXED_MAJOR:
			return formatFixedMajor(version);
		default:
			throw new Error('Invalid version constraint');
	}
}

function formatExact(version) {
	return `${version}`;
}

function formatFixedMinor(version) {
	if (version.patch === 0) {
		return `${version.major}.${version.minor}.*`;
	}
	else {
		return `~${version}`;
	}
}

function formatFixedMajor(version) {
	if (version.minor === 0 && version.patch === 0) {
		return `${version.major}.*`;
	}
	else {
		return `^${version}`;
	}
}
