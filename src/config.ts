import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { commandArgumentSchema } from "./host/codesys-command";
import { codesysTimeouts } from "./host/codesys-timeouts";

const positiveMilliseconds = z.number().int().positive();
const pathSchema = z.string().trim().nonempty();
const wineSchema = z.strictObject({
	prefix: pathSchema,
	binary: pathSchema.default("wine"),
	pathBinary: pathSchema.default("winepath"),
	debug: z.string().default("-all"),
	nativeExit: z.boolean().default(false),
});
export const configSchema = z.strictObject({
	codesys: z.strictObject({
		executable: commandArgumentSchema,
		profile: commandArgumentSchema,
		wine: wineSchema.optional(),
		commandProcessor: pathSchema.default("cmd.exe"),
	}),
	template: pathSchema,
	sourceDir: pathSchema.default("src"),
	entry: pathSchema.default("src/Main.st"),
	outDir: pathSchema.default("build"),
	task: z.string().nonempty().default("MainTask"),
	removeObjects: z.array(z.string().nonempty()).default([]),
	symbols: z.boolean().default(false),
	timeouts: z
		.strictObject({
			startup: positiveMilliseconds.default(codesysTimeouts.startup),
			build: positiveMilliseconds.default(codesysTimeouts.build),
			stop: positiveMilliseconds.default(codesysTimeouts.stop),
			terminate: positiveMilliseconds.default(codesysTimeouts.terminate),
			hostCommand: positiveMilliseconds.default(codesysTimeouts.hostCommand),
		})
		.prefault({}),
});
export type CodesysBuildConfig = z.input<typeof configSchema>;
export type ResolvedConfig = z.output<typeof configSchema> & {
	configFile: string;
};

/** Keep config authoring typed; validation and relative path resolution happen at load. */
export const defineConfig = (config: CodesysBuildConfig): CodesysBuildConfig =>
	config;

export const resolveConfig = (
	input: unknown,
	configFile: string,
	platform: NodeJS.Platform = process.platform,
): ResolvedConfig => {
	const parsed = configSchema.parse(input);
	const root = dirname(resolve(configFile));
	if (platform !== "win32" && !parsed.codesys.wine) {
		throw new Error("codesys.wine is required on macOS/Linux");
	}
	const wine = platform === "win32" ? undefined : parsed.codesys.wine;
	return {
		...parsed,
		configFile: resolve(configFile),
		template: resolve(root, parsed.template),
		sourceDir: resolve(root, parsed.sourceDir),
		entry: resolve(root, parsed.entry),
		outDir: resolve(root, parsed.outDir),
		codesys: {
			...parsed.codesys,
			executable: resolve(root, parsed.codesys.executable),
			// Native Windows always uses normal shutdown, even with a copied Wine config.
			wine: wine ? { ...wine, prefix: resolve(root, wine.prefix) } : undefined,
		},
	};
};

export const loadConfig = async (file = "codesys-build.config.ts") => {
	const path = resolve(file);
	const module = (await import(pathToFileURL(path).href)) as {
		config?: unknown;
	};
	if (module.config === undefined) {
		throw new Error(`${path} must export a named config`);
	}
	return resolveConfig(module.config, path);
};
