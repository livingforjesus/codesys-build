# Operation and troubleshooting

## Build ownership

Every build snapshots the configured template and parsed source contents before sending the request to a worker. Only a private project copy is modified. The worker emits a compiler receipt after checking diagnostics, generating code, saving the project and producing a non-empty boot application. The CLI also checks the receipt and non-empty artifacts before creating `success.json`.

Source changes do not require restarting the worker. Changes to the CODESYS installation/profile or package's Python scripts require `stop-worker`, then another build. Object additions/removals/moves, template changes and entry changes reopen the template automatically so old source-owned children cannot survive.

The mailbox publishes complete JSON through a same-directory temporary file and rename. A per-output-directory lock serializes separate CLI invocations. A stale lock from a crashed client is reported with its path; inspect the owning process before removing that specific lock. The tool does not delete a possibly replaced lock automatically.

Timeouts terminate only a worker launched by that invocation or one that has answered its health check. A saved PID alone is insufficient proof of ownership. No global `wineserver -k` is used.

## Inspecting a failure

1. Read the CLI error and its cause.
2. Check `build/run-*/progress.log` for the last completed phase.
3. Read `error.txt` for the CODESYS scripting/compiler traceback.
4. Read `build/ide/session-*/codesys.log` for startup or installation errors.
5. Open the diagnostic `Application.project`, when one was saved, in a separate IDE window.

The template is not saved on failures. A partially imported project is never reused for the next build.

## Common setup errors

- **Missing executable/profile:** set the actual host path and installed profile in the config. Under Wine the executable is a Unix path, not `C:\\...`.
- **Missing device/library:** install the exact versions referenced by the template into that CODESYS installation.
- **Missing task:** create the configured task in the template. An unscheduled entry is a build error.
- **Names collide:** folders organize objects but do not isolate IEC names. Rename the conflicting source objects and their references.
- **Ambiguous source pair:** keep one declaration and one implementation, or one complete file. There is no preferred variant when duplicates exist.
- **IDE is not editable:** the worker runs a persistent script. Use `open` for an interactive window; it does not pass `--runscript`.
- **Wine hangs on exit:** try `codesys.wine.nativeExit: true` for that installation.
- **Config resolves the wrong paths:** project paths resolve from the config file, not the shell's working directory.

## Portable package checks

`bun pm pack` packages TypeScript runtime code and the Python worker together. Test the produced archive in an empty project before publishing; running directly from a checkout alone does not validate package contents. Publication is a separate, explicit action.
