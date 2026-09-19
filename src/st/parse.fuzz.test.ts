import { expect, it } from "bun:test";
import { StSyntaxError, tokenize } from "./lexer";
import { parseSource } from "./parse";

const generator = (seed: number) => {
	let state = seed;
	return <T>(values: readonly T[]): T => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		const value = values[Math.floor((state / 0x100000000) * values.length)];
		if (value === undefined) {
			throw new Error("Empty generator choice");
		}
		return value;
	};
};
const headers = [
	["PROGRAM Main", "END_PROGRAM"],
	["FUNCTION_BLOCK FB_Test", "END_FUNCTION_BLOCK"],
	["FUNCTION Read : INT", "END_FUNCTION"],
	["METHOD PROTECTED Run : BOOL", "END_METHOD"],
] as const;

it.each([1, 7, 19, 12345, 0xdeadbeef])(
	"preserves both source buffers for 2,000 generated objects with seed %i",
	(seed) => {
		const pick = generator(seed);
		for (let index = 0; index < 2000; index++) {
			const [header, end] = pick(headers);
			const eol = pick(["\n", "\r\n", "\r"]);
			const gap = pick([
				" ",
				"\t",
				" (* END_VAR (* END_METHOD *) *) ",
				`${eol}// END_PROGRAM${eol}`,
			]);
			const casing = pick(["upper", "lower"]);
			const keyword = (value: string) =>
				casing === "lower" ? value.toLowerCase() : value;
			const prefix = pick([
				"",
				"\uFEFF",
				"// lead\n",
				"{attribute 'description' := 'END_VAR } $' quote'}\n",
			]);
			const literal = pick([
				"'END_VAR'",
				"'$$'",
				"'$' END_METHOD $''",
				"'a$Rb$Nc'",
				'"END_PROGRAM $" quoted $""',
			]);
			const variable = pick(["Value", "VAR_Value", "END_Value", "VAR_FUTURE"]);
			const declaration = `${prefix}${keyword(header)}${pick(["", ";"])}${eol}${keyword(pick(["VAR", "VAR_INPUT", "VAR_TEMP", "VAR_INST"]))}${gap}${variable} : INT := 1;${eol}Text : STRING := ${literal};${eol}${keyword("END_VAR")}`;
			const statement = pick([
				`${variable} := 16#FEED + 1;`,
				`IF ${variable} > 0 THEN ${variable} := 0; END_IF;`,
				`Log(${literal});`,
				`{IF defined(DEBUG)}\nLog('END_VAR');\n{ELSE}\nRETURN;\n{END_IF}`,
				`(* outer (* END_FUNCTION *) still a comment *)\n${variable} := 2;`,
				`// END_VAR\n${variable} := ${variable} + 1;`,
			]);
			const implementation = `${eol}${statement}${eol}`;
			const trailing = pick([
				"",
				`${eol}// trailing END_VAR`,
				`${eol}(* tail *)`,
			]);
			const parsed = parseSource(
				`${declaration}${implementation}${keyword(end)}${pick(["", ";"])}${trailing}`,
			);
			expect(parsed.declaration).toBe(declaration);
			expect(parsed.implementation).toBe(implementation + trailing);
		}
	},
);

it("ignores 1,000 nested comments and preserves token offsets", () => {
	const source = `${"(* ".repeat(1000)}' END_VAR { END_PROGRAM ${" *)".repeat(1000)}\nPROGRAM Main\nEND_PROGRAM`;
	const tokens = tokenize(source);
	expect(tokens.map((token) => source.slice(token.start, token.end))).toEqual([
		"PROGRAM",
		"Main",
		"END_PROGRAM",
	]);
	expect(parseSource(source).name).toBe("Main");
});

it.each(["'", '"', "(*", "{"])(
	"rejects 200 truncated %s constructs with source diagnostics",
	(opening) => {
		for (let index = 1; index <= 200; index++) {
			const source = `PROGRAM Main\n${opening}${"x".repeat(index)} END_VAR END_PROGRAM`;
			expect(() => parseSource(source, { filename: "broken.st" })).toThrow(
				StSyntaxError,
			);
		}
	},
);

it("rejects every truncation inside a nested return-type envelope", () => {
	for (const returnType of [
		"ARRAY [",
		"ARRAY [1..MAX(",
		"ARRAY [1..MAX(2, 4)",
		"ARRAY [1..MAX(2, 4)] OF",
		"ARRAY [1..MAX(2, 4)] OF POINTER TO",
		"POINTER TO ARRAY [0..3] OF STRING(",
	]) {
		expect(() =>
			parseSource(`FUNCTION Read : ${returnType}\nEND_FUNCTION`),
		).toThrow(StSyntaxError);
	}
});
