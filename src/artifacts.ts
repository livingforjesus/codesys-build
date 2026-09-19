import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

export const buildFiles = {
	project: "Application.project",
	output: "runtime/Application.app",
	checksum: "runtime/Application.crc",
	receipt: "build.json",
} as const;

const receiptSchema = z.object({
	mode: z.literal("build"),
	application: z.string().regex(/^[A-Za-z_][A-Za-z_0-9]*$/),
});

/** A receipt is published last, after every artifact has been checked and replaced. */
export const readBuild = async (directory: string) => {
	const receipt = receiptSchema.safeParse(
		JSON.parse(await readFile(resolve(directory, buildFiles.receipt), "utf8")),
	);
	if (!receipt.success) {
		throw new Error("CODESYS did not produce a valid build receipt", { cause: receipt.error });
	}
	for (const file of [buildFiles.project, buildFiles.output, buildFiles.checksum]) {
		const artifact = await stat(resolve(directory, file));
		if (!artifact.isFile() || artifact.size === 0) {
			throw new Error(`CODESYS produced an empty artifact: ${file}`);
		}
	}
	return {
		...receipt.data,
		directory,
		project: resolve(directory, buildFiles.project),
		output: resolve(directory, buildFiles.output),
		checksum: resolve(directory, buildFiles.checksum),
	};
};
