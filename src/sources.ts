import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { ResolvedConfig } from "./config";
import { type ObjectKind, type ParsedSource, parseSource } from "./st/parse";

export type SourceObject = ParsedSource & {
	source: string;
	folder: string[];
	children: SourceObject[];
};
type Files = {
	combined: string[];
	declaration: string[];
	implementation: string[];
};
const prefixes: Record<string, ObjectKind> = {
	FB: "function_block",
	PRG: "program",
	FUN: "function",
	F: "function",
	I: "interface",
	ST: "dut",
	E: "dut",
	T: "dut",
	U: "dut",
	GVL: "gvl",
};
const childFolders: Record<string, ObjectKind> = {
	methods: "method",
	properties: "property",
	actions: "action",
};
const canOwn = (kind: ObjectKind) =>
	["program", "function_block", "interface", "property"].includes(kind);
const assertUnique = (objects: SourceObject[], scope: string) => {
	const seen = new Map<string, string>();
	for (const object of objects) {
		const key = object.name.toLowerCase();
		const previous = seen.get(key);
		if (previous) {
			throw new Error(
				`Duplicate IEC name ${object.name} in ${scope}: ${previous} and ${object.source}`,
			);
		}
		seen.set(key, object.source);
		assertUnique(object.children, `${scope}.${object.name}`);
	}
};

const readUnit = async (
	name: string,
	files: Files,
	role?: ObjectKind,
	interfaceMember = false,
): Promise<ParsedSource & { source: string }> => {
	if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) {
		throw new Error(`Invalid IEC object name: ${name}`);
	}
	for (const [part, candidates] of Object.entries(files)) {
		if (candidates.length > 1) {
			throw new Error(
				`Ambiguous ${part} for ${name}: ${candidates.join(", ")}`,
			);
		}
	}
	const combined = files.combined[0];
	const declaration = files.declaration[0];
	const implementation = files.implementation[0];
	if (combined && (declaration || implementation)) {
		throw new Error(`Both combined and split sources exist for ${name}`);
	}
	const path = combined ?? declaration ?? implementation;
	if (!path) {
		throw new Error(`Missing source for ${name}`);
	}
	if (role === "action") {
		if (!combined) {
			throw new Error(`Actions use one implementation-only .st file: ${path}`);
		}
		return {
			kind: "action",
			name,
			declaration: "",
			implementation: await readFile(combined, "utf8"),
			source: combined,
		};
	}
	if (role === "get" || role === "set") {
		if (!combined) {
			throw new Error(`Property accessors use one .st file: ${path}`);
		}
		const body = await readFile(combined, "utf8");
		const header = `METHOD ${name}\n`;
		const parsed = parseSource(`${header}${body}\nEND_METHOD`, {
			filename: combined,
		});
		return {
			...parsed,
			kind: role,
			name,
			declaration: parsed.declaration.slice(header.length),
			source: combined,
		};
	}
	if (!combined && !declaration) {
		throw new Error(`Missing declaration for ${path}`);
	}
	const sourcePath = combined ?? declaration ?? path;
	const parsed = parseSource(await readFile(sourcePath, "utf8"), {
		filename: sourcePath,
		name,
		declarationOnly: !combined || interfaceMember,
	});
	if (parsed.name.toLowerCase() !== name.toLowerCase()) {
		throw new Error(
			`Source name ${name} does not match declaration ${parsed.name}: ${sourcePath}`,
		);
	}
	if (role && parsed.kind !== role) {
		throw new Error(`Expected ${role}, found ${parsed.kind}: ${sourcePath}`);
	}
	if (!role && ["method", "property"].includes(parsed.kind)) {
		throw new Error(`Child object has no enclosing POU: ${sourcePath}`);
	}
	const prefix = /^([A-Z]+)_/.exec(name.toUpperCase())?.[1];
	if (!role && prefix && prefixes[prefix] && prefixes[prefix] !== parsed.kind) {
		throw new Error(
			`Prefix ${prefix}_ conflicts with ${parsed.kind}: ${sourcePath}`,
		);
	}
	const declarationOnly =
		["dut", "gvl", "interface", "property"].includes(parsed.kind) ||
		interfaceMember;
	if (declarationOnly && implementation) {
		throw new Error(`This object has no implementation: ${implementation}`);
	}
	if (!combined && !declarationOnly && !implementation) {
		throw new Error(`Missing implementation for ${sourcePath}`);
	}
	return {
		...parsed,
		...(implementation
			? { implementation: await readFile(implementation, "utf8") }
			: {}),
		source: sourcePath,
	};
};

/** Folder placement organizes the IDE; it never changes IEC names or execution order. */
export const loadSources = async (
	config: Pick<ResolvedConfig, "sourceDir" | "entry">,
) => {
	const objects: SourceObject[] = [];
	const visit = async (
		directory: string,
		folder: string[],
		parent?: SourceObject,
		role?: ObjectKind,
	): Promise<void> => {
		const entries = (await readdir(directory, { withFileTypes: true })).sort(
			(a, b) => a.name.localeCompare(b.name, "en"),
		);
		const groups = new Map<string, { name: string; files: Files }>();
		for (const entry of entries) {
			if (entry.isSymbolicLink()) {
				throw new Error(
					`Source symlinks are not supported: ${resolve(directory, entry.name)}`,
				);
			}
			if (!entry.isFile() || !/\.st$/i.test(entry.name)) {
				continue;
			}
			const stem = entry.name.slice(0, -3);
			const suffix = /^(.*)\.(declaration|implementation)$/.exec(stem);
			const generic = ["source", "declaration", "implementation"].includes(
				stem,
			);
			const name = generic ? basename(directory) : (suffix?.[1] ?? stem);
			const section = suffix?.[2] ?? stem;
			const part =
				section === "declaration" || section === "implementation"
					? section
					: "combined";
			const key = name.toLowerCase();
			const group = groups.get(key) ?? {
				name,
				files: { combined: [], declaration: [], implementation: [] },
			};
			group.files[part].push(resolve(directory, entry.name));
			groups.set(key, group);
		}
		const units: SourceObject[] = [];
		// Read an object's own source before its Get/Set files, which have no POU header.
		const ordered = [...groups].sort(
			([a], [b]) =>
				Number(b === basename(directory).toLowerCase()) -
				Number(a === basename(directory).toLowerCase()),
		);
		for (const [key, { name, files }] of ordered) {
			const ownProperty = units.find(
				(unit) =>
					unit.kind === "property" &&
					unit.name.toLowerCase() === basename(directory).toLowerCase(),
			);
			const accessor =
				ownProperty && (key === "get" || key === "set") ? key : undefined;
			const source =
				files.combined[0] ??
				files.declaration[0] ??
				files.implementation[0] ??
				"";
			const unit: SourceObject = {
				...(await readUnit(
					accessor ? `${accessor[0]?.toUpperCase()}${accessor.slice(1)}` : name,
					files,
					accessor ?? role,
					parent?.kind === "interface",
				)),
				folder: parent ? [] : folder,
				children: [],
			};
			if (accessor && ownProperty) {
				if (parent?.kind === "interface") {
					throw new Error(
						`Interface properties cannot implement accessors: ${source}`,
					);
				}
				ownProperty.children.push(unit);
			} else {
				units.push(unit);
				if (parent) {
					parent.children.push(unit);
				} else {
					objects.push(unit);
				}
			}
		}
		const own = units.find(
			(unit) =>
				unit.name.toLowerCase() === basename(directory).toLowerCase() &&
				canOwn(unit.kind),
		);
		if (own && !parent) {
			own.folder = folder.slice(0, -1);
		}
		for (const entry of entries.filter((entry) => entry.isDirectory())) {
			const childRole = childFolders[entry.name];
			if (own && childRole) {
				if (
					own.kind === "property" ||
					(own.kind === "interface" && childRole === "action")
				) {
					throw new Error(`Unsupported ${entry.name} under ${own.name}`);
				}
				await visit(resolve(directory, entry.name), [], own, childRole);
			} else if (parent) {
				await visit(resolve(directory, entry.name), [], parent, role);
			} else {
				await visit(resolve(directory, entry.name), [...folder, entry.name]);
			}
		}
	};
	await visit(resolve(config.sourceDir), []);
	assertUnique(objects, "Application");
	const entry = objects.find(
		(object) => object.source === resolve(config.entry),
	);
	if (!entry) {
		throw new Error(`Entry is not a discovered source: ${config.entry}`);
	}
	if (entry.kind !== "program") {
		throw new Error(`Entry must be a PROGRAM: ${config.entry}`);
	}
	return { entry: entry.name, objects };
};
