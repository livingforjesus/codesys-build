import { basename } from "node:path";
import { StSyntaxError, type Token, tokenize } from "./lexer";

const objectKinds = {
	PROGRAM: "program",
	FUNCTION_BLOCK: "function_block",
	FUNCTION: "function",
	METHOD: "method",
	INTERFACE: "interface",
	PROPERTY: "property",
} as const;
export type ObjectKind =
	| (typeof objectKinds)[keyof typeof objectKinds]
	| "dut"
	| "gvl"
	| "action"
	| "get"
	| "set";
export type ParsedSource = {
	kind: ObjectKind;
	name: string;
	declaration: string;
	implementation?: string;
	returnType?: string;
	dutType?: "structure" | "enumeration" | "union" | "alias";
};
const modifiers = new Set([
	"PUBLIC",
	"PRIVATE",
	"PROTECTED",
	"INTERNAL",
	"FINAL",
	"ABSTRACT",
	"OVERRIDE",
]);
const variableSections = new Set([
	"VAR",
	"VAR_INPUT",
	"VAR_OUTPUT",
	"VAR_IN_OUT",
	"VAR_TEMP",
	"VAR_STAT",
	"VAR_INST",
	"VAR_EXTERNAL",
	"VAR_GLOBAL",
	"VAR_CONFIG",
	"VAR_ACCESS",
	"VAR_GENERIC",
]);
const isAttribute = (token?: Token) =>
	token?.kind === "pragma" && /^\{\s*attribute\b/i.test(token.value);

/** Parse only the object envelope and declarations. CODESYS validates the executable ST. */
export const parseSource = (
	source: string,
	options: { filename?: string; declarationOnly?: boolean; name?: string } = {},
): ParsedSource => {
	const filename = options.filename ?? "<source>";
	const tokens = tokenize(source, filename);
	const cursor = { index: 0 };
	const peek = () => tokens[cursor.index];
	const fail = (message: string, token = peek()): never => {
		throw new StSyntaxError(
			source,
			token?.start ?? source.length,
			filename,
			message,
		);
	};
	const take = (): Token => {
		const token = peek();
		if (!token) {
			return fail("Unexpected end of declaration");
		}
		cursor.index++;
		return token;
	};
	const expect = (value: string) => {
		if (peek()?.value !== value) {
			fail(`Expected ${value}`);
		}
		return take();
	};
	const identifier = () => {
		const token = take();
		if (token.kind !== "word" || token.value.startsWith("END_")) {
			fail("Expected an IEC identifier", token);
		}
		return source.slice(token.start, token.end);
	};
	const balanced = (open: string, close: string) => {
		expect(open);
		let depth = 1;
		while (depth) {
			const token = take();
			if (token.value === open) {
				depth++;
			}
			if (token.value === close) {
				depth--;
			}
			if (token.value.startsWith("END_") || token.value === ";") {
				fail(`Unclosed ${open}`, token);
			}
		}
	};
	const type = (): void => {
		if (["POINTER", "REFERENCE", "REF_TO"].includes(peek()?.value ?? "")) {
			const modifier = take();
			if (modifier.value !== "REF_TO") {
				expect("TO");
			}
			type();
			return;
		}
		if (peek()?.value === "ARRAY") {
			take();
			balanced("[", "]");
			expect("OF");
			type();
			return;
		}
		identifier();
		while (peek()?.value === ".") {
			take();
			identifier();
		}
		if (peek()?.value === "(") {
			balanced("(", ")");
		}
		if (peek()?.value === "[") {
			balanced("[", "]");
		}
		if (peek()?.value === "<") {
			balanced("<", ">");
		}
	};
	const variableSection = () => {
		take();
		let conditionals = 0;
		while (peek()?.value !== "END_VAR") {
			const token = take();
			if (
				variableSections.has(token.value) ||
				/^END_(PROGRAM|FUNCTION|FUNCTION_BLOCK|METHOD|INTERFACE|PROPERTY)$/.test(
					token.value,
				)
			) {
				fail("Missing END_VAR", token);
			}
			if (token.kind === "pragma") {
				if (/^\{\s*IF\b/i.test(token.value)) {
					conditionals++;
				}
				if (/^\{\s*END_IF\b/i.test(token.value)) {
					conditionals--;
				}
				if (conditionals < 0) {
					fail("Unmatched conditional pragma", token);
				}
			}
		}
		if (conditionals) {
			fail("Conditional pragmas must remain inside one variable section");
		}
		take();
	};
	while (isAttribute(peek())) {
		take();
	}
	const header = take();
	if (header.value === "TYPE") {
		const name = identifier();
		if (peek()?.value === "EXTENDS") {
			take();
			type();
		}
		expect(":");
		while (isAttribute(peek())) {
			take();
		}
		const start = peek()?.value;
		const dutTypes: Record<string, NonNullable<ParsedSource["dutType"]>> = {
			STRUCT: "structure",
			UNION: "union",
			"(": "enumeration",
		};
		const dutType = dutTypes[start ?? ""] ?? "alias";
		while (peek()?.value !== "END_TYPE") {
			if (peek()?.value === "TYPE") {
				fail("Only one TYPE declaration is allowed per file");
			}
			take();
		}
		take();
		if (peek()) {
			fail("Unexpected content after END_TYPE");
		}
		return { kind: "dut", name, declaration: source, dutType };
	}
	if (["VAR_GLOBAL", "VAR_CONFIG"].includes(header.value)) {
		cursor.index--;
		while (peek()) {
			while (isAttribute(peek())) {
				take();
			}
			if (!["VAR_GLOBAL", "VAR_CONFIG"].includes(peek()?.value ?? "")) {
				fail("Expected a global variable section");
			}
			variableSection();
		}
		const name = options.name ?? basename(filename, ".st");
		if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) {
			fail("Global list requires an IEC filename or an explicit name", header);
		}
		return { kind: "gvl", name, declaration: source };
	}
	if (!(header.value in objectKinds)) {
		fail(`Unsupported object header ${header.value}`, header);
	}
	const kind = objectKinds[header.value as keyof typeof objectKinds];
	while (modifiers.has(peek()?.value ?? "")) {
		take();
	}
	const name = identifier();
	const result: ParsedSource = { kind, name, declaration: "" };
	if (peek()?.value === ":") {
		take();
		const start = peek()?.start ?? source.length;
		type();
		result.returnType = source
			.slice(start, tokens[cursor.index - 1]?.end)
			.trim();
	} else if (kind === "function" || kind === "property") {
		fail(`${header.value} requires a return type`);
	}
	let declarationEnd = tokens[cursor.index - 1]?.end ?? 0;
	while (peek()) {
		const saved = cursor.index;
		while (isAttribute(peek())) {
			take();
		}
		const next = peek()?.value ?? "";
		if (variableSections.has(next)) {
			variableSection();
		} else if (next === "EXTENDS" || next === "IMPLEMENTS") {
			// CODESYS generic FBs can place these clauses after VAR_GENERIC.
			take();
			type();
			while (peek()?.value === ",") {
				take();
				type();
			}
		} else {
			cursor.index = saved;
			break;
		}
		declarationEnd = tokens[cursor.index - 1]?.end ?? declarationEnd;
	}
	const terminator = `END_${header.value}`;
	const remaining = tokens.slice(cursor.index);
	const closing = remaining.findIndex(
		(token) => token.kind === "word" && token.value === terminator,
	);
	if (!options.declarationOnly && closing < 0) {
		fail(`Missing ${terminator}`);
	}
	const implementationTokens =
		closing < 0 ? remaining : remaining.slice(0, closing);
	const endToken = closing < 0 ? undefined : remaining[closing];
	if (closing >= 0 && closing !== remaining.length - 1) {
		fail(`Unexpected content after ${terminator}`, remaining[closing + 1]);
	}
	for (const token of implementationTokens) {
		if (token.kind !== "word") {
			continue;
		}
		if (variableSections.has(token.value) || token.value.startsWith("VAR_")) {
			fail(
				"Variable declaration outside the declaration section; conditional declaration envelopes are not supported",
				token,
			);
		}
		if (
			token.value in objectKinds ||
			/^END_(PROGRAM|FUNCTION|FUNCTION_BLOCK|METHOD|INTERFACE|PROPERTY)$/.test(
				token.value,
			)
		) {
			fail(
				"Nested objects must be separate child files, or the object terminator is mismatched",
				token,
			);
		}
	}
	if (
		(options.declarationOnly || kind === "interface" || kind === "property") &&
		implementationTokens.length
	) {
		fail(
			"Unexpected implementation in a declaration-only object",
			implementationTokens[0],
		);
	}
	result.declaration = source.slice(0, declarationEnd);
	if (options.declarationOnly || kind === "interface" || kind === "property") {
		result.declaration = source.slice(0, endToken?.start ?? source.length);
		return result;
	}
	result.implementation = source.slice(declarationEnd, endToken?.start);
	// Preserve a trailing comment after END_* in the implementation as well.
	if (endToken) {
		result.implementation += source.slice(endToken.end);
	}
	return result;
};
