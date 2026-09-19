import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const image = process.argv[2];
if (!image) {
	throw new Error(
		"Usage: bun run test:runtime -- <installed CODESYS Virtual Control Linux image>",
	);
}
const execute = promisify(execFile);
const installer = await readFile(
	new URL("../../runtime/install.sh", import.meta.url),
	"utf8",
);
const root = await mkdtemp(resolve(tmpdir(), "codesys-runtime-install-"));
try {
	for (const directory of ["conf", "data/PlcLogic/Application", "artifacts"]) {
		await mkdir(resolve(root, directory), { recursive: true });
	}
	for (const extension of ["app", "crc"]) {
		await writeFile(
			resolve(root, "artifacts", `Application.${extension}`),
			`fixture ${extension}`,
		);
	}
	const retained = resolve(root, "data/PlcLogic/Application/Application.ret");
	await writeFile(retained, "existing retain data");
	const install = () =>
		execute(
			"docker",
			[
				"run",
				"--rm",
				"--entrypoint",
				"/bin/sh",
				"--volume",
				`${resolve(root, "conf")}:/conf/codesyscontrol`,
				"--volume",
				`${resolve(root, "data")}:/data/codesyscontrol`,
				"--volume",
				`${resolve(root, "artifacts")}:/codesys-build:ro`,
				image,
				"-c",
				installer,
				"codesys-build-install",
				"Application",
			],
			{ timeout: 60_000 },
		);
	const userConfig = resolve(root, "conf/CODESYSControl_User.cfg");
	await install();
	const initialized = await readFile(userConfig, "utf8");
	assert.match(initialized, /^Application\.1=Application$/m);
	assert.equal(await readFile(retained, "utf8"), "existing retain data");
	for (const extension of ["app", "crc"]) {
		assert.equal(
			await readFile(
				resolve(root, "data/PlcLogic/Application", `Application.${extension}`),
				"utf8",
			),
			`fixture ${extension}`,
		);
	}
	await install();
	assert.equal(
		await readFile(userConfig, "utf8"),
		initialized,
		"Repeated installation must not duplicate registrations",
	);

	// A registration in the base config must not be overwritten by a new index in
	// the user config, even when that file has no CmpApp section yet.
	const baseConfig = resolve(root, "conf/CODESYSControl.cfg");
	await writeFile(baseConfig, "[CmpApp]\nApplication.2=Other\n");
	await writeFile(
		userConfig,
		"[CmpUserMgr]\nSECURITY.UserLogin_AuthenticationType=ONLY_ASYMMETRIC\n",
	);
	await chmod(userConfig, 0o640);
	await install();
	assert.equal(
		await readFile(baseConfig, "utf8"),
		"[CmpApp]\nApplication.2=Other\n",
	);
	assert.match(
		await readFile(userConfig, "utf8"),
		/^Application\.3=Application$/m,
	);
	assert.match(
		await readFile(userConfig, "utf8"),
		/^SECURITY.UserLogin_AuthenticationType=ONLY_ASYMMETRIC$/m,
	);
	assert.equal((await stat(userConfig)).mode & 0o777, 0o640);
	assert.equal(await readFile(retained, "utf8"), "existing retain data");

	await writeFile(baseConfig, "[CmpApp]\nApplication.5=Application\n");
	await writeFile(userConfig, "[CmpApp]\nApplication.2=Other\n");
	await install();
	assert.equal(
		await readFile(userConfig, "utf8"),
		"[CmpApp]\nApplication.2=Other\n",
	);

	// The same key in the user config shadows the base registration. Whitespace
	// must not hide that override or cause an existing application to be replaced.
	await writeFile(userConfig, "  [CmpApp]  \r\n  Application.5 = Other  \r\n");
	await install();
	assert.match(
		await readFile(userConfig, "utf8"),
		/^Application\.6=Application$/m,
	);
	assert.match(
		await readFile(userConfig, "utf8"),
		/^ {2}Application\.5 = Other {2}\r?$/m,
	);
	console.log(
		"Runtime installer passed: fresh volumes, repeat installation, existing applications, retain data, security settings and file permissions.",
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
