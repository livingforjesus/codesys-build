# Frame assembly

A larger Structured Text example based on the frame-assembly application's public data types and globals. It demonstrates multiple programs, function blocks, inheritance, interfaces, methods, properties, actions and domain folders. No File-Based Storage add-on is used.

## Run

From the `codesys-build` package directory:

```sh
bun install --frozen-lockfile
bun src/cli.ts check --config examples/frame-assembly/codesys-build.config.ts
bun src/cli.ts build --config examples/frame-assembly/codesys-build.config.ts
bun src/cli.ts stop-worker --config examples/frame-assembly/codesys-build.config.ts
```

Edit `codesys-build.config.ts` to match your CODESYS installation. The included template uses **CODESYS Virtual Control for Linux ARM64, device version 4.22.0.0**, and a 20 ms `MainTask`. Install that device and the template's library dependencies in CODESYS first, or replace the template with one for your target. A different target may need different type or library definitions.

The template supplies the device, task timing and library configuration. Its original `PLC_PRG` and visualization objects are removed from the private build copy. `Main` becomes the configured task's entry program. The original template is preserved.

To use the example as a separate project, copy this directory, install the `codesys-build` checkout or archive as a development dependency, and run `bunx --no-install codesys-build check` / `build` there. See the package README for installation and package-script examples.

## What it demonstrates

| Source | Purpose |
| --- | --- |
| `src/Main.st` | Explicit entry program; orders the programs and calls the framing block. |
| `src/io/PRG_ReadInputs.st` | Complete program in a single file. |
| `src/transport/PRG_Transport/` | Generic `declaration.st` / `implementation.st` pair. |
| `src/hardware/FB_BaseDrive/` | Prefixed `FB_BaseDrive.declaration.st` / `FB_BaseDrive.implementation.st` pair. |
| `src/framing/FB_FramingStation/` | Mixed generic declaration and prefixed implementation; a method with its own split pair. |
| `src/publication/PRG_Publish.*.st` | Flat prefixed pair inside an unrelated domain folder. |
| `src/transport/FB_Conveyor/` | Combined block, inheritance, interface implementation, a method with persistent local state, read-only/read-write properties and an action. |
| `src/hardware/I_Actuator/` | Interface with method and property signatures. |
| `src/common/F_Clamp.st` | Function with inputs and a return value. |
| `src/framing/` and `src/hardware/` types | Structure, enum, union, alias and arrays. |
| `src/generated/` | Snapshot of the original line contract's types and global lists; no dependency on the monorepo's generator. |

`Main` calls input handling, transport, framing and publication in that order. The example runs deterministic demo logic; it is not commissioned machine-control software and contains no runtime deployment command.

Names in different domain folders still share the application's IEC namespace. Child methods and properties belong to their enclosing POU. For the exact grammar and supported filename combinations, see [source conventions](../../docs/sources.md).

## Verification

Built successfully on **2026-09-19** with **CODESYS V3.5 SP22 Patch 3**, **Wine 11.0**, and macOS on Apple Silicon. The build imported all 36 top-level source objects and their child members, rebuilt the reachable application code and exported a non-empty boot application. A second build reused the same worker and loaded project successfully. The package's tests additionally cover source discovery, parsing, import failures and worker lifecycle behavior. Normal application compilation does not validate every unused implementation; see the [parser audit](../../docs/parser-audit.md).

Native Windows and real PLC execution have not been exercised. A successful build verifies the example against this compiler/template combination; it is not a claim that every IEC extension or graphical language is supported.
