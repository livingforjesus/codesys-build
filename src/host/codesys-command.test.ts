import { expect, it } from "bun:test";
import {
	codesysCommandFilename,
	commandArgumentSchema,
	getHostCommand,
} from "./codesys-command";

it.each(["C:\\PLC projects\\A&B!100%.exe", "CODESYS V3.5 SP22 Patch 3"])(
	"preserves a quoted Windows command value %s",
	(value) => {
		expect(commandArgumentSchema.parse(value)).toBe(value);
	},
);

it.each([
	"",
	"   ",
	'bad" & echo injected',
	"bad\ncommand",
	"bad\rcommand",
	"bad\0value",
])("rejects a value that can escape a quoted command argument %j", (value) => {
	expect(() => commandArgumentSchema.parse(value)).toThrow();
});

it("uses the Windows command processor without Wine", () => {
	const commandProcessor = "C:\\Windows\\System32\\cmd.exe";
	const command = getHostCommand({ commandProcessor }, "win32");
	expect(command).toEqual({
		args: ["/d", "/c", codesysCommandFilename],
		executable: commandProcessor,
	});
});

it.each(["darwin", "linux"] as const)(
	"uses Wine's command processor on %s",
	(platform) => {
		const wine = "/opt/wine/bin/wine";
		const command = getHostCommand(
			{
				commandProcessor: "cmd.exe",
				wine: {
					binary: wine,
					prefix: "/prefix",
					pathBinary: "winepath",
					debug: "-all",
					nativeExit: false,
				},
			},
			platform,
		);
		expect(command).toEqual({
			args: ["cmd", "/d", "/c", codesysCommandFilename],
			executable: wine,
		});
	},
);
