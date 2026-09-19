import { expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSources } from "./sources";

const withSources = async (
	files: Record<string, string>,
	check: (sourceDir: string) => Promise<void>,
) => {
	const root = await mkdtemp(join(tmpdir(), "codesys sources-"));
	try {
		for (const [name, text] of Object.entries({
			"Main.st": "PROGRAM Main\nEND_PROGRAM",
			...files,
		})) {
			const path = join(root, name);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, text);
		}
		await check(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};
const load = (sourceDir: string) =>
	loadSources({ sourceDir, entry: join(sourceDir, "Main.st") });

it.each([
	["transport/FB_Motor/declaration.st", "transport/FB_Motor/implementation.st"],
	[
		"transport/FB_Motor/FB_Motor.declaration.st",
		"transport/FB_Motor/FB_Motor.implementation.st",
	],
	[
		"transport/FB_Motor/declaration.st",
		"transport/FB_Motor/FB_Motor.implementation.st",
	],
	[
		"transport/FB_Motor/FB_Motor.declaration.st",
		"transport/FB_Motor/implementation.st",
	],
	["unrelated/FB_Motor.declaration.st", "unrelated/FB_Motor.implementation.st"],
])("pairs %s with %s", async (declarationPath, implementationPath) => {
	const declaration = "FUNCTION_BLOCK FB_Motor\nVAR\n Speed : INT;\nEND_VAR";
	const implementation = "Speed := 1;";
	await withSources(
		{ [declarationPath]: declaration, [implementationPath]: implementation },
		async (sourceDir) => {
			const result = await load(sourceDir);
			expect(
				result.objects.find(({ name }) => name === "FB_Motor"),
			).toMatchObject({ kind: "function_block", declaration, implementation });
		},
	);
});

it.each([
	"conveyors/FB_Motor.st",
	"conveyors/FB_Motor/source.st",
	"conveyors/FB_Motor/FB_Motor.st",
])("discovers the combined source %s", async (file) => {
	await withSources(
		{
			[file]:
				"FUNCTION_BLOCK FB_Motor\nVAR\n Speed : INT;\nEND_VAR\nSpeed := 1;\nEND_FUNCTION_BLOCK",
		},
		async (sourceDir) => {
			const result = await load(sourceDir);
			expect(
				result.objects.find(({ name }) => name === "FB_Motor"),
			).toMatchObject({
				folder: ["conveyors"],
				kind: "function_block",
				implementation: "\nSpeed := 1;\n",
			});
		},
	);
});

it.each([
	["Run.st", "METHOD Run\nRETURN;\nEND_METHOD", undefined],
	["Run/source.st", "METHOD Run\nRETURN;\nEND_METHOD", undefined],
	["Run/declaration.st", "METHOD Run", "Run/implementation.st"],
	["Run/Run.declaration.st", "METHOD Run", "Run/Run.implementation.st"],
	["Run.declaration.st", "METHOD Run", "Run.implementation.st"],
] as const)(
	"attaches child method %s to its enclosing block",
	async (file, source, implementation) => {
		const folder = "domain/FB_Motor/methods/";
		await withSources(
			{
				"domain/FB_Motor/source.st":
					"FUNCTION_BLOCK FB_Motor\nEND_FUNCTION_BLOCK",
				[folder + file]: source,
				...(implementation ? { [folder + implementation]: "RETURN;" } : {}),
			},
			async (sourceDir) => {
				const result = await load(sourceDir);
				const block = result.objects.find(({ name }) => name === "FB_Motor");
				expect(block?.children).toHaveLength(1);
				expect(block?.children[0]).toMatchObject({
					kind: "method",
					name: "Run",
				});
				expect(result.objects.map(({ name }) => name)).not.toContain("Run");
			},
		);
	},
);

it("supports programs in domain folders and an explicitly selected entry", async () => {
	await withSources(
		{ "framing/PRG_Framing/source.st": "PROGRAM PRG_Framing\nEND_PROGRAM" },
		async (sourceDir) => {
			const result = await loadSources({
				sourceDir,
				entry: join(sourceDir, "framing/PRG_Framing/source.st"),
			});
			expect(result.entry).toBe("PRG_Framing");
			expect(
				result.objects.filter(({ kind }) => kind === "program"),
			).toHaveLength(2);
		},
	);
});

it("keeps arbitrary type and global filenames and ignores documentation", async () => {
	await withSources(
		{
			"domain/State.st": "TYPE State : INT; END_TYPE",
			"domain/LineIO.st": "VAR_GLOBAL\n Value : State;\nEND_VAR",
			"domain/README.md": "Notes",
			"domain/old.st.bak": "Not source",
		},
		async (sourceDir) => {
			const result = await load(sourceDir);
			expect(result.objects.map(({ name }) => name).sort()).toEqual([
				"LineIO",
				"Main",
				"State",
			]);
		},
	);
});

it("loads a function, interface signatures, property accessors and an action", async () => {
	await withSources(
		{
			"F_Add.st": "FUNCTION F_Add : INT\nF_Add := 1;\nEND_FUNCTION",
			"I_Motor/source.st": "INTERFACE I_Motor\nEND_INTERFACE",
			"I_Motor/methods/Run.st": "METHOD Run",
			"I_Motor/properties/Ready.st": "PROPERTY Ready : BOOL",
			"FB_Motor/source.st":
				"FUNCTION_BLOCK FB_Motor IMPLEMENTS I_Motor\nEND_FUNCTION_BLOCK",
			"FB_Motor/properties/Ready/declaration.st": "PROPERTY Ready : BOOL",
			"FB_Motor/properties/Ready/get.st":
				"VAR\n Result : BOOL;\nEND_VAR\nReady := Result;",
			"FB_Motor/properties/Ready/set.st": "RETURN;",
			"FB_Motor/actions/Reset.st": "Count := 0;",
		},
		async (sourceDir) => {
			const result = await load(sourceDir);
			expect(
				result.objects.find(({ kind }) => kind === "function")?.returnType,
			).toBe("INT");
			const block = result.objects.find(({ name }) => name === "FB_Motor");
			const property = block?.children.find(({ kind }) => kind === "property");
			expect(property?.children.map(({ kind }) => kind)).toEqual([
				"get",
				"set",
			]);
			expect(property?.children[0]?.declaration.trim()).toBe(
				"VAR\n Result : BOOL;\nEND_VAR",
			);
			expect(
				block?.children.find(({ kind }) => kind === "action")?.implementation,
			).toBe("Count := 0;");
		},
	);
});

it.each([
	[
		{
			"FB_Test/declaration.st": "FUNCTION_BLOCK FB_Test",
			"FB_Test/implementation.st": "",
			"FB_Test/FB_Test.implementation.st": "",
		},
		"Ambiguous implementation",
	],
	[
		{
			"FB_Test/declaration.st": "FUNCTION_BLOCK FB_Test",
			"FB_Test/FB_Test.declaration.st": "FUNCTION_BLOCK FB_Test",
			"FB_Test/implementation.st": "",
		},
		"Ambiguous declaration",
	],
	[
		{
			"FB_Test/source.st": "FUNCTION_BLOCK FB_Test END_FUNCTION_BLOCK",
			"FB_Test/declaration.st": "FUNCTION_BLOCK FB_Test",
			"FB_Test/implementation.st": "",
		},
		"Both combined and split",
	],
	[{ "FB_Test/implementation.st": "Run();" }, "Missing declaration"],
	[
		{ "FB_Test/declaration.st": "FUNCTION_BLOCK FB_Test" },
		"Missing implementation",
	],
	[{ "FB_Test.st": "PROGRAM FB_Test END_PROGRAM" }, "Prefix FB_ conflicts"],
	[{ "fb_test.st": "PROGRAM fb_test END_PROGRAM" }, "Prefix FB_ conflicts"],
	[
		{ "FB_Test.st": "FUNCTION_BLOCK FB_Other END_FUNCTION_BLOCK" },
		"does not match",
	],
	[
		{
			"a/State.st": "TYPE State : INT; END_TYPE",
			"b/state.st": "TYPE state : INT; END_TYPE",
		},
		"Duplicate IEC name",
	],
	[
		{
			"FB_Test/source.st": "FUNCTION_BLOCK FB_Test END_FUNCTION_BLOCK",
			"FB_Test/methods/a/Run.st": "METHOD Run END_METHOD",
			"FB_Test/methods/b/run.st": "METHOD run END_METHOD",
		},
		"Duplicate IEC name",
	],
	[
		{
			"FB_Test/source.st": "FUNCTION_BLOCK FB_Test END_FUNCTION_BLOCK",
			"FB_Test/methods/Run.st": "PROGRAM Run END_PROGRAM",
		},
		"Expected method",
	],
] satisfies Array<[Record<string, string>, string]>)(
	"rejects ambiguous or invalid source layouts %#",
	async (files, message) => {
		await withSources(files, async (sourceDir) => {
			await expect(load(sourceDir)).rejects.toThrow(message);
		});
	},
);

it("rejects a missing entry", async () => {
	await withSources({}, async (sourceDir) => {
		await expect(
			loadSources({ sourceDir, entry: join(sourceDir, "Absent.st") }),
		).rejects.toThrow("not a discovered source");
	});
});

it("rejects a non-program entry", async () => {
	await withSources(
		{ "State.st": "TYPE State : INT; END_TYPE" },
		async (sourceDir) => {
			await expect(
				loadSources({ sourceDir, entry: join(sourceDir, "State.st") }),
			).rejects.toThrow("must be a PROGRAM");
		},
	);
});

it("rejects source symlinks rather than escaping the source tree", async () => {
	await withSources({}, async (sourceDir) => {
		await symlink(join(sourceDir, "Main.st"), join(sourceDir, "Other.st"));
		await expect(load(sourceDir)).rejects.toThrow("Source symlinks");
	});
});

it("recognizes uppercase ST extensions", async () => {
	await withSources(
		{ "State.ST": "TYPE State : INT; END_TYPE" },
		async (sourceDir) => {
			expect((await load(sourceDir)).objects.map(({ name }) => name)).toContain(
				"State",
			);
		},
	);
});

it("rejects a child object outside a parent POU", async () => {
	await withSources(
		{ "domain/Run.st": "METHOD Run\nEND_METHOD" },
		async (sourceDir) => {
			await expect(load(sourceDir)).rejects.toThrow("no enclosing POU");
		},
	);
});

it("does not confuse a sibling type family with a function block's children", async () => {
	await withSources(
		{
			"domain/FB_Test/source.st": "FUNCTION_BLOCK FB_Test END_FUNCTION_BLOCK",
			"domain/ST_Group/ST_Group.st": "TYPE ST_Group : INT; END_TYPE",
			"domain/ST_Group/ST_Child.st": "TYPE ST_Child : BOOL; END_TYPE",
		},
		async (sourceDir) => {
			const result = await load(sourceDir);
			expect(
				result.objects.find(({ name }) => name === "FB_Test")?.children,
			).toHaveLength(0);
			expect(result.objects.filter(({ kind }) => kind === "dut")).toHaveLength(
				2,
			);
		},
	);
});
