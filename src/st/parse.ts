import { basename } from "node:path";
import {
	declarationKeywords,
	globalSections,
	objectKinds,
	readDeclarationPragmas,
	readDeclarationSections,
	readDeclarationSemicolon,
	readIdentifier,
	readModifiers,
	readType,
	readVariableSection,
	variableSections,
} from "./declarations";
import type { Token } from "./lexer";
import { createTokenReader, type TokenReader } from "./reader";

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

type ParseOptions = {
	filename?: string;
	declarationOnly?: boolean;
	name?: string;
};

const dutTypes: Record<string, NonNullable<ParsedSource["dutType"]>> = {
	STRUCT: "structure",
	UNION: "union",
	"(": "enumeration",
};

const parseDut = (reader: TokenReader): ParsedSource => {
	reader.expect("TYPE");
	readModifiers(reader);
	const name = readIdentifier(reader);
	if (reader.consume("EXTENDS")) {
		readType(reader);
	}
	reader.expect(":");
	readDeclarationPragmas(reader);
	const dutType = dutTypes[reader.peek()?.value ?? ""] ?? "alias";
	while (reader.peek()?.value !== "END_TYPE") {
		if (reader.peek()?.value === "TYPE") {
			reader.fail("Only one TYPE declaration is allowed per file");
		}
		reader.take();
	}
	reader.take();
	reader.consume(";");
	if (reader.peek()) {
		reader.fail("Unexpected content after END_TYPE");
	}
	return { kind: "dut", name, declaration: reader.source, dutType };
};

const parseGlobals = (
	reader: TokenReader,
	options: ParseOptions,
): ParsedSource => {
	const header = reader.peek();
	while (reader.peek()) {
		readDeclarationPragmas(reader);
		if (!reader.peek()) {
			break;
		}
		if (!globalSections.has(reader.peek()?.value ?? "")) {
			reader.fail("Expected a global variable section");
		}
		readVariableSection(reader);
	}
	const name = options.name ?? basename(reader.filename, ".st");
	if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) {
		reader.fail(
			"Global list requires an IEC filename or an explicit name",
			header,
		);
	}
	return { kind: "gvl", name, declaration: reader.source };
};

const validateImplementation = (reader: TokenReader, tokens: Token[]) => {
	for (const token of tokens) {
		if (token.kind !== "word") {
			continue;
		}
		if (variableSections.has(token.value) || token.value === "END_VAR") {
			reader.fail(
				"Variable declaration outside the declaration section; conditional declaration envelopes are not supported",
				token,
			);
		}
		if (declarationKeywords.has(token.value)) {
			reader.fail(
				"Nested objects must be separate child files, or the object terminator is mismatched",
				token,
			);
		}
	}
};

const splitObject = (
	reader: TokenReader,
	header: Token,
	kind: ObjectKind,
	options: ParseOptions,
): Pick<ParsedSource, "declaration" | "implementation"> => {
	const terminator = `END_${header.value}`;
	const remaining = reader.tokens.slice(reader.index);
	const terminatorIndex = remaining.findIndex(
		(token) => token.kind === "word" && token.value === terminator,
	);
	// Even interfaces and properties need END_* in combined files. Only an explicit
	// declaration-only input (e.g. a paired declaration.st) may omit it.
	if (terminatorIndex < 0 && !options.declarationOnly) {
		reader.fail(`Missing ${terminator}`);
	}
	const bodyTokens =
		terminatorIndex < 0 ? remaining : remaining.slice(0, terminatorIndex);
	const [endToken, next, afterSemicolon] =
		terminatorIndex < 0 ? [] : remaining.slice(terminatorIndex);
	const semicolon = next?.value === ";" ? next : undefined;
	const unexpected = semicolon ? afterSemicolon : next;
	if (unexpected) {
		reader.fail(`Unexpected content after ${terminator}`, unexpected);
	}
	validateImplementation(reader, bodyTokens);

	const declarationOnly =
		options.declarationOnly || kind === "interface" || kind === "property";
	if (declarationOnly && bodyTokens.length) {
		reader.fail(
			"Unexpected implementation in a declaration-only object",
			bodyTokens[0],
		);
	}

	const declaration = reader.source.slice(0, reader.end);
	// Remove only END_* and its optional semicolon. Keep whitespace and trailing
	// comments in the body, or in the declaration for objects without a body.
	const body =
		reader.source.slice(reader.end, endToken?.start) +
		(endToken ? reader.source.slice((semicolon ?? endToken).end) : "");
	if (declarationOnly) {
		return { declaration: declaration + body };
	}
	return { declaration, implementation: body };
};

const parsePou = (reader: TokenReader, options: ParseOptions): ParsedSource => {
	const header = reader.take();
	if (!(header.value in objectKinds)) {
		reader.fail(`Unsupported object header ${header.value}`, header);
	}
	const kind = objectKinds[header.value as keyof typeof objectKinds];
	readModifiers(reader);
	const name = readIdentifier(reader);
	const returnType = reader.consume(":") ? readType(reader) : undefined;
	if (returnType === undefined && kind === "property") {
		reader.fail(`${header.value} requires a return type`);
	}
	// Exported declarations may terminate the header itself with a semicolon.
	readDeclarationSemicolon(reader);
	readDeclarationSections(reader);
	return {
		kind,
		name,
		...(returnType === undefined ? {} : { returnType }),
		...splitObject(reader, header, kind, options),
	};
};

/** Parse only the object envelope and declarations. CODESYS validates executable ST. */
export const parseSource = (
	source: string,
	options: ParseOptions = {},
): ParsedSource => {
	const reader = createTokenReader(source, options.filename ?? "<source>");
	readDeclarationPragmas(reader);
	const header = reader.peek();
	if (header?.value === "TYPE") {
		return parseDut(reader);
	}
	if (header && globalSections.has(header.value)) {
		return parseGlobals(reader, options);
	}
	return parsePou(reader, options);
};
