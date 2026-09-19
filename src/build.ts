import { createHash } from "node:crypto";
import {
	access,
	copyFile,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { buildFiles, readBuild } from "./artifacts";
import type { ResolvedConfig } from "./config";
import { createCodesysWorker, withWorkerLock } from "./host/codesys-worker";
import { loadSources } from "./sources";

export const buildProject = async (config: ResolvedConfig) => {
	return withWorkerLock(config, async () => {
		// Invalidate the previous build before validation, so run cannot deploy stale
		// output after a failed rebuild. Keep the last project available for inspection.
		await rm(resolve(config.outDir, buildFiles.receipt), { force: true });
		const sources = await loadSources(config);
		await access(config.template);
		const worker = createCodesysWorker(config);
		const session = await worker.launch();
		const directory = resolve(config.outDir, ".codesys/build");
		await rm(directory, { recursive: true, force: true });
		await mkdir(resolve(directory, "runtime"), { recursive: true });
		const template = resolve(directory, "Template.project");
		await copyFile(config.template, template);
		const request = {
			...sources,
			task: config.task,
			removeObjects: config.removeObjects,
			symbols: config.symbols,
			mode: "build",
			output: buildFiles.output,
			project: buildFiles.project,
			receipt: buildFiles.receipt,
			template: "Template.project",
			templateHash: createHash("sha256")
				.update(await readFile(template))
				.digest("hex"),
		};
		await writeFile(
			resolve(directory, "request.json"),
			JSON.stringify(request, null, 2),
		);
		console.log(`CODESYS build: ${config.outDir}`);
		try {
			await worker.request(session, { action: "build" }, config.timeouts.build);
			const compiled = await readBuild(directory);
			await copyFile(
				compiled.project,
				resolve(config.outDir, buildFiles.project),
			);
			// Builds and runs share the lock. Removing the receipt above keeps a failed
			// publication from looking complete even if only some files were replaced.
			await rm(resolve(config.outDir, "runtime"), {
				recursive: true,
				force: true,
			});
			await rename(
				resolve(directory, "runtime"),
				resolve(config.outDir, "runtime"),
			);
			await writeFile(
				resolve(config.outDir, buildFiles.receipt),
				JSON.stringify(
					{ mode: "build", application: compiled.application },
					null,
					2,
				),
			);
			return await readBuild(config.outDir);
		} catch (cause) {
			throw new Error(
				`CODESYS build failed. Inspect ${directory}/progress.log, error.txt and ${session.directory}/codesys.log`,
				{ cause },
			);
		}
	});
};
