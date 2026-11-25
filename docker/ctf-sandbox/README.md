# CTF Intelligence — Docker Sandbox

Isolated execution for CTF artifact analysis. The platform never executes
uploaded files directly on the host.

## Build

```bash
docker build -t ctf-intelligence-sandbox:latest docker/ctf-sandbox
```

Or with npm:

```bash
npm run ctf:sandbox:build
```

## Runtime guarantees

The runner (`src/lib/ctf/sandbox.ts`) always applies:

- `--network none`
- `--read-only` root filesystem
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--user 65534:65534` (non-root)
- `--memory 256m --memory-swap 256m`
- `--cpus 0.5`
- `--pids-limit 64`
- `--tmpfs /tmp:rw,noexec,nosuid,size=16m`
- `--rm` with a 30s hard timeout
- Uploaded file bind-mounted read-only at `/analysis/input`

## Enable

1. Install Docker Desktop / Docker Engine.
2. Build the image.
3. Set `CTF_SANDBOX_ENABLED=1` (or toggle in System Settings).
4. The Tools page reports daemon and image availability honestly.

## Limits

The sandbox only runs fixed shell profiles (`file`, `strings`, `sha256sum`,
`od`) against the mounted file. It is **not** a general command runner and
does not enable network access.
