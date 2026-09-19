# Running in Docker

`codesys-build run` installs an already completed build into a **CODESYS Virtual Control for Linux** Docker Compose service. It does not compile, open the IDE, or require a gateway/login. It uses the [offline boot application deployment supported by CODESYS](https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_creating_a_boot_application.html).

```ts
export const config = defineConfig({
  // Existing CODESYS installation, template and source settings...
  outDir: "build/codesys",
  runtime: { composeFile: "../compose.yaml", service: "plc" },
});
```

```sh
codesys-build build
codesys-build run
codesys-build open
```

`open` defaults to `build/codesys/Application.project` in this example. To edit the template instead, pass its path explicitly: `codesys-build open templates/local.project`.

## Runtime requirements

- Docker is running and the CODESYS runtime image is installed. Obtain the image and any required license from CODESYS; this package does not supply them.
- The Compose service uses a compatible Virtual Control Linux image and target architecture. The included example targets Linux ARM64 4.22.0.0.
- The service has writable named volumes or bind mounts at `/conf/codesyscontrol` and `/data/codesyscontrol`, following the image's layout. Anonymous volumes and tmpfs cannot share the helper's installation with the PLC container. See [compose.yaml](../examples/frame-assembly/compose.yaml).
- The runtime's normal `codesyscontrol.log` file includes application start events (the image's default configuration). Restrictive logging settings may prevent readiness confirmation.

## What run does

1. Validates the completion receipt, project, boot application, and checksum before touching Docker.
2. Validates the service and persistent mounts, then stops only that service.
3. Uses a temporary helper container from the same service/image to initialize empty volumes, register the boot application, and install its `.app`/`.crc` pair. The helper is removed afterwards.
4. Starts the service without starting its Compose dependencies.
5. Reads the runtime log and waits for that application's start event after the container's current startup time. A running container alone is not treated as a running PLC application.

This is a **cold deployment**: it interrupts the PLC and starts the boot application again. It is not an online change or a watch mode. Existing runtime settings, device users, certificates, licenses, other boot registrations, and retain/application data are preserved. Retain compatibility is still checked by CODESYS. Security settings are not relaxed. Graphical/visualization assets and external download files are not deployed by this command; it deploys the compiled boot pair.

An installation failure leaves the service stopped. An application startup failure leaves the container available for diagnosis and reports the recent runtime log. Inspect it with:

```sh
docker compose -f ../compose.yaml logs plc
docker compose -f ../compose.yaml exec plc tail -n 100 /data/codesyscontrol/codesyscontrol.log
```

Docker stdout may buffer the runtime's messages; the file above updates immediately. Start confirmation is a point-in-time check, not ongoing application supervision. Runtime demo/license limits still apply.

## Testing the installer

From the package checkout, run the integration checks against an installed image:

```sh
bun run test:runtime -- codesyscontrol_virtuallinuxarm64:4.22.0.0
```

The checks use disposable containers and temporary directories to exercise fresh-volume initialization, repeat installation, existing application registrations, retain data, security settings, and file permissions. They do not start a PLC application. The build-and-run flow has also been exercised with CODESYS under Wine on macOS and this ARM64 runtime image; other image versions and native Windows remain unverified.
