#!/usr/bin/env bun
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildFiles } from "./artifacts";
import { buildProject } from "./build";
import { loadConfig } from "./config";
import { createCodesysHost } from "./host/codesys-host";
import { createCodesysWorker, withWorkerLock } from "./host/codesys-worker";
import { runProject } from "./run";
import { loadSources } from "./sources";

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	allowPositionals: true,
	options: {
		config: { type: "string" },
		help: { type: "boolean", short: "h" },
	},
});
const [command, project] = positionals;
if (values.help || !command) {
	console.log(`codesys-build <command> [--config path/to/codesys-build.config.ts]

  check           Parse sources and validate the entry without launching CODESYS
  build           Replace the build output with a compiled project and boot application
  run             Install the completed build in Docker and start its application
  open [project]  Open the built project (or an explicit project path) in the IDE
  launch-worker   Start or reuse the background build worker
  stop-worker     Stop this project's background build worker

The config module must export a named config. Requires Bun and an installed CODESYS IDE.`);
} else {
	if (
		!["check", "build", "run", "open", "launch-worker", "stop-worker"].includes(
			command,
		)
	) {
		throw new Error(`Unknown command: ${command}`);
	}
	if (positionals.length > (command === "open" ? 2 : 1)) {
		throw new Error("Unexpected positional arguments");
	}
	const config = await loadConfig(values.config);
	if (command === "check") {
		const sources = await loadSources(config);
		console.log(
			`Validated ${sources.objects.length} application objects; entry ${sources.entry}. ST compilation requires the build command.`,
		);
	} else if (command === "build") {
		const result = await buildProject(config);
		console.log(`Completed build. Artifacts: ${result.directory}`);
	} else if (command === "run") {
		await runProject(config);
	} else if (command === "open") {
		const directory = await createCodesysHost(config).openProject(
			project ? resolve(project) : resolve(config.outDir, buildFiles.project),
		);
		console.log(`Opened CODESYS. Log: ${directory}/codesys.log`);
	} else {
		await withWorkerLock(config, async () => {
			const worker = createCodesysWorker(config);
			if (command === "stop-worker") {
				await worker.stop();
			} else {
				await worker.launch();
			}
		});
	}
}
