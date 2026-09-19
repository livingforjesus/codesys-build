import { expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, win32 } from "node:path";
import { toWindowsPath } from "./windows-path";

const wineEnv = {
	debug: "-all",
	pathBinary: "missing-winepath",
	binary: "wine",
	nativeExit: false,
	prefix: "/missing",
};

it("preserves native Windows paths containing spaces and metacharacters", async () => {
	const path = "C:\\PLC projects\\A&B!100%\\local.project";
	expect(await toWindowsPath(path, wineEnv, "win32")).toBe(path);
});

it.skipIf(process.platform === "win32")(
	"converts mapped Wine paths without starting winepath",
	async () => {
		const temporary = await mkdtemp(resolve(tmpdir(), "wine-drive-"));
		const root = await realpath(temporary);
		try {
			await mkdir(resolve(root, "dosdevices"));
			await mkdir(resolve(root, "drive_c/PLC sources"), { recursive: true });
			await symlink(resolve(root, "drive_c"), resolve(root, "dosdevices/c:"));
			await symlink("/", resolve(root, "dosdevices/z:"));
			const local = resolve(root, "drive_c/PLC sources/A&B!.project");
			const external = resolve(root, "outside.project");
			await writeFile(local, "project");
			await writeFile(external, "project");
			const env = { ...wineEnv, prefix: root };
			expect(await toWindowsPath(local, env, "darwin")).toBe(
				"C:\\PLC sources\\A&B!.project",
			);
			expect(await toWindowsPath(external, env, "darwin")).toBe(
				win32.join("Z:\\", ...external.split("/")),
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	},
);
