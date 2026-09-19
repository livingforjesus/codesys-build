import { expect, it } from "bun:test";
import { parseSource } from "./parse";

const executableHeaders = [
	["PROGRAM Main", "END_PROGRAM", "program", "Main"],
	[
		"FUNCTION_BLOCK FB_Motor",
		"END_FUNCTION_BLOCK",
		"function_block",
		"FB_Motor",
	],
	["FUNCTION F_Add : INT", "END_FUNCTION", "function", "F_Add"],
	["METHOD PUBLIC Run : BOOL", "END_METHOD", "method", "Run"],
] as const;

it.each(executableHeaders)(
	"splits %s without changing either section",
	(header, end, kind, name) => {
		const declaration = `${header}\nVAR_INPUT\n Enabled : BOOL;\nEND_VAR\nVAR\n Count : INT;\nEND_VAR`;
		const implementation =
			"\n// Read END_VAR as a comment, not a boundary\nCount := Count + 1;\n";
		const parsed = parseSource(`${declaration}${implementation}${end}`);
		expect(parsed).toMatchObject({ declaration, implementation, kind, name });
	},
);

it.each(executableHeaders)(
	"accepts %s without any variable sections",
	(header, end, kind, name) => {
		const implementation = "\nRETURN;\n";
		expect(parseSource(`${header}${implementation}${end}`)).toMatchObject({
			declaration: header,
			implementation,
			kind,
			name,
		});
	},
);

it.each(executableHeaders)("accepts an empty body in %s", (header, end) => {
	expect(parseSource(`${header}\n${end}`).implementation?.trim()).toBe("");
});

it.each([
	"VAR",
	"VAR_INPUT",
	"VAR_OUTPUT",
	"VAR_IN_OUT",
	"VAR_TEMP",
	"VAR_STAT",
	"VAR_INST",
	"VAR_EXTERNAL",
	"VAR_ACCESS",
	"VAR_GENERIC CONSTANT",
	"VAR RETAIN",
	"VAR PERSISTENT RETAIN",
	"VAR CONSTANT",
	"VAR NON_RETAIN",
])("recognizes the %s declaration section", (section) => {
	const declaration = `METHOD Run\n${section}\n value : INT := 3;\nEND_VAR`;
	const implementation = "\nvalue := value + 1;\n";
	expect(
		parseSource(`${declaration}${implementation}END_METHOD`),
	).toMatchObject({ declaration, implementation });
});

it.each([
	"(* END_VAR (* END_METHOD *) still a comment *)",
	"// END_METHOD END_VAR\n",
	"{attribute 'description' := 'END_VAR } END_METHOD'}",
])("does not interpret keywords inside %s", (annotation) => {
	const declaration = `METHOD Run\nVAR\n${annotation}\n value : INT;\nEND_VAR`;
	expect(
		parseSource(`${declaration}\nvalue := 1;\nEND_METHOD`).declaration,
	).toBe(declaration);
});

it.each([
	"'END_VAR'",
	"'END_METHOD'",
	"'text $' END_VAR $' text'",
	"'$$'",
	'"END_VAR"',
	'"text $" END_METHOD $""',
])("does not interpret keywords inside string %s", (literal) => {
	const declaration = `METHOD Run\nVAR\n value : STRING := ${literal};\nEND_VAR`;
	const implementation = `\nLog(${literal});\n`;
	expect(
		parseSource(`${declaration}${implementation}END_METHOD`),
	).toMatchObject({ declaration, implementation });
});

it.each(["\n", "\r\n", "\r"])("preserves line endings %j", (eol) => {
	const declaration = ["PROGRAM Main", "VAR", " Value : INT;", "END_VAR"].join(
		eol,
	);
	const implementation = `${eol}Value := 2;${eol}`;
	expect(
		parseSource(`${declaration}${implementation}END_PROGRAM`),
	).toMatchObject({ declaration, implementation });
});

it("preserves a BOM, lowercase keywords and source spelling", () => {
	const declaration =
		"\uFEFF{attribute 'linkalways'}\nprogram Main\nvar\n Count : int;\nend_var";
	expect(
		parseSource(`${declaration}\nCount := 1;\nend_program`).declaration,
	).toBe(declaration);
});

it.each([
	"INT",
	"Library.ST_Result",
	"STRING(80)",
	"WSTRING[80]",
	"POINTER TO BYTE",
	"REFERENCE TO Library.ST_Result",
	"REF_TO INT",
	"ARRAY [1..Capacity, 0..3] OF REAL",
	"ARRAY [*] OF POINTER TO BYTE",
	"STRING(Capacity + 1)",
])("parses return type %s", (returnType) => {
	const header = `FUNCTION F_Read : ${returnType}`;
	expect(parseSource(`${header}\nRETURN;\nEND_FUNCTION`)).toMatchObject({
		declaration: header,
		returnType,
	});
});

it.each([
	"PUBLIC",
	"PRIVATE",
	"PROTECTED",
	"INTERNAL",
	"PUBLIC FINAL",
	"PROTECTED ABSTRACT",
	"PUBLIC OVERRIDE",
])("parses method modifiers %s", (modifier) => {
	expect(
		parseSource(`METHOD ${modifier} Read : BOOL\nRead := TRUE;\nEND_METHOD`)
			.name,
	).toBe("Read");
});

it("parses multiline inheritance and interface clauses", () => {
	const declaration =
		"FUNCTION_BLOCK FINAL FB_Child\nEXTENDS Library.FB_Base\nIMPLEMENTS I_First,\n Library.I_Second\nVAR\n X : INT;\nEND_VAR";
	expect(
		parseSource(`${declaration}\nX := 1;\nEND_FUNCTION_BLOCK`).declaration,
	).toBe(declaration);
});

it("keeps inheritance following generic variables in the declaration", () => {
	const declaration =
		"FUNCTION_BLOCK FB_Buffer\nVAR_GENERIC CONSTANT\n Capacity : UINT := 8;\nEND_VAR\nEXTENDS FB_Base<Capacity>\nIMPLEMENTS I_Buffer";
	expect(
		parseSource(`${declaration}\nRETURN;\nEND_FUNCTION_BLOCK`).declaration,
	).toBe(declaration);
});

it("keeps conditionally declared members inside their VAR section", () => {
	const declaration =
		"PROGRAM Main\nVAR\n{IF project_defined(DEBUG)}\n X : INT;\n{ELSE}\n X : DINT;\n{END_IF}\nEND_VAR";
	expect(parseSource(`${declaration}\nX := 0;\nEND_PROGRAM`).declaration).toBe(
		declaration,
	);
});

it("preserves implementation pragmas with the implementation", () => {
	const implementation = "\n{IF defined(DEBUG)}\nLog('END_VAR');\n{END_IF}\n";
	expect(
		parseSource(`PROGRAM Main${implementation}END_PROGRAM`).implementation,
	).toBe(implementation);
});

it("preserves comments after the object terminator", () => {
	expect(
		parseSource("PROGRAM Main\nRETURN;\nEND_PROGRAM\n(* final note *)")
			.implementation,
	).toBe("\nRETURN;\n\n(* final note *)");
});

it.each([
	["STRUCT\n X : INT;\nEND_STRUCT", "structure"],
	["(Idle := 0, Running := 1)", "enumeration"],
	["UNION\n Raw : DWORD;\n Value : REAL;\nEND_UNION", "union"],
	["ARRAY [1..8] OF INT", "alias"],
] as const)("loads DUT %s as declaration-only", (definition, dutType) => {
	const declaration = `TYPE T_Data : ${definition};\nEND_TYPE`;
	expect(parseSource(declaration)).toEqual({
		declaration,
		name: "T_Data",
		kind: "dut",
		dutType,
	});
});

it.each([
	"VAR_GLOBAL",
	"VAR_GLOBAL CONSTANT",
	"VAR_GLOBAL PERSISTENT RETAIN",
	"VAR_CONFIG",
])("loads %s without requiring a GVL filename prefix", (section) => {
	const declaration = `{attribute 'qualified_only'}\n${section}\n X : INT;\nEND_VAR`;
	expect(parseSource(declaration, { filename: "domain/LineIO.st" })).toEqual({
		declaration,
		name: "LineIO",
		kind: "gvl",
	});
});

it("loads consecutive global sections", () => {
	const declaration =
		"VAR_GLOBAL\n X : INT;\nEND_VAR\nVAR_GLOBAL CONSTANT\n Limit : INT := 8;\nEND_VAR";
	expect(parseSource(declaration, { name: "Globals" }).declaration).toBe(
		declaration,
	);
});

it.each([
	"INTERFACE I_Motor EXTENDS I_Device\nEND_INTERFACE",
	"PROPERTY PUBLIC Speed : REAL\nEND_PROPERTY",
])("loads declaration-only %s", (source) => {
	expect(parseSource(source).implementation).toBeUndefined();
});

it("accepts an existing split declaration without a closing POU token", () => {
	const declaration =
		"FUNCTION_BLOCK FB_Test\nVAR\n X : INT;\nEND_VAR\n(* declaration note *)";
	expect(parseSource(declaration, { declarationOnly: true }).declaration).toBe(
		declaration,
	);
});

it.each([
	["", "Unexpected end"],
	["(* missing", "Unterminated block comment"],
	["PROGRAM Main\nVAR\n S : STRING := 'oops;", "Unterminated string"],
	["{attribute 'missing'", "Unterminated pragma"],
	["PROGRAM Main\nVAR\n X : INT;\nEND_PROGRAM", "Missing END_VAR"],
	["PROGRAM Main\nVAR\n X : INT;\nVAR_INPUT\n", "Missing END_VAR"],
	["PROGRAM Main\nRETURN;", "Missing END_PROGRAM"],
	["PROGRAM Main\nEND_FUNCTION_BLOCK", "Missing END_PROGRAM"],
	["FUNCTION F_Read\nEND_FUNCTION", "requires a return type"],
	["PROGRAM Main\nVAR_FUTURE\nEND_PROGRAM", "Variable declaration outside"],
	[
		"PROGRAM Main\n{IF defined(X)}\nVAR\n X : INT;\nEND_VAR\n{END_IF}\nEND_PROGRAM",
		"Variable declaration outside",
	],
	[
		"PROGRAM Main\nVAR\n{IF defined(X)}\nX : INT;\nEND_VAR\nEND_PROGRAM",
		"Conditional pragmas must remain",
	],
	[
		"PROGRAM Main\nVAR\n{END_IF}\nEND_VAR\nEND_PROGRAM",
		"Unmatched conditional",
	],
	[
		"PROGRAM Main\nEND_PROGRAM\nPROGRAM Other\nEND_PROGRAM",
		"Unexpected content after",
	],
	[
		"TYPE X : INT; END_TYPE TYPE Y : BOOL; END_TYPE",
		"Unexpected content after",
	],
	["INTERFACE I_Test\nRun();\nEND_INTERFACE", "declaration-only"],
	["PROPERTY Ready : BOOL\nReady := TRUE;\nEND_PROPERTY", "declaration-only"],
	["CONFIGURATION Something", "Unsupported object header"],
	["FUNCTION F_Read : ARRAY [1..5 OF INT\nEND_FUNCTION", "Unclosed ["],
	["PROGRAM Main\nMETHOD Run\nEND_METHOD\nEND_PROGRAM", "Nested objects"],
])("rejects malformed or unsupported source %j", (source, message) => {
	expect(() => parseSource(source, { filename: "domain/Test.st" })).toThrow(
		message,
	);
});

it("reports the source file and the failing line", () => {
	expect(() =>
		parseSource("PROGRAM Main\nVAR\nvalue : STRING := 'broken", {
			filename: "Main.st",
		}),
	).toThrow("Main.st:3:19:");
});

it("rejects executable code in a split declaration file", () => {
	expect(() =>
		parseSource("PROGRAM Main\nRun();", { declarationOnly: true }),
	).toThrow("declaration-only");
});
