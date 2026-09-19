# codesys-build

Build CODESYS applications from Structured Text files organized by domain. Author complete ST objects or explicit declaration/implementation pairs, select an entry program in TypeScript, and compile against an existing CODESYS project template.

This package uses the CODESYS scripting interface. It does not use the paid File-Based Storage add-on. A CODESYS installation, the template's device packages and libraries, and any licenses required by that target are still needed. The CLI runs on **Bun 1.3+**. Native Windows and Wine hosts are supported; see the verification notes in the example for platforms actually exercised.

## Install

Install with your favorite package manager

```sh
bun add codesys-build
```

## First project

Create `codesys-build.config.ts`:

```ts
import { defineConfig } from "codesys-build";

export const config = defineConfig({
	codesys: {
		executable: "C:/CODESYS-3.5.22.30/CODESYS/Common/CODESYS.exe",
		profile: "CODESYS V3.5 SP22 Patch 3",
	},
	template: "templates/base.project",
	entry: "src/Main.st",
	task: "MainTask",
});
```

The template must have an active Application and an existing task named `MainTask`. Its device, library references, cycle interval, priority and watchdog remain configured in CODESYS. During the build, that task's program-call list is replaced with the selected entry. Other tasks retain their configuration and calls.

Create `src/Main.st`:

```iecst
PROGRAM Main
VAR
	Cycles : UDINT;
END_VAR

Cycles := Cycles + 1;
END_PROGRAM
```

Add package scripts:

```json
{
	"scripts": {
		"check:plc": "codesys-build check",
		"build:plc": "codesys-build build",
		"open:plc": "codesys-build open",
		"stop:plc": "codesys-build stop-worker"
	}
}
```

Run them with `bun run check:plc` and `bun run build:plc`. `check` validates source envelopes, file layout, names and entry selection. **It does not typecheck ST or prove that CODESYS can compile it.** `build` runs the actual compiler and verifies its diagnostics and artifacts.

For Wine:

```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "codesys-build";

const prefix = join(homedir(), ".wine.codesys");
export const config = defineConfig({
	codesys: {
		executable: join(prefix, "drive_c/CODESYS-3.5.22.30/CODESYS/Common/CODESYS.exe"),
		profile: "CODESYS V3.5 SP22 Patch 3",
		wine: { prefix, binary: "wine", pathBinary: "winepath" },
	},
	template: "templates/base.project",
	entry: "src/Main.st",
});
```

These are configuration values, not environment-variable names. Change installation paths and profile to match your machine. No `.env` file is required. OS process settings such as `PATH` and `DISPLAY` are inherited so the installed tools can run.

## Source layout

```text
src/
  Main.st
  transport/
    FB_Conveyor/
      source.st
      methods/
        SetEnabled.st
      properties/
        IsRunning/
          declaration.st
          get.st
      actions/
        ResetCounter.st
    ST_ConveyorState.st
  framing/
    PRG_Framing/
      declaration.st
      implementation.st
```

Combined executable objects include their `PROGRAM` / `FUNCTION_BLOCK` / `FUNCTION` / `METHOD` header and matching `END_*`. A folder's combined source may be `source.st` or `<object-name>.st`. A standalone `<object-name>.st` is also supported.

All these split layouts are accepted:

```text
FB_Motor/declaration.st                  + FB_Motor/implementation.st
FB_Motor/FB_Motor.declaration.st         + FB_Motor/FB_Motor.implementation.st
FB_Motor/declaration.st                  + FB_Motor/FB_Motor.implementation.st
FB_Motor/FB_Motor.declaration.st         + FB_Motor/implementation.st
any-domain/FB_Motor.declaration.st       + any-domain/FB_Motor.implementation.st
```

There is no precedence rule for duplicate sources: two implementations for one object, or a combined file alongside a split pair, are errors. An empty implementation file is valid. A missing implementation file is not.

The source declaration determines the kind and IEC name. Recognized prefixes (`FB_`, `PRG_`, `F_`/`FUN_`, `I_`, `ST_`/`E_`/`T_`/`U_`, `GVL_`) are checked for consistency when present. Plain type filenames and existing globals such as `LineIO.st` remain valid. GVLs have no named header, so their filename determines their CODESYS name. Folder names organize the IDE; they do not create IEC namespaces. Application object names must remain unique, ignoring case.

See [source conventions](docs/sources.md) for methods, properties, actions, interfaces and parsing limits.

## Commands and artifacts

```sh
codesys-build check
codesys-build build
codesys-build open build/run-XXXX/Application.project
codesys-build launch-worker
codesys-build stop-worker
codesys-build build --config path/to/codesys-build.config.ts
```

The default config path is relative to the working directory. Paths inside a config are relative to that config's directory. The optional project argument to `open` is relative to the working directory.

A successful build produces a new directory:

```text
build/run-XXXX/
  Template.project           # Snapshot of the input template
  request.json               # Exact parsed sources and import parameters
  progress.log
  Application.project        # Generated CODESYS project
  runtime/Application.app    # Boot application (and compiler-generated companion files)
  compiled.json              # Compiler completion receipt
  success.json               # Host-verified artifact locations
```

Builds only modify private project copies. They do not download to a PLC or change a running application. Open the generated project to inspect it and perform any download through your normal engineering workflow.

One background CODESYS worker is retained per output directory. It reuses the loaded project for text-only changes and reloads the template when object membership, folders, entry selection or template contents change. Source-owned objects replace their template copies, including child objects removed from source. Failed projects are discarded from the worker's cache.

See [configuration](docs/configuration.md), [operation and troubleshooting](docs/operation.md), and the [frame-assembly example](examples/frame-assembly/README.md).

## Package development

```sh
bun install --frozen-lockfile
bun test src tests
bun run test:python
bun run tsc
bun run check
```

Unit tests cover parsing, discovery and configuration. CLI tests use a fake CODESYS executable to exercise real subprocesses, locking, worker reuse, failures and artifacts. Python tests replace only the CODESYS API. Those tests do not substitute for the real compiler verification recorded with the example.
