export type Token = {
	kind: "word" | "string" | "pragma" | "symbol";
	value: string;
	start: number;
	end: number;
};

export class StSyntaxError extends Error {
	constructor(
		source: string,
		offset: number,
		filename: string,
		message: string,
	) {
		const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
		super(
			`${filename}:${lines.length}:${(lines.at(-1)?.length ?? 0) + 1}: ${message}`,
		);
		this.name = "StSyntaxError";
	}
}

/** Keep original offsets: splitting must preserve comments, pragmas and source spelling. */
export const tokenize = (source: string, filename = "<source>"): Token[] => {
	const tokens: Token[] = [];
	let offset = 0;
	const fail = (start: number, message: string): never => {
		throw new StSyntaxError(source, start, filename, message);
	};
	const quoted = () => {
		const start = offset;
		const quote = source[offset++];
		while (offset < source.length) {
			// IEC strings escape characters (including quotes and $ itself) with $.
			if (source[offset] === "$") {
				offset += 2;
			} else if (source[offset++] === quote) {
				return;
			}
		}
		fail(start, "Unterminated string");
	};
	while (offset < source.length) {
		const start = offset;
		const character = source[offset] ?? "";
		if (/\s|\uFEFF/.test(character)) {
			offset++;
			continue;
		}
		if (source.startsWith("//", offset)) {
			while (offset < source.length && !/[\r\n]/.test(source[offset] ?? "")) {
				offset++;
			}
			continue;
		}
		if (source.startsWith("(*", offset)) {
			offset += 2;
			let depth = 1;
			while (offset < source.length && depth > 0) {
				if (source.startsWith("(*", offset)) {
					depth++;
					offset += 2;
				} else if (source.startsWith("*)", offset)) {
					depth--;
					offset += 2;
				} else {
					offset++;
				}
			}
			if (depth) {
				fail(start, "Unterminated block comment");
			}
			continue;
		}
		if (character === "'" || character === '"') {
			quoted();
			tokens.push({
				kind: "string",
				value: source.slice(start, offset),
				start,
				end: offset,
			});
			continue;
		}
		if (character === "{") {
			offset++;
			while (offset < source.length && source[offset] !== "}") {
				if (source[offset] === "'" || source[offset] === '"') {
					quoted();
				} else {
					offset++;
				}
			}
			if (offset === source.length) {
				fail(start, "Unterminated pragma");
			}
			offset++;
			tokens.push({
				kind: "pragma",
				value: source.slice(start, offset),
				start,
				end: offset,
			});
			continue;
		}
		if (/[A-Za-z_]/.test(character)) {
			offset++;
			while (/[A-Za-z_0-9]/.test(source[offset] ?? "")) {
				offset++;
			}
			tokens.push({
				kind: "word",
				value: source.slice(start, offset).toUpperCase(),
				start,
				end: offset,
			});
			continue;
		}
		offset++;
		const pair = source.slice(start, offset + 1);
		if ([":=", "=>", "..", "<=", ">=", "<>", "**"].includes(pair)) {
			offset++;
		}
		tokens.push({
			kind: "symbol",
			value: source.slice(start, offset),
			start,
			end: offset,
		});
	}
	return tokens;
};
