// CODESYS startup and project loading can each take several minutes.
export const codesysTimeouts = {
	build: 20 * 60 * 1000,
	hostCommand: 15_000,
	startup: 20 * 60 * 1000,
	stop: 10_000,
	terminate: 5000,
};
