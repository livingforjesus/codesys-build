# Configuration reference

Export `const config = defineConfig({...})` from `codesys-build.config.ts`. A default export is not used. Unknown fields fail validation so misspelled options cannot silently fall back to defaults.

| Field | Default | Meaning |
| --- | --- | --- |
| `codesys.executable` | Required | Host filesystem path to CODESYS.exe. Under Wine, use the Unix path into the prefix. |
| `codesys.profile` | Required | Installed CODESYS profile, including spaces/version/patch. |
| `codesys.commandProcessor` | `cmd.exe` | Native Windows command processor. |
| `codesys.wine` | Required on macOS/Linux | Wine settings below. Ignored on native Windows. |
| `template` | Required | Existing binary `.project` with active Application, target and libraries. |
| `sourceDir` | `src` | Recursively scanned ST source tree. |
| `entry` | `src/Main.st` | Exact combined source or declaration file of a discovered PROGRAM. |
| `outDir` | `build` | Stable artifacts plus a bounded `.codesys/` working directory. |
| `runtime.composeFile` | Unset | Docker Compose file for `run`, relative to the config. |
| `runtime.service` | `plc` | CODESYS Virtual Control service to install/start. |
| `timeouts.runtime` | 60,000 ms | Per-Docker-command and application-start deadlines. |
| `task` | `MainTask` | Existing task whose calls are replaced by the entry program. |
| `symbols` | `false` | Create a classic symbol configuration if one does not already exist. Existing settings remain intact. |
| `removeObjects` | `[]` | Template objects to remove by name, recursively, from the private copy. Useful for obsolete demo POUs. |
| `timeouts.startup` | 1,200,000 ms | Worker startup/health-check deadline. |
| `timeouts.build` | 1,200,000 ms | Per-build deadline. |
| `timeouts.stop` | 10,000 ms | Graceful stop deadline. |
| `timeouts.terminate` | 5,000 ms | Wait after terminating an owned worker. |
| `timeouts.hostCommand` | 15,000 ms | Wine/version and process-management command deadline. |

Wine fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `prefix` | Required | Prefix containing the CODESYS installation. |
| `binary` | `wine` | Wine launcher executable or command on PATH. |
| `pathBinary` | `winepath` | Fallback Unix-to-Windows path converter. |
| `debug` | `-all` | WINEDEBUG passed to child processes. |
| `nativeExit` | `false` | Use `ExitProcess` at worker shutdown when Wine hangs during normal CODESYS exit. It does not affect native Windows. |

Relative project paths and the Wine prefix resolve from the config directory. Tool commands such as `wine` resolve through PATH; use absolute paths for tools outside PATH. Config imports are ordinary trusted TypeScript executed by Bun. Keep machine settings in the config or import them from a local TypeScript module; the package never reads CODESYS settings from `.env`.

For a split entry use its actual declaration path:

```ts
entry: "src/PRG_Main/declaration.st"
```

The entry is a normal PROGRAM. Other programs are discovered and compiled but do not run unless called by the entry or by another explicitly configured template task. No dependency graph or execution schedule is inferred from source ordering.

The build modifies the selected task's call list only. To change timing, add independent tasks, configure devices, install libraries or select a runtime target, edit the project template in CODESYS. Do not duplicate those settings in this config.

Each project/configuration that can run concurrently must have its own `outDir`. That directory is the ownership boundary for worker locking and reuse.
