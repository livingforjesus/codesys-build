import { StSyntaxError, type Token, tokenize } from "./lexer";

/** Traverse tokens without losing the source offsets needed for an exact split. */
export const createTokenReader = (source: string, filename: string) => {
	const tokens = tokenize(source, filename);
	let index = 0;
	const peek = (ahead = 0) => tokens[index + ahead];
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
		index++;
		return token;
	};
	const expect = (value: string) => {
		if (peek()?.value !== value) {
			fail(`Expected ${value}`);
		}
		return take();
	};
	const consume = (value: string) => {
		if (peek()?.value === value) {
			return take();
		}
	};

	return {
		source,
		filename,
		tokens,
		peek,
		take,
		expect,
		consume,
		fail,
		get index() {
			return index;
		},
		// The declaration ends at the last consumed token, before any body whitespace.
		get end() {
			return tokens[index - 1]?.end ?? 0;
		},
	};
};

export type TokenReader = ReturnType<typeof createTokenReader>;
