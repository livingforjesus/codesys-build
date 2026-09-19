import { expect, it } from "bun:test";
import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
type Behavior =
	| "running"
	| "old-log"
	| "stopped"
	| "exited"
	| "install-failure"
	| "missing-volume"
	| "anonymous-volume"
	| "tmpfs-volume"
	| "readonly-volume"
	| "bind-volume";

const withRuntime = async (
	behavior: Behavior,
	check: (fixture: {
		root: string;
		run: () => Promise<{ stdout: string }>;
		commands: () => Promise<string[][]>;
	}) => Promise<void>,
) => {
	const root = await realpath(
		await mkdtemp(resolve(tmpdir(), "codesys runtime & fixture-")),
	);
	try {
		await mkdir(resolve(root, "bin"));
		await mkdir(resolve(root, "build/runtime"), { recursive: true });
		await writeFile(
			resolve(root, "build/build.json"),
			JSON.stringify({ mode: "build", application: "Application" }),
		);
		for (const file of [
			"Application.project",
			"runtime/Application.app",
			"runtime/Application.crc",
		]) {
			await writeFile(resolve(root, "build", file), "compiled artifact");
		}
		await writeFile(
			resolve(root, "codesys-build.config.ts"),
			`export const config = ${JSON.stringify({
				codesys: {
					executable: "unused.exe",
					profile: "unused",
					wine: { prefix: ".wine" },
				},
				template: "unused.project",
				runtime: { composeFile: "compose.yaml" },
				timeouts: { runtime: 1500 },
			})};`,
		);
		// Replace only Docker. The package CLI, artifact validation and deployment
		// sequencing run normally, including paths containing spaces and ampersands.
		await writeFile(
			resolve(root, "bin/docker"),
			`#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.CODESYS_RUNTIME_TEST_ROOT;
const behavior = process.env.CODESYS_RUNTIME_TEST_BEHAVIOR;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, "commands.jsonl"), JSON.stringify(args) + "\\n");
const command = args[0] === "compose" ? args[3] : args[0];
if (command === "config") {
 const volumes = ["/conf/codesyscontrol", "/data/codesyscontrol"].map((target, index) => ({
  type: behavior === "tmpfs-volume" ? "tmpfs" : behavior === "bind-volume" ? "bind" : "volume",
  source: behavior === "anonymous-volume" ? undefined : path.join(root, "volume-" + index),
  target,
  read_only: behavior === "readonly-volume",
 }));
 console.log(JSON.stringify({ services: { plc: { volumes: behavior === "missing-volume" ? [] : volumes } } }));
}
if (command === "ps") console.log("fixture-container");
if (command === "inspect") console.log(JSON.stringify({ Running: behavior !== "exited", StartedAt: "2026-09-19T10:00:00Z" }));
if (command === "run" && behavior === "install-failure") { console.error("Fixture installer failed"); process.exit(2); }
if (command === "exec") {
 const timestamp = behavior === "old-log" ? "2026-09-18T10:00:01Z" : "2026-09-19T10:00:01Z";
 console.log(timestamp + ", 0x00000002, 1, 0, 10, Application [<app>Application</app>] started");
 if (behavior === "stopped") console.log("2026-09-19T10:00:02Z, 0x00000002, 1, 0, 11, Application [<app>Application</app>] stopped");
}
`,
			{ mode: 0o755 },
		);
		await check({
			root,
			run: () =>
				execute(process.execPath, [cli, "run"], {
					cwd: root,
					env: {
						...process.env,
						PATH: `${resolve(root, "bin")}${delimiter}${process.env["PATH"]}`,
						CODESYS_RUNTIME_TEST_ROOT: root,
						CODESYS_RUNTIME_TEST_BEHAVIOR: behavior,
					},
					timeout: 10_000,
				}),
			commands: async () =>
				(await readFile(resolve(root, "commands.jsonl"), "utf8"))
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line) as string[]),
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

it("installs the completed build before starting only its configured runtime service", async () => {
	await withRuntime("running", async ({ root, run, commands }) => {
		expect((await run()).stdout).toContain("Application is running in plc");
		const calls = await commands();
		const composeCalls = calls.filter((call) => call[0] === "compose");
		expect(composeCalls.map((call) => call[3])).toEqual([
			"config",
			"stop",
			"run",
			"up",
			"ps",
		]);
		const install = composeCalls.find((call) => call[3] === "run");
		if (!install) {
			throw new Error("Installer was not called");
		}
		expect(install).toContain(
			`${resolve(root, "build/runtime")}:/codesys-build:ro`,
		);
		expect(install).toContain("--no-deps");
		expect(install).toContain("--rm");
		expect(install.at(-1)).toBe("Application");
		expect(composeCalls.find((call) => call[3] === "up")?.slice(3)).toEqual([
			"up",
			"--detach",
			"--no-deps",
			"plc",
		]);
	});
});

it("rejects incomplete artifacts before invoking Docker", async () => {
	await withRuntime("running", async ({ root, run }) => {
		await rm(resolve(root, "build/runtime/Application.crc"));
		await expect(run()).rejects.toThrow("No complete build");
		expect(await Bun.file(resolve(root, "commands.jsonl")).exists()).toBe(
			false,
		);
	});
});

it.each([
	"missing-volume",
	"anonymous-volume",
	"tmpfs-volume",
	"readonly-volume",
] as const)("rejects %s before stopping a service", async (behavior) => {
	await withRuntime(behavior, async ({ run, commands }) => {
		await expect(run()).rejects.toThrow("must persist");
		expect((await commands()).map((call) => call[3])).toEqual(["config"]);
	});
});

it("supports persistent bind mounts", async () => {
	await withRuntime("bind-volume", async ({ run }) => {
		expect((await run()).stdout).toContain("Application is running in plc");
	});
});

it("leaves the runtime stopped when installation fails", async () => {
	await withRuntime("install-failure", async ({ run, commands }) => {
		await expect(run()).rejects.toThrow("Fixture installer failed");
		expect((await commands()).some((call) => call[3] === "up")).toBe(false);
	});
});

it.each([
	["old-log", "did not start"],
	["stopped", "did not start"],
	["exited", "exited before"],
] as const)(
	"rejects runtime state %s instead of reporting success",
	async (behavior, message) => {
		await withRuntime(behavior, async ({ run }) => {
			await expect(run()).rejects.toThrow(message);
		});
	},
);
