import { expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

it("installs a standalone archive with a working CLI and its compiler resources", async () => {
	const root = await mkdtemp(resolve(tmpdir(), "codesys-package-"));
	try {
		const archive = resolve(root, "codesys-build.tgz");
		await execute(
			process.execPath,
			["pm", "pack", "--filename", archive, "--ignore-scripts"],
			{ cwd: packageRoot },
		);
		const { stdout: contents } = await execute("tar", ["-tzf", archive]);
		for (const artifact of [
			"src/cli.ts",
			"src/st/parse.ts",
			"python/build.py",
			"python/worker.py",
			"docs/sources.md",
			"examples/frame-assembly/README.md",
			"examples/frame-assembly/templates/local.project",
		]) {
			expect(contents.split("\n")).toContain(`package/${artifact}`);
		}
		expect(contents).not.toMatch(
			/node_modules|\/build\/|\.test\.ts|__pycache__/,
		);
		await writeFile(
			resolve(root, "package.json"),
			JSON.stringify({
				name: "package-consumer",
				private: true,
				type: "module",
			}),
		);
		await execute(
			process.execPath,
			["add", "--dev", archive, "--ignore-scripts"],
			{ cwd: root },
		);
		await mkdir(resolve(root, "src"));
		await writeFile(
			resolve(root, "src/Main.st"),
			"PROGRAM Main\nRETURN;\nEND_PROGRAM",
		);
		await writeFile(
			resolve(root, "codesys-build.config.ts"),
			`import { defineConfig } from "codesys-build";
export const config = defineConfig({
	codesys: { executable: "CODESYS.exe", profile: "fixture", wine: { prefix: ".wine" } },
	template: "base.project"
});`,
		);
		const installed = resolve(root, "node_modules/codesys-build");
		// Run outside the consumer directory: neither module loading nor config paths
		// may depend on the package checkout or on the shell's working directory.
		const result = await execute(
			process.execPath,
			[
				resolve(root, "node_modules/.bin/codesys-build"),
				"check",
				"--config",
				resolve(root, "codesys-build.config.ts"),
			],
			{ cwd: dirname(root) },
		);
		expect(result.stdout).toContain("entry Main");
		for (const script of ["build.py", "worker.py"]) {
			expect(await readFile(resolve(installed, "python", script), "utf8")).toBe(
				await readFile(resolve(packageRoot, "python", script), "utf8"),
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 30_000);
