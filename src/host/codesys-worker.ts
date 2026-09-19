// Engineering CLI lifecycle and diagnostics.
import { createHash, randomUUID } from "node:crypto";
import {
	access,
	copyFile,
	mkdir,
	mkdtemp,
	open,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ResolvedConfig } from "../config";
import { codesysCommand } from "./codesys-command";
import { createCodesysHost } from "./codesys-host";

const pythonDirectory = fileURLToPath(
	new URL("../../python/", import.meta.url),
);

const sessionSchema = z.object({
	directory: z.string(),
	fingerprint: z.string(),
	pid: z.int().positive(),
});

type Session = z.infer<typeof sessionSchema>;

type WorkerCommand =
	| { action: "build"; directory: string }
	| { action: "ping" | "stop" };

const hasCode = (error: unknown, code: string) =>
	error instanceof Error && "code" in error && error.code === code;

const isProcessAlive = (pid: number) => {
	try {
		// Signal 0 checks process existence and permissions without killing it.
		// Only ESRCH means it is gone; permission errors must still propagate.
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (hasCode(error, "ESRCH")) {
			return false;
		}
		throw error;
	}
};

const readJson = async (path: string): Promise<unknown> => {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	}
};

const writeJson = async (path: string, value: unknown) => {
	// Readers may poll while we write. A temporary file in the same directory
	// lets rename publish the complete JSON atomically, without exposing partial data.
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(value, null, 2));
	await rename(temporary, path);
};

/** Serializes startup and builds across CLI processes, including separate terminals. */
export const withWorkerLock = async <T>(
	config: ResolvedConfig,
	run: () => Promise<T>,
) => {
	await mkdir(resolve(config.outDir, "ide"), { recursive: true });
	const path = resolve(config.outDir, "ide/command.lock");
	const deadline = Date.now() + config.timeouts.build + config.timeouts.startup;
	while (true) {
		const lock = await open(path, "wx").catch((error: unknown) => {
			if (hasCode(error, "EEXIST")) {
				return;
			}
			throw error;
		});

		if (lock) {
			try {
				await lock.writeFile(String(process.pid));
				return await run();
			} finally {
				await lock.close();
				await unlink(path);
			}
		}

		const owner = Number(
			await readFile(path, "utf8").catch((error: unknown) => {
				if (hasCode(error, "ENOENT")) {
					return "";
				}
				throw error;
			}),
		);
		if (owner > 0 && !isProcessAlive(owner)) {
			// Do not race another client by deleting a lock that it may have replaced.
			throw new Error(
				`An interrupted command left ${path}. Remove that lock file and retry.`,
			);
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out waiting for another CODESYS command (${path})`,
			);
		}
		await delay(200);
	}
};

/** The caller holds withWorkerLock throughout a command, so the mailbox has one writer. */
export const createCodesysWorker = (config: ResolvedConfig) => {
	const host = createCodesysHost(config);
	const statePath = resolve(config.outDir, "ide/session.json");
	const verifiedProcesses = new Set<number>();

	const readSession = async (): Promise<Session | undefined> => {
		const value = await readJson(statePath);
		if (value === undefined) {
			return undefined;
		}
		const session = sessionSchema.safeParse(value);
		if (!session.success) {
			throw new Error(`Invalid CODESYS session file: ${statePath}`, {
				cause: session.error,
			});
		}
		return session.data;
	};

	const terminate = async (session: Session) => {
		if (isProcessAlive(session.pid)) {
			await host.terminate(session.pid).catch((error: unknown) => {
				if (isProcessAlive(session.pid)) {
					throw error;
				}
			});
		}
		// Let the launcher reap its child before another error handler or CLI
		// checks this PID. Sending a second group kill can otherwise race exit.
		const deadline = Date.now() + config.timeouts.terminate;
		while (isProcessAlive(session.pid)) {
			if (Date.now() >= deadline) {
				throw new Error("CODESYS launcher did not exit after termination");
			}
			await delay(50);
		}
	};

	const request = async (
		session: Session,
		command: WorkerCommand,
		timeoutMs: number,
	) => {
		const id = randomUUID();
		const reply = resolve(session.directory, `${id}.json`);
		await writeJson(resolve(session.directory, "request.json"), {
			...command,
			id,
		});
		const deadline = Date.now() + timeoutMs;
		while (true) {
			const result = await readJson(reply);
			if (result !== undefined) {
				await unlink(reply);
				const response = z
					.object({
						error: z.string().optional(),
						id: z.literal(id),
						ok: z.boolean(),
					})
					.safeParse(result);
				if (!response.success) {
					throw new Error("CODESYS returned an invalid worker response", {
						cause: response.error,
					});
				}
				verifiedProcesses.add(session.pid);
				if (!response.data.ok) {
					throw new Error(response.data.error ?? "CODESYS build failed");
				}
				return;
			}
			if (!isProcessAlive(session.pid)) {
				throw new Error(
					`CODESYS exited before completing ${command.action}. See ${session.directory}/codesys.log`,
				);
			}
			if (Date.now() >= deadline) {
				// A saved PID can belong to another process after a reboot. Only kill
				// a process we launched or whose worker answered in this invocation.
				if (!verifiedProcesses.has(session.pid)) {
					throw new Error(
						`CODESYS ${command.action} timed out without a worker response. Close the dedicated IDE if it is still running, then retry. Log: ${session.directory}/codesys.log`,
					);
				}
				await terminate(session);
				throw new Error(
					`CODESYS ${command.action} timed out after ${timeoutMs} ms; the worker was stopped. See ${session.directory}/codesys.log`,
				);
			}
			await delay(200);
		}
	};

	const launch = async () => {
		await access(config.codesys.executable);
		const fingerprint = createHash("sha256")
			.update(
				JSON.stringify({
					builder: await readFile(resolve(pythonDirectory, "build.py"), "utf8"),
					command: codesysCommand,
					codesys: config.codesys,
					worker: await readFile(resolve(pythonDirectory, "worker.py"), "utf8"),
				}),
			)
			.digest("hex");
		const previous = await readSession();
		if (previous && isProcessAlive(previous.pid)) {
			if (previous.fingerprint !== fingerprint) {
				throw new Error(
					"CODESYS settings or worker scripts changed. Run stop-worker, then launch-worker to reload them.",
				);
			}
			await request(previous, { action: "ping" }, config.timeouts.startup);
			console.log(
				`Reusing CODESYS worker (${previous.pid}). Log: ${previous.directory}/codesys.log`,
			);
			return previous;
		}

		const directory = await mkdtemp(resolve(config.outDir, "ide/session-"));
		await copyFile(
			resolve(pythonDirectory, "build.py"),
			resolve(directory, "build.py"),
		);
		await copyFile(
			resolve(pythonDirectory, "worker.py"),
			resolve(directory, "worker.py"),
		);
		console.log(`Starting CODESYS. Log: ${directory}/codesys.log`);
		const pid = await host.startWorker(directory);
		const session = { directory, fingerprint, pid };
		verifiedProcesses.add(pid);
		try {
			await writeJson(statePath, session);
			await request(session, { action: "ping" }, config.timeouts.startup);
		} catch (error) {
			await terminate(session);
			throw error;
		}
		console.log(`CODESYS worker ready (${session.pid})`);
		return session;
	};

	const stop = async () => {
		const session = await readSession();
		if (!session || !isProcessAlive(session.pid)) {
			console.log("CODESYS worker is already stopped");
			return;
		}
		await request(session, { action: "stop" }, config.timeouts.stop);
		const deadline = Date.now() + config.timeouts.stop;
		while (isProcessAlive(session.pid)) {
			if (Date.now() >= deadline) {
				await terminate(session);
				break;
			}
			await delay(200);
		}
		console.log("CODESYS worker stopped");
	};

	return { launch, request, stop };
};
