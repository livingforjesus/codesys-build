import { execFile } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { relative, resolve, sep, win32 } from "node:path";
import { promisify } from "node:util";
import type { ResolvedConfig } from "../config";
import { commandArgumentSchema } from "./codesys-command";
import { codesysTimeouts } from "./codesys-timeouts";

const execute = promisify(execFile);

export const toWindowsPath = async (
	path: string,
	wine: ResolvedConfig["codesys"]["wine"],
	platform: NodeJS.Platform = process.platform,
) => {
	if (platform === "win32") {
		return commandArgumentSchema.parse(win32.resolve(path));
	}
	if (!wine?.prefix) {
		throw new Error("Configure codesys.wine.prefix for CODESYS on macOS/Linux");
	}

	// Resolve filesystem aliases (e.g. macOS /var -> /private/var) so the file
	// and drive roots are compared using the same paths. Fall back to the absolute
	// spelling when realpath cannot resolve the file, such as before it exists.
	const absolute = await realpath(resolve(path)).catch(() => resolve(path));
	// Wine stores drive mappings as symlinks, e.g. dosdevices/c: -> ../drive_c.
	// Reading these links avoids starting Wine just to convert a path.
	const devices = resolve(wine?.prefix, "dosdevices");
	const drives = await readdir(devices).catch(() => []);
	const mappings = await Promise.all(
		drives
			.filter((drive) => /^[a-z]:$/i.test(drive))
			.map(async (drive) => {
				const root = await realpath(resolve(devices, drive)).catch(
					() => undefined,
				);
				if (!root) {
					return;
				}

				const suffix = relative(root, absolute);
				// ".." or "../..." means the file is outside this drive's root.
				// Match a full segment so a name such as "..notes" remains valid.
				if (suffix === ".." || suffix.startsWith(`..${sep}`)) {
					return;
				}

				return {
					root,
					windows: win32.join(`${drive.toUpperCase()}\\`, ...suffix.split(sep)),
				};
			}),
	);
	// Mappings can overlap: C: -> /wine/drive_c and Z: -> / may both contain
	// the file. Prefer the longest matching root to use the most specific drive.
	const [mapping] = mappings
		.filter((value) => value !== undefined)
		.sort((a, b) => b.root.length - a.root.length);
	if (mapping) {
		return commandArgumentSchema.parse(mapping.windows);
	}

	// No readable drive mapping covers the path; ask Wine to convert it instead.
	const result = await execute(
		wine.pathBinary,
		["-w", resolve(path)],
		// Wine inherits OS process settings.
		{
			env: { ...process.env, WINEPREFIX: wine.prefix, WINEDEBUG: wine.debug },
			timeout: codesysTimeouts.hostCommand,
		},
	);
	return commandArgumentSchema.parse(result.stdout.trim());
};
