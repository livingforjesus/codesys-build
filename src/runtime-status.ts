/** Runtime stdout is buffered in Docker. Its log file records start/stop events immediately. */
export const getApplicationStatus = (
	log: string,
	application: string,
	startedAt: number,
) => {
	const event = log
		.split(/\r?\n/)
		.reverse()
		.find((line) => {
			const timestamp = Date.parse(line.split(",")[0] ?? "");
			if (!Number.isFinite(timestamp) || timestamp < startedAt) {
				return false;
			}
			return (
				line.includes(`<app>${application}</app>`) &&
				/\b(started|stopped|exception|corrupt|failed|denied)\b/i.test(line) &&
				!line.includes("load started")
			);
		});
	if (!event) {
		return "pending";
	}
	return event.includes(`Application [<app>${application}</app>] started`)
		? "running"
		: "failed";
};
