import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "codesys-build";

const prefix = join(homedir(), ".wine.codesys");
export const config = defineConfig({
	codesys:
		process.platform === "win32"
			? {
					executable: "C:/CODESYS-3.5.22.30/CODESYS/Common/CODESYS.exe",
					profile: "CODESYS V3.5 SP22 Patch 3",
				}
			: {
					executable: join(
						prefix,
						"drive_c/CODESYS-3.5.22.30/CODESYS/Common/CODESYS.exe",
					),
					profile: "CODESYS V3.5 SP22 Patch 3",
					wine: {
						prefix,
						binary: "wine",
						pathBinary: "winepath",
						nativeExit: true,
					},
				},
	template: "templates/local.project",
	runtime: { composeFile: "compose.yaml" },
	entry: "src/Main.st",
	task: "MainTask",
	symbols: true,
	removeObjects: [
		"PLC_PRG",
		"Visualization Manager",
		"VISU_TASK",
		"LineView",
		"__VisualizationStyle",
		"Communication Manager",
		"Line_IO",
		"ST_WebPayload",
	],
});
