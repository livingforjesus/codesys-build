import { expect, it } from "bun:test";
import { getApplicationStatus } from "./runtime-status";

const startedAt = Date.parse("2026-09-19T10:00:00Z");
const running =
	"2026-09-19T10:00:01Z, 0x00000002, 1, 0, 10, Application [<app>Application</app>] started";

it("recognizes a start event from this container boot", () => {
	expect(getApplicationStatus(running, "Application", startedAt)).toBe(
		"running",
	);
});

it.each([
	"",
	running.replace("10:00:01", "09:00:00"),
	running.replace("2026-09-19T10:00:01Z", "invalid date"),
	running.replace("<app>Application</app>", "<app>Other</app>"),
	"2026-09-19T10:00:01Z, 0x00000002, 1, 0, 6, Bootproject of application [<app>Application</app>] load started ...",
])("waits when the log contains no current application start: %s", (log) => {
	expect(getApplicationStatus(log, "Application", startedAt)).toBe("pending");
});

it.each(["stopped", "denied to start", "exception", "failed"])(
	"rejects a later %s event instead of accepting an earlier start",
	(event) => {
		const failure = `2026-09-19T10:00:02Z, 0x00000002, 4, 1, 1, Application [<app>Application</app>] ${event}`;
		expect(
			getApplicationStatus(`${running}\n${failure}`, "Application", startedAt),
		).toBe("failed");
	},
);
