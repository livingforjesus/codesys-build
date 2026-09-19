import { expect, it } from "bun:test";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { codesysCommandFilename } from "../src/host/codesys-command";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const execute = promisify(execFile);

type Behavior =
	| "success"
	| "failure"
	| "missing-receipt"
	| "invalid-receipt"
	| "invalid-response"
	| "timeout"
	| "crash"
	| "startup-timeout"
	| "empty-output"
	| "missing-project";

const withPortableBuild = async (
	check: (fixture: {
		root: string;
		run: (
			command: "build" | "open" | "launch-worker" | "stop-worker",
			overrides?: { profile?: string },
		) => Promise<{ stdout: string; stderr: string }>;
		behavior: (value: Behavior) => Promise<void>;
		outputs: () => Promise<Array<string>>;
		pid: () => Promise<number>;
		launches: () => Promise<Array<string>>;
	}) => Promise<void>,
) => {
	// Replace the local CODESYS environment at the subprocess boundary.
	const environment = process.env;
	const root = await mkdtemp(resolve(tmpdir(), "codesys portable & build-"));
	const compiler = resolve(root, "compiler.cjs");
	const winepath = resolve(root, "winepath.cjs");
	const pid = async () => {
		const value: unknown = JSON.parse(
			await readFile(resolve(root, "build/ide/session.json"), "utf8"),
		);
		return z.object({ pid: z.number().int().positive() }).parse(value).pid;
	};
	const run = async (command: string, overrides: { profile?: string } = {}) => {
		if (overrides.profile) {
			const file = resolve(root, "codesys-build.config.ts");
			await writeFile(
				file,
				(await readFile(file, "utf8")).replace(
					"CODESYS test profile",
					overrides.profile,
				),
			);
		}
		return execute(process.execPath, [cli, command], {
			cwd: root,
			env: {
				...Object.fromEntries(
					Object.entries(environment).filter(
						([key]) => !key.startsWith("CODESYS_") && !key.startsWith("WINE"),
					),
				),
				CODESYS_TEST_COMPILER: compiler,
				CODESYS_TEST_ROOT: root,
				CODESYS_TEST_RUNNER: process.execPath,
				WINE_BIN: "must-not-be-used",
				WINEPATH_BIN: "must-not-be-used",
				WINEPREFIX: "/must-not-be-used",
			},
			timeout: 15_000,
		});
	};
	try {
		await mkdir(resolve(root, "src"));
		await writeFile(
			resolve(root, "src/Main.st"),
			"PROGRAM Main\nRETURN;\nEND_PROGRAM",
		);
		await mkdir(resolve(root, "templates"));
		await writeFile(resolve(root, "templates/local.project"), "base project");
		await writeFile(resolve(root, "behavior.txt"), "success");
		// Stand in only for CODESYS/Wine. The CLI, file protocol, locking and source
		// snapshots are real; the Python worker is exercised separately in test_worker.py.
		await writeFile(
			compiler,
			`#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
if (process.argv.includes("--version")) process.exit(0);
const root = process.env.CODESYS_TEST_ROOT;
const session = process.env.CODESYS_BUILD_SESSION;
if (!session) {
  fs.writeFileSync(path.join(root, "editor-command.txt"), fs.readFileSync(${JSON.stringify(codesysCommandFilename)}, "utf8"));
  fs.writeFileSync(path.join(root, "editor-project.txt"), process.env.CODESYS_BUILD_PROJECT);
  process.exit(0);
}
fs.appendFileSync(path.join(root, "launches.txt"), process.pid + "\\n");
fs.writeFileSync(path.join(root, "worker-command.txt"), fs.readFileSync(${JSON.stringify(codesysCommandFilename)}, "utf8"));
let blocked = false;
setInterval(() => {
  if (blocked || fs.readFileSync(path.join(root, "behavior.txt"), "utf8") === "startup-timeout") return;
  const mailbox = path.join(session, "request.json");
  if (!fs.existsSync(mailbox)) return;
  const command = JSON.parse(fs.readFileSync(mailbox, "utf8"));
  fs.unlinkSync(mailbox);
  const response = { id: command.id, ok: true };
  if (command.action === "build") {
    const directory = path.join(root, "build", command.directory);
    const request = JSON.parse(fs.readFileSync(path.join(directory, "request.json"), "utf8"));
    const behavior = fs.readFileSync(path.join(root, "behavior.txt"), "utf8");
    if (behavior === "timeout") { blocked = true; return; }
    fs.writeFileSync(path.join(directory, request.output), behavior === "empty-output" ? "" : request.objects.find(object => object.name === request.entry).implementation);
    if (behavior !== "missing-project") fs.writeFileSync(path.join(directory, request.project), "compiled project");
    if (behavior !== "missing-receipt") fs.writeFileSync(path.join(directory, request.receipt), JSON.stringify({ mode: behavior === "invalid-receipt" ? "invalid" : "build" }));
    if (behavior === "crash") process.exit(2);
    if (behavior === "invalid-response") response.ok = "true";
    if (behavior === "failure") { response.ok = false; response.error = "Fixture compiler error"; }
  }
  const reply = path.join(session, command.id + ".json");
  fs.writeFileSync(reply + ".tmp", JSON.stringify(response));
  fs.renameSync(reply + ".tmp", reply);
  if (command.action === "stop") process.exit(0);
}, 20);
`,
			{ mode: 0o755 },
		);
		await writeFile(
			resolve(root, "compiler.cmd"),
			'@echo off\r\n"%CODESYS_TEST_RUNNER%" "%CODESYS_TEST_COMPILER%"\r\nexit /b %errorlevel%\r\n',
		);
		await writeFile(
			winepath,
			'#!/usr/bin/env bun\nrequire("node:fs").appendFileSync(require("node:path").join(process.env.CODESYS_TEST_ROOT, "paths.txt"), "conversion\\n");\nconsole.log(process.argv.at(-1));\n',
			{ mode: 0o755 },
		);
		await writeFile(
			resolve(root, "codesys-build.config.ts"),
			`export const config = ${JSON.stringify({
				codesys: {
					executable: "compiler.cmd",
					profile: "CODESYS test profile",
					wine: { prefix: root, binary: compiler, pathBinary: winepath },
				},
				template: "templates/local.project",
				timeouts: { build: 1000, startup: 2000 },
			})};`,
		);
		await check({
			behavior: (value) => writeFile(resolve(root, "behavior.txt"), value),
			launches: async () =>
				(await readFile(resolve(root, "launches.txt"), "utf8"))
					.trim()
					.split("\n"),
			outputs: async () =>
				(await readdir(resolve(root, "build")))
					.filter((name) => name.startsWith("run-"))
					.map((name) => resolve(root, "build", name)),
			pid,
			root,
			run,
		});
	} finally {
		try {
			await run("stop-worker");
		} catch {
			// A failed assertion must not leave the fixture compiler running.
			const processId = await pid().catch(() => undefined);
			if (processId) {
				if (process.platform === "win32") {
					await execute("taskkill.exe", [
						"/pid",
						String(processId),
						"/t",
						"/f",
					]).catch(() => undefined);
				} else {
					try {
						process.kill(-processId, "SIGKILL");
					} catch {
						// The fixture may already have exited.
					}
				}
			}
		}
		await rm(root, { force: true, recursive: true });
	}
};

it("auto-launches and builds a project through the package CLI", async () => {
	await withPortableBuild(async ({ root, run, outputs }) => {
		const implementation =
			"\nLineIO.Conveyor_Inbound.Cards[1].Output.MotionAsserted := TRUE;\n";
		await writeFile(
			resolve(root, "src/Main.st"),
			`PROGRAM Main${implementation}END_PROGRAM`,
		);
		await run("build");
		const directories = await outputs();
		expect(directories).toHaveLength(1);
		for (const directory of directories) {
			expect(
				await readFile(resolve(directory, "runtime/Application.app"), "utf8"),
			).toBe(implementation);
			expect(await Bun.file(resolve(directory, "success.json")).exists()).toBe(
				true,
			);
		}
		expect(
			await readFile(resolve(root, "templates/local.project"), "utf8"),
		).toBe("base project");
	});
}, 20_000);

it("reuses an explicitly launched IDE across launches and changed-source builds", async () => {
	await withPortableBuild(async ({ root, run, pid, launches, outputs }) => {
		await run("launch-worker");
		expect(
			await readFile(resolve(root, "worker-command.txt"), "utf8"),
		).toContain("--noUI");
		const originalPid = await pid();
		const conversions = await Bun.file(resolve(root, "paths.txt"))
			.text()
			.catch(() => "");
		await run("launch-worker");
		await run("build");
		const implementation =
			"\nLineIO.Conveyor_Inbound.Cards[1].Output.MotionAsserted := FALSE;\n";
		await writeFile(
			resolve(root, "src/Main.st"),
			`PROGRAM Main${implementation}END_PROGRAM`,
		);
		await run("build");
		expect(await pid()).toBe(originalPid);
		expect(await launches()).toHaveLength(1);
		expect(
			await Bun.file(resolve(root, "paths.txt"))
				.text()
				.catch(() => ""),
		).toBe(conversions);
		const directories = await outputs();
		expect(directories).toHaveLength(2);
		const artifacts = await Promise.all(
			directories.map((directory) =>
				readFile(resolve(directory, "runtime/Application.app"), "utf8"),
			),
		);
		expect(artifacts).toContain(implementation);
		expect(new Set(artifacts).size).toBe(2);
	});
}, 20_000);

it("serializes simultaneous launches and builds into one worker", async () => {
	await withPortableBuild(async ({ run, launches, outputs }) => {
		const results = await Promise.allSettled([
			run("launch-worker"),
			run("build"),
			run("build"),
		]);
		for (const result of results) {
			if (result.status === "rejected") {
				throw result.reason;
			}
		}
		expect(await launches()).toHaveLength(1);
		const directories = await outputs();
		expect(directories).toHaveLength(2);
		for (const directory of directories) {
			expect(await Bun.file(resolve(directory, "success.json")).exists()).toBe(
				true,
			);
		}
	});
}, 20_000);

it("sends the fingerprint of each copied template so the worker can invalidate its loaded project", async () => {
	await withPortableBuild(async ({ root, run, outputs }) => {
		await run("launch-worker");
		for (const template of [
			"device configuration A",
			"device configuration B",
		]) {
			await writeFile(resolve(root, "templates/local.project"), template);
			const previous = new Set(await outputs());
			await run("build");
			const directory = (await outputs()).find((path) => !previous.has(path));
			if (!directory) {
				throw new Error("Missing build output directory");
			}
			const request: unknown = await Bun.file(
				resolve(directory, "request.json"),
			).json();
			expect(request).toMatchObject({
				template: "Template.project",
				templateHash: createHash("sha256").update(template).digest("hex"),
			});
			expect(
				await readFile(resolve(directory, "Template.project"), "utf8"),
			).toBe(template);
		}
	});
}, 20_000);

it("rejects a failed build even with a receipt and reuses the worker after correction", async () => {
	await withPortableBuild(async ({ run, behavior, launches, outputs }) => {
		await behavior("failure");
		await expect(run("build")).rejects.toThrow("Fixture compiler error");
		for (const directory of await outputs()) {
			expect(await Bun.file(resolve(directory, "success.json")).exists()).toBe(
				false,
			);
		}
		await behavior("success");
		await run("build");
		expect(await launches()).toHaveLength(1);
	});
}, 20_000);

it("rejects a completed request without a compiler receipt", async () => {
	await withPortableBuild(async ({ run, behavior, outputs }) => {
		await behavior("missing-receipt");
		await expect(run("build")).rejects.toThrow("compiled.json");
		for (const directory of await outputs()) {
			expect(await Bun.file(resolve(directory, "success.json")).exists()).toBe(
				false,
			);
		}
	});
}, 20_000);

it.each([
	{ failure: "invalid-response", message: "invalid worker response" },
	{ failure: "invalid-receipt", message: "valid success receipt" },
	{ failure: "empty-output", message: "empty artifact" },
	{ failure: "missing-project", message: "Application.project" },
] as const)(
	"rejects a build with an $failure",
	async ({ failure, message }) => {
		await withPortableBuild(async ({ run, behavior, outputs }) => {
			await behavior(failure);
			await expect(run("build")).rejects.toThrow(message);
			const directories = await outputs();
			expect(directories).toHaveLength(1);
			for (const directory of directories) {
				expect(
					await Bun.file(resolve(directory, "success.json")).exists(),
				).toBe(false);
			}
		});
	},
	20_000,
);

it.each([
	{ failure: "timeout", message: "timed out" },
	{ failure: "crash", message: "exited before completing" },
] as const)(
	"restarts the worker after a build $failure without accepting incomplete output",
	async ({ failure, message }) => {
		await withPortableBuild(
			async ({ run, behavior, pid, launches, outputs }) => {
				await behavior(failure);
				await expect(run("build")).rejects.toThrow(message);
				const previousPid = await pid();
				expect(() => process.kill(previousPid, 0)).toThrow();
				for (const directory of await outputs()) {
					expect(
						await Bun.file(resolve(directory, "success.json")).exists(),
					).toBe(false);
				}
				await behavior("success");
				await run("build");
				expect(await launches()).toHaveLength(2);
			},
		);
	},
	20_000,
);

it("stops an IDE that never becomes ready and starts a new one on retry", async () => {
	await withPortableBuild(async ({ run, behavior, pid, launches }) => {
		await behavior("startup-timeout");
		await expect(run("launch-worker")).rejects.toThrow("timed out");
		const previousPid = await pid();
		expect(() => process.kill(previousPid, 0)).toThrow();
		await behavior("success");
		await run("launch-worker");
		expect(await launches()).toHaveLength(2);
	});
}, 20_000);

it("stops its worker explicitly and automatically relaunches for the next build", async () => {
	await withPortableBuild(async ({ run, pid, launches }) => {
		await run("launch-worker");
		const previousPid = await pid();
		await run("stop-worker");
		expect(() => process.kill(previousPid, 0)).toThrow();
		await run("build");
		expect(await launches()).toHaveLength(2);
	});
}, 20_000);

it("requires an explicit restart when worker settings change", async () => {
	await withPortableBuild(async ({ run, launches }) => {
		await run("launch-worker");
		await expect(
			run("build", { profile: "different profile" }),
		).rejects.toThrow("settings or worker scripts changed");
		expect(await launches()).toHaveLength(1);
	});
}, 20_000);

it("does not kill an unrelated process referenced by stale session metadata", async () => {
	await withPortableBuild(async ({ root, run }) => {
		await run("launch-worker");
		await run("stop-worker");
		const unrelated = spawn(
			process.execPath,
			["-e", "setInterval(() => {}, 1000)"],
			{ detached: true, stdio: "ignore" },
		);
		await new Promise<void>((resolve, reject) => {
			unrelated.once("spawn", resolve);
			unrelated.once("error", reject);
		});
		const processId = unrelated.pid;
		if (!processId) {
			throw new Error("Fixture process has no PID");
		}
		try {
			const path = resolve(root, "build/ide/session.json");
			const saved: unknown = JSON.parse(await readFile(path, "utf8"));
			if (!saved || typeof saved !== "object") {
				throw new Error("Missing saved session");
			}
			await writeFile(path, JSON.stringify({ ...saved, pid: processId }));
			await expect(run("launch-worker")).rejects.toThrow(
				"without a worker response",
			);
			expect(() => process.kill(processId, 0)).not.toThrow();
		} finally {
			if (unrelated.exitCode === null && unrelated.signalCode === null) {
				const exited = new Promise<void>((resolve) =>
					unrelated.once("close", () => resolve()),
				);
				unrelated.kill("SIGKILL");
				await exited;
			}
		}
	});
}, 20_000);

it("opens an editable IDE without a persistent script", async () => {
	await withPortableBuild(async ({ root, run }) => {
		await run("open");
		const file = resolve(root, "editor-command.txt");
		const deadline = Date.now() + 3000;
		while (!(await stat(file).catch(() => undefined))) {
			if (Date.now() > deadline) {
				const editor = (await readdir(resolve(root, "build"))).find((name) =>
					name.startsWith("editor-"),
				);
				throw new Error(
					`Fixture editor did not start: ${editor ? await readFile(resolve(root, "build", editor, "codesys.log"), "utf8") : "No editor directory"}`,
				);
			}
			await Bun.sleep(20);
		}
		const command = await readFile(file, "utf8");
		expect(command).toContain("--project=");
		expect(command).not.toContain("--runscript");
		expect(
			await realpath(
				await readFile(resolve(root, "editor-project.txt"), "utf8"),
			),
		).toBe(await realpath(resolve(root, "templates/local.project")));
	});
}, 20_000);

it("loads configuration relative to its file when invoked from another directory", async () => {
	await withPortableBuild(async ({ root }) => {
		const result = await execute(
			process.execPath,
			[cli, "check", "--config", resolve(root, "codesys-build.config.ts")],
			{ cwd: tmpdir() },
		);
		expect(result.stdout).toContain("entry Main");
	});
});

it("reports a missing named config export", async () => {
	await withPortableBuild(async ({ root }) => {
		await writeFile(
			resolve(root, "codesys-build.config.ts"),
			"export const unrelated = {};",
		);
		await expect(
			execute(process.execPath, [cli, "check"], { cwd: root }),
		).rejects.toThrow("must export a named config");
	});
});
