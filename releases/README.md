# RevIntel — distributable artifacts

This folder holds **pre-built wheels** for the `revintel-backend` package,
checked into git so deployers don't need a local Python toolchain to ship a
new RevIntel backend.

## What's here

| File | Purpose |
|---|---|
| `revintel_backend-<version>-py3-none-any.whl` | The deployable backend wheel. Pure-Python, py3-compatible. Install with `pip install <path-to-wheel>`. |

## How it gets refreshed

The maintainer runs `make wheel` after a backend change. The Makefile target
builds the wheel into `backend/dist/` (gitignored) and **also copies it
here**, into `releases/`, where it's tracked.

Then the maintainer commits both the wheel and any source changes:

```bash
make wheel
git add releases/ backend/src/
git commit -m "Bump backend wheel to <new-version>"
git push
```

Anyone deploying afterwards picks up the new wheel automatically when they
`git pull` — no local Python build required.

## Why a wheel and not source?

- **Faster deploy** — Databricks Apps installs one wheel (~44 KB) instead
  of resolving and downloading 12 dependencies.
- **Reproducible** — the deployed bytes are identical to whatever was
  built and tested against the maintainer's environment.
- **Locked-down friendly** — colleagues with restricted PyPI access can
  ship without `pip install build` or any Python venv setup.
- **Tiny footprint** — `releases/` will only ever hold one wheel per
  released version. Old wheels can be deleted when superseded.
