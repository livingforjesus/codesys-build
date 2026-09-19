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
const closingObjects = new Set(
	Object.keys(objectKinds).map((kind) => `END_${kind}`),
);
const declarationKeywords = new Set([
	...Object.keys(objectKinds),
	...closingObjects,
	...variableSections,
	"END_VAR",
	"TYPE",
	"END_TYPE",
	"STRUCT",
	"END_STRUCT",
	"UNION",
	"END_UNION",
	"ACTION",
	"END_ACTION",
	"CONFIGURATION",
	"END_CONFIGURATION",
]);
const isDeclarationPragma = (token?: Token) =>
	token?.kind === "pragma" &&
	!/^\{\s*(IF|ELSIF|ELSE|END_IF)\b/i.test(token.value);

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
	const declarationSemicolon = () => {
		const token = peek();
		const previous = tokens[cursor.index - 1];
		// A semicolon on the next line may be the body's first empty statement.
		// Only attach it to a declaration when it terminates that same line.
		if (
			token?.value === ";" &&
			previous &&
			!/[\r\n]/.test(source.slice(previous.end, token.start))
		) {
			take();
		}
	};
	const identifier = () => {
		const token = take();
		if (token.kind !== "word" || declarationKeywords.has(token.value)) {
			fail("Expected an IEC identifier", token);
		}
		return source.slice(token.start, token.end);
	};
	const readModifiers = () => {
		while (modifiers.has(peek()?.value ?? "")) {
			if (peek()?.value === "OVERRIDE") {
				// OVERRIDE is also an established IEC name (e.g. OSCAT's function).
				// Only read it as a modifier when a header name follows on this line.
				const next = tokens[cursor.index + 1];
				if (
					next?.kind !== "word" ||
					declarationKeywords.has(next.value) ||
					["(", "[", ":=", ".", "^"].includes(
						tokens[cursor.index + 2]?.value ?? "",
					) ||
					/[\r\n]/.test(source.slice(peek()?.end, next.start))
				) {
					break;
				}
			}
			take();
		}
	};
	const balanced = (open: string, close: string) => {
		expect(open);
		const stack = [close];
		while (stack.length) {
			const token = take();
			if (token.kind === "string" || token.kind === "pragma") {
				continue;
			}
			if (token.value === "(" || token.value === "[") {
				stack.push(token.value === "(" ? ")" : "]");
			} else if (token.value === ")" || token.value === "]") {
				if (stack.pop() !== token.value) {
					fail(`Mismatched delimiter ${token.value}`, token);
				}
			} else if (open === "<" && stack.at(-1) === ">") {
				// A comparison inside a parenthesized generic argument is an expression,
				// not another generic type: FB_Base<(Size := BOOL_TO_INT(1 < 2))>.
				if (token.value === "<") {
					stack.push(">");
				}
				if (token.value === ">") {
					stack.pop();
				}
			}
			if (declarationKeywords.has(token.value) || token.value === ";") {
				fail(`Unclosed ${open}`, token);
			}
		}
	};
	const type = (): void => {
		// Prefix types can nest arbitrarily; iteration avoids a JavaScript stack limit.
		while (true) {
			if (["POINTER", "REFERENCE", "REF_TO"].includes(peek()?.value ?? "")) {
				if (take().value !== "REF_TO") {
					expect("TO");
				}
			} else if (peek()?.value === "ARRAY") {
				take();
				balanced("[", "]");
				expect("OF");
			} else {
				break;
			}
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
		const conditionals: { hasElse: boolean }[] = [];
		while (peek()?.value !== "END_VAR") {
			const token = take();
			if (
				variableSections.has(token.value) ||
				closingObjects.has(token.value)
			) {
				fail("Missing END_VAR", token);
			}
			if (token.kind === "pragma") {
				const directive = /^\{\s*(IF|ELSIF|ELSE|END_IF)\b/i
					.exec(token.value)?.[1]
					?.toUpperCase();
				if (directive === "IF") {
					conditionals.push({ hasElse: false });
				} else if (directive) {
					const current = conditionals.at(-1);
					if (!current) {
						return fail("Unmatched conditional pragma", token);
					}
					if (directive === "END_IF") {
						conditionals.pop();
					} else {
						if (current.hasElse) {
							fail("Conditional branch after ELSE", token);
						}
						current.hasElse = directive === "ELSE";
					}
				}
			}
		}
		if (conditionals.length) {
			fail("Conditional pragmas must remain inside one variable section");
		}
		take();
		declarationSemicolon();
	};
	while (isDeclarationPragma(peek())) {
		take();
	}
	const header = take();
	if (header.value === "TYPE") {
		readModifiers();
		const name = identifier();
		if (peek()?.value === "EXTENDS") {
			take();
			type();
		}
		expect(":");
		while (isDeclarationPragma(peek())) {
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
		if (peek()?.value === ";") {
			take();
		}
		if (peek()) {
			fail("Unexpected content after END_TYPE");
		}
		return { kind: "dut", name, declaration: source, dutType };
	}
	if (["VAR_GLOBAL", "VAR_CONFIG"].includes(header.value)) {
		cursor.index--;
		while (peek()) {
			while (isDeclarationPragma(peek())) {
				take();
			}
			if (!peek()) {
				break;
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
	readModifiers();
	const name = identifier();
	const result: ParsedSource = { kind, name, declaration: "" };
	if (peek()?.value === ":") {
		take();
		const start = peek()?.start ?? source.length;
		type();
		result.returnType = source
			.slice(start, tokens[cursor.index - 1]?.end)
			.trim();
	} else if (kind === "property") {
		fail(`${header.value} requires a return type`);
	}
	// Exported declarations commonly terminate the header itself with a semicolon.
	declarationSemicolon();
	let declarationEnd = tokens[cursor.index - 1]?.end ?? 0;
	while (peek()) {
		const saved = cursor.index;
		while (isDeclarationPragma(peek())) {
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
	const closingSemicolon =
		endToken && remaining[closing + 1]?.value === ";"
			? remaining[closing + 1]
			: undefined;
	const trailing = closing + (closingSemicolon ? 2 : 1);
	if (closing >= 0 && trailing !== remaining.length) {
		fail(`Unexpected content after ${terminator}`, remaining[trailing]);
	}
	for (const token of implementationTokens) {
		if (token.kind !== "word") {
			continue;
		}
		if (variableSections.has(token.value) || token.value === "END_VAR") {
			fail(
				"Variable declaration outside the declaration section; conditional declaration envelopes are not supported",
				token,
			);
		}
		if (declarationKeywords.has(token.value)) {
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
		if (endToken) {
			result.declaration += source.slice(closingSemicolon?.end ?? endToken.end);
		}
		return result;
	}
	result.implementation = source.slice(declarationEnd, endToken?.start);
	// Preserve a trailing comment after END_* in the implementation as well.
	if (endToken) {
		result.implementation += source.slice(
			closingSemicolon?.end ?? endToken.end,
		);
	}
	return result;
};
