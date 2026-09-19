import { expect, it } from "bun:test";
import { StSyntaxError } from "./lexer";
import { parseSource } from "./parse";

// Reduced from independently delimited TcUnit/TcOpen XML and OSCAT exports.
// Repository revisions and the differential check are documented in docs/parser-audit.md.
it.each([
	["METHOD Close : Library.Result;", "Close := 0;", "END_METHOD"],
	[
		"METHOD Read : BOOL;\nVAR_INPUT\n Value : BOOL;\nEND_VAR",
		"Read := Value;",
		"END_METHOD",
	],
	["PROPERTY Description : STRING(254);", undefined, "END_PROPERTY"],
])(
	"keeps the optional header semicolon in %s",
	(declaration, body, terminator) => {
		const implementation = body === undefined ? undefined : `\n${body}\n`;
		const parsed = parseSource(
			`${declaration}${implementation ?? "\n"}${terminator}`,
		);
		expect(parsed.declaration.trimEnd()).toBe(declaration);
		expect(parsed.implementation).toBe(implementation);
	},
);

it.each([
	["FUNCTION_BLOCK Override", "END_FUNCTION_BLOCK", "function_block"],
	["PROPERTY Override : LREAL", "END_PROPERTY", "property"],
	["METHOD Override", "END_METHOD", "method"],
])("treats Override as the name in %s", (declaration, terminator, kind) => {
	expect(parseSource(`${declaration}\n${terminator}`)).toMatchObject({
		name: "Override",
		kind,
	});
});

it.each(["END_Position", "VAR_Position", "END_", "VAR_FUTURE"])(
	"accepts the identifier %s without treating its prefix as a keyword",
	(name) => {
		const declaration = `FUNCTION ${name} : INT\nVAR\nVAR_Count : INT;\nEND_VAR`;
		const implementation = `\nVAR_Count := 1; ${name} := VAR_Count;\n`;
		expect(
			parseSource(`${declaration}${implementation}END_FUNCTION`),
		).toMatchObject({ name, declaration, implementation });
	},
);

it("accepts END_ identifiers in array bounds and qualified return types", () => {
	const returnType = "ARRAY [1..END_Capacity] OF END_Types.END_Result";
	expect(
		parseSource(`FUNCTION Read : ${returnType}\nRETURN;\nEND_FUNCTION`)
			.returnType,
	).toBe(returnType);
});

it.each(["INTERNAL", "PUBLIC", "ABSTRACT"])(
	"recognizes a %s type declaration",
	(modifier) => {
		const source = `TYPE ${modifier} E_State : (Idle, Active);\nEND_TYPE;`;
		expect(parseSource(source)).toMatchObject({
			name: "E_State",
			kind: "dut",
			dutType: "enumeration",
			declaration: source,
		});
	},
);

it("does not consume the body of a method named Override", () => {
	const declaration = "METHOD Override";
	const implementation = "\nRETURN;\n";
	expect(
		parseSource(`${declaration}${implementation}END_METHOD`),
	).toMatchObject({ name: "Override", declaration, implementation });
});

it.each(["Helper();", "Value := 1;", "Device.Run();", "Values[0] := 1;"])(
	"keeps the same-line statement %s in the body of Override",
	(body) => {
		const declaration = "METHOD Override";
		const implementation = ` ${body}\n`;
		expect(
			parseSource(`${declaration}${implementation}END_METHOD`),
		).toMatchObject({ name: "Override", declaration, implementation });
	},
);

it.each([
	"FUNCTION Run",
	"FUNCTION PUBLIC Run;",
	"FUNCTION Run\nVAR_INPUT\nValue : INT;\nEND_VAR",
])("splits the no-return function %s", (declaration) => {
	const implementation = "\nLog('message');\n";
	const parsed = parseSource(`${declaration}${implementation}END_FUNCTION`);
	expect(parsed).toMatchObject({
		kind: "function",
		name: "Run",
		declaration,
		implementation,
	});
	expect(parsed.returnType).toBeUndefined();
});

it.each([
	"PROGRAM Main",
	"FUNCTION_BLOCK FB_Test",
	"FUNCTION Read : INT",
	"METHOD Run",
])("removes an optional closing semicolon from %s", (header) => {
	const terminator = `END_${header.split(" ")[0]}`;
	const implementation = "\nRETURN;\n";
	const parsed = parseSource(
		`${header}${implementation}${terminator};\n// last note`,
	);
	expect(parsed.implementation).toBe(`${implementation}\n// last note`);
});

it.each(["{warning disable C0195}", "{info 'declaration'}"])(
	"preserves %s between declaration sections",
	(pragma) => {
		const declaration = `PROGRAM Main\nVAR\n Count : INT;\nEND_VAR\n${pragma}\nVAR_INPUT\n Enabled : BOOL;\nEND_VAR`;
		expect(
			parseSource(`${declaration}\nCount := 1;\nEND_PROGRAM`).declaration,
		).toBe(declaration);
	},
);

it("does not move a pragma-only executable body into the declaration", () => {
	const declaration = "PROGRAM Main\nVAR\n X : INT;\nEND_VAR";
	const implementation = "\n{warning disable C0195}\n";
	expect(
		parseSource(`${declaration}${implementation}END_PROGRAM`),
	).toMatchObject({ declaration, implementation });
});

it("does not treat a comparison in a parenthesized generic argument as another type bracket", () => {
	const declaration =
		"FUNCTION_BLOCK FB_Test\nEXTENDS FB_Base<(Capacity := BOOL_TO_INT(1 < 2))>";
	expect(parseSource(`${declaration}\nEND_FUNCTION_BLOCK`).declaration).toBe(
		declaration,
	);
});

it.each([
	"FUNCTION Read : STRING(20]\nEND_FUNCTION",
	"FUNCTION Read : ARRAY [(1..20] OF INT\nEND_FUNCTION",
	"PROGRAM Main\nEND_VAR\nEND_PROGRAM",
	"PROGRAM Main\nTYPE Other : INT; END_TYPE\nEND_PROGRAM",
	"PROGRAM Main\nACTION Run\nEND_ACTION\nEND_PROGRAM",
	"PROGRAM Main\nVAR\n{ELSE}\n X : INT;\nEND_VAR\nEND_PROGRAM",
	"PROGRAM Main\nVAR\n{IF TRUE}{ELSE}{ELSE}{END_IF}\nEND_VAR\nEND_PROGRAM",
	"PROGRAM Main\nVAR\n{IF TRUE}{ELSE}{ELSIF FALSE}{END_IF}\nEND_VAR\nEND_PROGRAM",
])(
	"rejects malformed declaration boundaries in %j with a source error",
	(source) => {
		expect(() => parseSource(source)).toThrow(StSyntaxError);
	},
);

it("parses deeply nested pointer return types without overflowing the JavaScript stack", () => {
	const returnType = `${"POINTER TO ".repeat(12_000)}INT`;
	expect(
		parseSource(`FUNCTION Read : ${returnType}\nRETURN;\nEND_FUNCTION`)
			.returnType,
	).toBe(returnType);
});

it("preserves comments following a declaration-only terminator", () => {
	expect(
		parseSource("INTERFACE I_Test\nEND_INTERFACE\n// last note").declaration,
	).toBe("INTERFACE I_Test\n\n// last note");
});

it("keeps same-line END_VAR semicolons between declaration sections", () => {
	const declaration =
		"PROGRAM Main\nVAR\n X : INT;\nEND_VAR;\nVAR_INPUT\n Enabled : BOOL;\nEND_VAR;";
	expect(parseSource(`${declaration}\nX := 1;\nEND_PROGRAM`).declaration).toBe(
		declaration,
	);
});

it.each(["PROGRAM Main", "PROGRAM Main\nVAR\n X : INT;\nEND_VAR"])(
	"preserves an initial empty statement after %s",
	(declaration) => {
		const implementation = "\n;\nRETURN;\n";
		expect(
			parseSource(`${declaration}${implementation}END_PROGRAM`),
		).toMatchObject({ declaration, implementation });
	},
);

it("retains a final compiler pragma in a global declaration", () => {
	const declaration =
		"{warning disable C0195}\nVAR_GLOBAL\nValue : UINT := -1;\nEND_VAR\n{warning restore C0195}";
	expect(parseSource(declaration, { name: "Globals" }).declaration).toBe(
		declaration,
	);
});
