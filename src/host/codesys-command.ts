import { z } from "zod";
import type { ResolvedConfig } from "../config";

export const codesysCommandFilename = "run.cmd";

// Keep arguments in the Windows command line: Wine's direct launcher loses the
// quoting CODESYS needs around profile names containing spaces.
const createCommand = (arguments_: string) =>
	[
		"@echo off",
		"setlocal DisableDelayedExpansion",
		`"%CODESYS_BUILD_EXE%" --profile="%CODESYS_BUILD_PROFILE%" ${arguments_}`,
		"exit /b %errorlevel%",
		"",
	].join("\r\n");

export const codesysCommand = createCommand(
	'--noUI --runscript="%CODESYS_BUILD_SCRIPT%"',
);

export const editorCommand = createCommand(
	'--project="%CODESYS_BUILD_PROJECT%"',
);

export const commandArgumentSchema = z
	.string()
	.refine(
		(value) => value.trim().length > 0,
		"Command arguments must not be empty",
	)
	.refine(
		(value) => !/["\r\n\0]/.test(value),
		"Command arguments must not contain quotes, line breaks, or null bytes",
	);

export const getHostCommand = (
	config: Pick<ResolvedConfig["codesys"], "commandProcessor" | "wine">,
	platform: NodeJS.Platform = process.platform,
) =>
	platform === "win32"
		? {
				args: ["/d", "/c", codesysCommandFilename],
				executable: config.commandProcessor,
			}
		: {
				args: ["cmd", "/d", "/c", codesysCommandFilename],
				executable: config.wine?.binary ?? "wine",
			};
