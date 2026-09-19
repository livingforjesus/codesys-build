import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { readBuild } from "./artifacts";
import type { ResolvedConfig } from "./config";
import { withWorkerLock } from "./host/codesys-worker";
import { getApplicationStatus } from "./runtime-status";

const execute = promisify(execFile);
const composeSchema = z.object({
	services: z.record(
		z.string(),
		z.object({
			volumes: z
				.array(
					z.object({
						type: z.string(),
						source: z.string().optional(),
						target: z.string(),
						read_only: z.boolean().default(false),
					}),
				)
				.default([]),
		}),
	),
});
const stateSchema = z.object({
	Running: z.boolean(),
	StartedAt: z.iso.datetime({ offset: true }),
});

/** Deploy the completed boot application to one CODESYS Virtual Control Compose service. */
export const runProject = async (config: ResolvedConfig) => {
	const runtime = config.runtime;
	if (!runtime) {
		throw new Error(
			"Configure runtime.composeFile before running this project",
		);
	}
	return withWorkerLock(config, async () => {
		// Validate before stopping anything. A missing receipt includes a failed rebuild.
		const build = await readBuild(config.outDir).catch((cause: unknown) => {
			throw new Error(
				`No complete build in ${config.outDir}. Run codesys-build build first.`,
				{ cause },
			);
		});
		const docker = (...args: string[]) =>
			execute("docker", args, {
				timeout: config.timeouts.runtime,
				maxBuffer: 8 * 1024 * 1024,
			});
		const compose = (...args: string[]) =>
			docker("compose", "--file", runtime.composeFile, ...args);
		const definition = composeSchema.parse(
			JSON.parse((await compose("config", "--format", "json")).stdout),
		);
		const service = definition.services[runtime.service];
		if (!service) {
			throw new Error(
				`Compose service ${runtime.service} does not exist in ${runtime.composeFile}`,
			);
		}
		for (const target of ["/conf/codesyscontrol", "/data/codesyscontrol"]) {
			const mount = service.volumes.find((volume) => volume.target === target);
			// Anonymous volumes and tmpfs are private to each container: files installed
			// by the helper would never reach the PLC. Both need the same writable mount.
			if (
				!mount?.source ||
				mount.read_only ||
				!["volume", "bind"].includes(mount.type)
			) {
				throw new Error(
					`Compose service ${runtime.service} must persist ${target} in a writable named volume or bind mount`,
				);
			}
		}
		const installer = await readFile(
			new URL("../runtime/install.sh", import.meta.url),
			"utf8",
		);
		console.log(
			`Installing ${build.application} in Docker service ${runtime.service}`,
		);
		await compose("stop", runtime.service);
		// The helper uses the service's volumes without starting its PLC or publishing
		// ports. Its read-only artifact mount is removed with the helper container.
		await compose(
			"run",
			"--rm",
			"--no-deps",
			"-T",
			"--volume",
			`${dirname(build.output)}:/codesys-build:ro`,
			"--entrypoint",
			"/bin/sh",
			runtime.service,
			"-c",
			installer,
			"codesys-build-install",
			build.application,
		);
		await compose("up", "--detach", "--no-deps", runtime.service);
		const containers = (
			await compose("ps", "--all", "--quiet", runtime.service)
		).stdout
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (containers.length !== 1 || !containers[0]) {
			throw new Error(
				`Expected one container for Compose service ${runtime.service}`,
			);
		}
		const container = containers[0];
		const deadline = Date.now() + config.timeouts.runtime;
		while (true) {
			const state = stateSchema.parse(
				JSON.parse(
					(await docker("inspect", "--format", "{{json .State}}", container))
						.stdout,
				),
			);
			if (!state.Running) {
				throw new Error(
					`Docker service ${runtime.service} exited before the application started. Check docker logs ${container}.`,
				);
			}
			// Use this container start time, not the host clock or an old "started" event.
			const { stdout: log } = await docker(
				"exec",
				container,
				"/bin/sh",
				"-c",
				"if [ -f /data/codesyscontrol/codesyscontrol.log ]; then cat /data/codesyscontrol/codesyscontrol.log; fi",
			);
			const status = getApplicationStatus(
				log,
				build.application,
				Date.parse(state.StartedAt),
			);
			if (status === "running") {
				console.log(`${build.application} is running in ${runtime.service}`);
				return { ...build, container };
			}
			if (status === "failed" || Date.now() >= deadline) {
				throw new Error(
					`CODESYS did not start ${build.application}. Runtime log:\n${log.split("\n").slice(-25).join("\n")}`,
				);
			}
			await delay(250);
		}
	});
};
