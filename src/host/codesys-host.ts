import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { ResolvedConfig } from "../config";
import {
	codesysCommand,
	codesysCommandFilename,
	editorCommand,
	getHostCommand,
} from "./codesys-command";

import { toWindowsPath } from "./windows-path";

const execute = promisify(execFile);

export const createCodesysHost = (config: ResolvedConfig) => {
	const native = process.platform === "win32";
	const { codesys, timeouts } = config;
	const hostEnv = {
		// Child processes inherit OS settings such as PATH and DISPLAY.
		...process.env,
		WINEPREFIX: codesys.wine?.prefix,
		WINEDEBUG: codesys.wine?.debug,
		CODESYS_BUILD_NATIVE_EXIT: String(codesys.wine?.nativeExit ?? false),
	};

	const check = async () => {
		await access(codesys.executable);
		if (!native) {
			await execute(codesys.wine?.binary ?? "wine", ["--version"], {
				env: hostEnv,
				timeout: timeouts.hostCommand,
			}).catch((cause: unknown) => {
				throw new Error(
					"Wine is missing. Install Wine; Winetricks alone cannot run CODESYS",
					{ cause },
				);
			});
		}
	};

	const launch = async (
		directory: string,
		command: string,
		launchEnv: NodeJS.ProcessEnv,
	) => {
		await writeFile(resolve(directory, codesysCommandFilename), command);
		const executable = await toWindowsPath(codesys.executable, codesys.wine);
		const launcher = getHostCommand(codesys);
		const log = await open(resolve(directory, "codesys.log"), "w");
		try {
			const child = spawn(launcher.executable, launcher.args, {
				cwd: directory,
				detached: true,
				env: {
					...hostEnv,
					...launchEnv,
					CODESYS_BUILD_EXE: executable,
					CODESYS_BUILD_PROFILE: codesys.profile,
				},
				stdio: ["ignore", log.fd, log.fd],
			});
			await new Promise<void>((resolve, reject) => {
				child.once("error", reject);
				child.once("spawn", resolve);
			});
			if (!child.pid) {
				throw new Error("CODESYS launcher has no process ID");
			}
			child.unref();
			return child.pid;
		} finally {
			await log.close();
		}
	};

	return {
		openProject: async (project: string) => {
			await access(project);
			await check();
			await mkdir(config.outDir, { recursive: true });
			const directory = await mkdtemp(resolve(config.outDir, "editor-"));
			// A persistent --runscript disables editing; only the worker runs a script.
			await launch(directory, editorCommand, {
				CODESYS_BUILD_PROJECT: await toWindowsPath(project, codesys.wine),
			});
			return directory;
		},
		startWorker: async (directory: string) => {
			await check();
			return launch(directory, codesysCommand, {
				CODESYS_BUILD_SCRIPT: await toWindowsPath(
					resolve(directory, "worker.py"),
					codesys.wine,
				),
				CODESYS_BUILD_SESSION: await toWindowsPath(directory, codesys.wine),
			});
		},
		terminate: async (pid: number) => {
			if (native) {
				await execute("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
					env: hostEnv,
					timeout: timeouts.hostCommand,
				});
				return;
			}
			process.kill(-pid, "SIGKILL");
		},
	};
};
