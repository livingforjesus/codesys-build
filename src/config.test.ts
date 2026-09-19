import { expect, it } from "bun:test";
import { resolve } from "node:path";
import { configSchema, resolveConfig } from "./config";

const input = {
	codesys: {
		executable: "CODESYS.exe",
		profile: "CODESYS test profile",
		wine: { prefix: "wine" },
	},
	template: "templates/base.project",
};

it("resolves project paths relative to the configuration file", () => {
	const configFile = resolve("fixtures/project/codesys-build.config.ts");
	const config = resolveConfig(input, configFile, "linux");
	expect(config.sourceDir).toBe(resolve("fixtures/project/src"));
	expect(config.entry).toBe(resolve("fixtures/project/src/Main.st"));
	expect(config.outDir).toBe(resolve("fixtures/project/build"));
	expect(config.codesys.executable).toBe(
		resolve("fixtures/project/CODESYS.exe"),
	);
	expect(config.codesys.wine?.prefix).toBe(resolve("fixtures/project/wine"));
});

it("removes Wine settings and its exit workaround on native Windows", () => {
	const config = resolveConfig(
		{
			...input,
			codesys: { ...input.codesys, wine: { prefix: "wine", nativeExit: true } },
		},
		"config.ts",
		"win32",
	);
	expect(config.codesys.wine).toBeUndefined();
});

it.each(["darwin", "linux"] as const)(
	"requires explicit Wine configuration on %s",
	(platform) => {
		expect(() =>
			resolveConfig(
				{
					...input,
					codesys: { executable: "codesys.exe", profile: "profile" },
				},
				"config.ts",
				platform,
			),
		).toThrow("codesys.wine");
	},
);

it.each([
	{ ...input, entry: "" },
	{ ...input, template: "" },
	{ ...input, typo: "not ignored" },
	{ ...input, timeouts: { build: 0 } },
	{ ...input, timeouts: { startup: -1 } },
	{ ...input, codesys: { ...input.codesys, profile: 'bad" & injected' } },
	{ ...input, codesys: { ...input.codesys, executable: "bad\ncommand" } },
	{ ...input, codesys: { ...input.codesys, wine: { prefix: "" } } },
])("rejects invalid config %#", (config) => {
	expect(configSchema.safeParse(config).success).toBe(false);
});

it("merges individual timeout overrides with defaults", () => {
	const config = resolveConfig(
		{ ...input, timeouts: { build: 1234 } },
		"config.ts",
		"linux",
	);
	expect(config.timeouts.build).toBe(1234);
	expect(config.timeouts.startup).toBeGreaterThan(0);
});

it("resolves the runtime compose path against the config file", () => {
	const config = resolveConfig(
		{ ...input, runtime: { composeFile: "../compose.yaml" } },
		"fixtures/plc/config.ts",
		"linux",
	);
	expect(config.runtime).toEqual({
		composeFile: resolve("fixtures/compose.yaml"),
		service: "plc",
	});
});
