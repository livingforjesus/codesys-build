import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { loadConfig, loadSources, type SourceObject } from "../src";

it("discovers the complete example across domains and retains nested POU members", async () => {
	const config = await loadConfig(
		fileURLToPath(
			new URL(
				"../examples/frame-assembly/codesys-build.config.ts",
				import.meta.url,
			),
		),
	);
	const sources = await loadSources(config);
	expect(sources.entry).toBe("Main");
	const descendants = (objects: SourceObject[]): SourceObject[] =>
		objects.flatMap((object) => [object, ...descendants(object.children)]);
	const objects = descendants(sources.objects);
	for (const kind of [
		"program",
		"function_block",
		"function",
		"interface",
		"method",
		"property",
		"get",
		"set",
		"action",
		"dut",
		"gvl",
	]) {
		expect(objects.some((object) => object.kind === kind)).toBe(true);
	}
	for (const kind of ["structure", "enumeration", "union", "alias"]) {
		expect(objects.some((object) => object.dutType === kind)).toBe(true);
	}
	const conveyor = sources.objects.find(
		(object) => object.name === "FB_Conveyor",
	);
	if (!conveyor) {
		throw new Error("Example conveyor is missing");
	}
	expect(conveyor.folder).toEqual(["transport"]);
	expect(conveyor.children.map((child) => child.name).sort()).toEqual([
		"IsRunning",
		"RequestedSpeed",
		"ResetCounter",
		"SetEnabled",
	]);
	expect(sources.objects.some((object) => object.name === "SetEnabled")).toBe(
		false,
	);
});
