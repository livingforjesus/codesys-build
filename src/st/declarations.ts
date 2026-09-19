import type { Token } from "./lexer";
import type { TokenReader } from "./reader";

export const objectKinds = {
	PROGRAM: "program",
	FUNCTION_BLOCK: "function_block",
	FUNCTION: "function",
	METHOD: "method",
	INTERFACE: "interface",
	PROPERTY: "property",
} as const;

const modifiers = new Set([
	"PUBLIC",
	"PRIVATE",
	"PROTECTED",
	"INTERNAL",
	"FINAL",
	"ABSTRACT",
	"OVERRIDE",
]);
export const globalSections = new Set(["VAR_GLOBAL", "VAR_CONFIG"]);
export const variableSections = new Set([
	...globalSections,
	"VAR",
	"VAR_INPUT",
	"VAR_OUTPUT",
	"VAR_IN_OUT",
	"VAR_TEMP",
	"VAR_STAT",
	"VAR_INST",
	"VAR_EXTERNAL",
	"VAR_ACCESS",
	"VAR_GENERIC",
]);
const closingObjects = new Set(
	Object.keys(objectKinds).map((kind) => `END_${kind}`),
);
export const declarationKeywords = new Set([
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

const conditionalDirective = (token?: Token) => {
	if (token?.kind === "pragma") {
		return /^\{\s*(IF|ELSIF|ELSE|END_IF)\b/i
			.exec(token.value)?.[1]
			?.toUpperCase();
	}
};
const isDeclarationPragma = (token?: Token) =>
	token?.kind === "pragma" && !conditionalDirective(token);

export const readDeclarationPragmas = (reader: TokenReader) => {
	while (isDeclarationPragma(reader.peek())) {
		reader.take();
	}
};

export const readDeclarationSemicolon = (reader: TokenReader) => {
	const token = reader.peek();
	// A semicolon on the next line may be the body's first empty statement.
	// Only attach it to a declaration when it terminates that same line.
	if (
		token?.value === ";" &&
		!/[\r\n]/.test(reader.source.slice(reader.end, token.start))
	) {
		reader.take();
	}
};

export const readIdentifier = (reader: TokenReader) => {
	const token = reader.take();
	if (token.kind !== "word" || declarationKeywords.has(token.value)) {
		reader.fail("Expected an IEC identifier", token);
	}
	return reader.source.slice(token.start, token.end);
};

const isOverrideModifier = (reader: TokenReader) => {
	// OVERRIDE is also an established IEC name (e.g. OSCAT's function).
	// A modifier needs a following name on the same line, not a body statement.
	const name = reader.peek(1);
	return (
		name?.kind === "word" &&
		!declarationKeywords.has(name.value) &&
		!["(", "[", ":=", ".", "^"].includes(reader.peek(2)?.value ?? "") &&
		!/[\r\n]/.test(reader.source.slice(reader.peek()?.end, name.start))
	);
};

export const readModifiers = (reader: TokenReader) => {
	while (modifiers.has(reader.peek()?.value ?? "")) {
		if (reader.peek()?.value === "OVERRIDE" && !isOverrideModifier(reader)) {
			return;
		}
		reader.take();
	}
};

const typeDelimiters = { "(": ")", "[": "]", "<": ">" } as const;

const readDelimitedType = (
	reader: TokenReader,
	open: keyof typeof typeDelimiters,
) => {
	reader.expect(open);
	const closings = [typeDelimiters[open]];
	while (closings.length) {
		const token = reader.take();
		if (token.kind === "string" || token.kind === "pragma") {
			continue;
		}
		if (token.value === "(" || token.value === "[") {
			closings.push(typeDelimiters[token.value]);
		} else if (token.value === ")" || token.value === "]") {
			if (closings.pop() !== token.value) {
				reader.fail(`Mismatched delimiter ${token.value}`, token);
			}
		} else if (open === "<" && closings.at(-1) === ">") {
			// Inside parentheses, < and > are comparisons, not generic delimiters:
			// FB_Base<(Size := BOOL_TO_INT(1 < 2))>.
			if (token.value === "<") {
				closings.push(">");
			}
			if (token.value === ">") {
				closings.pop();
			}
		}
		if (declarationKeywords.has(token.value) || token.value === ";") {
			reader.fail(`Unclosed ${open}`, token);
		}
	}
};

export const readType = (reader: TokenReader): string => {
	const start = reader.peek()?.start ?? reader.source.length;
	// Prefix types can nest arbitrarily; iteration avoids a JavaScript stack limit.
	while (true) {
		if (
			["POINTER", "REFERENCE", "REF_TO"].includes(reader.peek()?.value ?? "")
		) {
			if (reader.take().value !== "REF_TO") {
				reader.expect("TO");
			}
			continue;
		}
		if (reader.consume("ARRAY")) {
			readDelimitedType(reader, "[");
			reader.expect("OF");
			continue;
		}
		break;
	}
	readIdentifier(reader);
	while (reader.consume(".")) {
		readIdentifier(reader);
	}
	for (const open of ["(", "[", "<"] as const) {
		if (reader.peek()?.value === open) {
			readDelimitedType(reader, open);
		}
	}
	return reader.source.slice(start, reader.end);
};

export const readVariableSection = (reader: TokenReader) => {
	reader.take();
	const conditionals: { hasElse: boolean }[] = [];
	while (reader.peek()?.value !== "END_VAR") {
		const token = reader.take();
		if (variableSections.has(token.value) || closingObjects.has(token.value)) {
			reader.fail("Missing END_VAR", token);
		}
		const directive = conditionalDirective(token);
		if (!directive) {
			continue;
		}
		if (directive === "IF") {
			conditionals.push({ hasElse: false });
			continue;
		}
		const current = conditionals.at(-1);
		if (!current) {
			return reader.fail("Unmatched conditional pragma", token);
		}
		if (directive === "END_IF") {
			conditionals.pop();
			continue;
		}
		if (current.hasElse) {
			reader.fail("Conditional branch after ELSE", token);
		}
		current.hasElse = directive === "ELSE";
	}
	if (conditionals.length) {
		reader.fail("Conditional pragmas must remain inside one variable section");
	}
	reader.take();
	readDeclarationSemicolon(reader);
};

export const readDeclarationSections = (reader: TokenReader) => {
	while (reader.peek()) {
		// Pragmas belong to the declaration only when another declaration follows.
		// Look ahead without consuming them so a pragma-only body stays intact.
		let ahead = 0;
		while (isDeclarationPragma(reader.peek(ahead))) {
			ahead++;
		}
		const next = reader.peek(ahead)?.value ?? "";
		if (variableSections.has(next)) {
			readDeclarationPragmas(reader);
			readVariableSection(reader);
			continue;
		}
		if (next !== "EXTENDS" && next !== "IMPLEMENTS") {
			return;
		}
		// CODESYS generic FBs can place these clauses after VAR_GENERIC.
		readDeclarationPragmas(reader);
		reader.take();
		readType(reader);
		while (reader.consume(",")) {
			readType(reader);
		}
	}
};
