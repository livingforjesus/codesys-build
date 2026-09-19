import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { StSyntaxError, tokenize } from "../../src/st/lexer";
import { parseSource } from "../../src/st/parse";

const root = process.argv[2];
if (!root) {
	throw new Error(
		"Usage: bun run test:corpus -- /path/to/pinned/checkouts (see docs/parser-audit.md)",
	);
}
const { stdout } = await promisify(execFile)(
	"python3",
	[fileURLToPath(new URL("extract.py", import.meta.url)), root],
	{ maxBuffer: 64 * 1024 * 1024 },
);
const identity = z.object({
	repository: z.string(),
	path: z.string(),
	name: z.string(),
});
const cases = z
	.array(
		z.discriminatedUnion("format", [
			identity.extend({
				format: z.literal("oscat"),
				source: z.string(),
				boundary: z.number(),
			}),
			identity.extend({
				format: z.literal("twincat"),
				declaration: z.string(),
				implementation: z.string().nullable(),
			}),
		]),
	)
	.nonempty()
	.parse(JSON.parse(stdout));
const failures: { source: string; error: string }[] = [];
const unsupported: Record<string, number> = {};
const passed: Record<string, number> = {};
const unique = new Set<string>();
for (const item of cases) {
	const filename = `${item.repository}/${item.path}#${item.name}`;
	try {
		const declaration =
			item.format === "oscat"
				? item.source.slice(0, item.boundary)
				: item.declaration;
		const firstWord = tokenize(declaration).find(
			(token) => token.kind === "word",
		)?.value;
		const wrapped = [
			"PROGRAM",
			"FUNCTION_BLOCK",
			"FUNCTION",
			"METHOD",
			"INTERFACE",
			"PROPERTY",
		].includes(firstWord ?? "");
		const source =
			item.format === "oscat"
				? item.source
				: declaration +
					(wrapped ? `\n${item.implementation ?? ""}\nEND_${firstWord}` : "");
		unique.add(createHash("sha256").update(source).digest("hex"));
		const parsed = parseSource(source, { name: item.name, filename });
		if (parsed.implementation !== undefined) {
			// The oracle is the XML buffer / EXP marker, not a second guess at ST grammar.
			if (!declaration.startsWith(parsed.declaration)) {
				throw new Error("Implementation consumed as declaration");
			}
			if (tokenize(declaration.slice(parsed.declaration.length)).length) {
				throw new Error("Declaration leaked into implementation");
			}
			if (
				item.format === "twincat" &&
				parsed.declaration + parsed.implementation !==
					`${declaration}\n${item.implementation ?? ""}\n`
			) {
				throw new Error("Source text changed or was lost");
			}
		} else if (item.format === "twincat" && item.implementation !== null) {
			throw new Error("Executable buffer discarded");
		}
		passed[item.repository] = (passed[item.repository] ?? 0) + 1;
	} catch (error) {
		// Count documented exclusions explicitly; any different error fails the audit.
		const legacy =
			error instanceof StSyntaxError &&
			/Unsupported object header FUNCTIONBLOCK$/.test(error.message) &&
			item.format === "oscat";
		const exclusion = legacy ? "legacy-functionblock" : undefined;
		if (exclusion) {
			unsupported[exclusion] = (unsupported[exclusion] ?? 0) + 1;
		} else {
			failures.push({ source: filename, error: String(error) });
		}
	}
}
const expected = { "legacy-functionblock": 7 };
for (const [reason, count] of Object.entries(expected)) {
	if (unsupported[reason] !== count) {
		failures.push({
			source: "corpus",
			error: `Expected ${count} ${reason} exclusions; found ${unsupported[reason] ?? 0}`,
		});
	}
}
console.log(
	JSON.stringify(
		{
			total: cases.length,
			uniqueSources: unique.size,
			passed,
			unsupported,
			failures,
		},
		null,
		2,
	),
);
if (failures.length) {
	process.exitCode = 1;
}
