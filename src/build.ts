import { createHash } from "node:crypto";
import {
	access,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import type { ResolvedConfig } from "./config";
import { createCodesysWorker, withWorkerLock } from "./host/codesys-worker";
import { loadSources } from "./sources";

export const buildProject = async (config: ResolvedConfig) => {
	// Invalid sources fail before starting CODESYS or allocating a worker session.
	const sources = await loadSources(config);
	await access(config.template);
	return withWorkerLock(config, async () => {
		const worker = createCodesysWorker(config);
		const session = await worker.launch();
		const directory = await mkdtemp(resolve(config.outDir, "run-"));
		await mkdir(resolve(directory, "runtime"));
		const template = resolve(directory, "Template.project");
		await copyFile(config.template, template);
		const request = {
			...sources,
			task: config.task,
			removeObjects: config.removeObjects,
			symbols: config.symbols,
			mode: "build",
			output: "runtime/Application.app",
			project: "Application.project",
			receipt: "compiled.json",
			template: "Template.project",
			templateHash: createHash("sha256")
				.update(await readFile(template))
				.digest("hex"),
		};
		await writeFile(
			resolve(directory, "request.json"),
			JSON.stringify(request, null, 2),
		);
		console.log(`CODESYS build: ${directory}`);
		try {
			await worker.request(
				session,
				{ action: "build", directory: basename(directory) },
				config.timeouts.build,
			);
			const receipt: unknown = JSON.parse(
				await readFile(resolve(directory, request.receipt), "utf8"),
			);
			if (!z.object({ mode: z.literal("build") }).safeParse(receipt).success) {
				throw new Error("CODESYS did not produce a valid success receipt");
			}
			for (const file of [request.output, request.project]) {
				const artifact = await stat(resolve(directory, file));
				if (!artifact.isFile() || artifact.size === 0) {
					throw new Error(`CODESYS produced an empty artifact: ${file}`);
				}
			}
			const result = {
				directory,
				project: resolve(directory, request.project),
				output: resolve(directory, request.output),
			};
			await writeFile(
				resolve(directory, "success.json"),
				JSON.stringify(result, null, 2),
			);
			return result;
		} catch (cause) {
			throw new Error(
				`CODESYS build failed. Inspect ${directory}/progress.log, error.txt and ${session.directory}/codesys.log`,
				{ cause },
			);
		}
	});
};
