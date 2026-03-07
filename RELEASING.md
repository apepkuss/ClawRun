# ClawRun Release Process

## Version Source of Truth

`clawrun/oac/Chart.yaml` — the `version` field is the single source of truth.
All other manifests are synced automatically by `deploy.sh` (local) or GitHub Actions (CI).

## CI Release (GitHub Actions)

Triggered by pushing a `v*` tag. Produces a GitHub Release with Docker image + OAC tgz.

```bash
# 1. Bump version
#    Edit clawrun/oac/Chart.yaml → version: '0.1.2'

# 2. Commit and tag
git commit -am "Release v0.1.2"
git tag v0.1.2
git push origin <branch> --tags
```

GitHub Actions (`.github/workflows/release.yml`) automatically:

1. Syncs version to `OlaresManifest.yaml` and `deployment.yaml` image tag
2. Builds `apepkuss/clawrun:0.1.2` + `:latest` (linux/arm64 + linux/amd64)
3. Pushes to Docker Hub
4. Packages `clawrun-0.1.2.tgz`
5. Creates GitHub Release with the tgz attached

### Deploy after CI release

Existing install:

```bash
kubectl set image deployment/clawrun -n clawrun-<username> \
  clawrun="apepkuss/clawrun:0.1.2"
```

Fresh install: download `clawrun-0.1.2.tgz` from GitHub Release, install via Olares Market.

## Local Dev Release (deploy.sh)

For fast iteration during development. Builds arm64 only (Apple Silicon).

```bash
cd clawrun
./deploy.sh
```

The script:

1. Reads version from `oac/Chart.yaml`
2. Syncs version to `OlaresManifest.yaml` and `deployment.yaml` image tag
3. Builds `apepkuss/clawrun:<version>` + `:latest` (linux/arm64)
4. Pushes to Docker Hub
5. Packages OAC tgz to `oac/clawrun-<version>.tgz`
6. Prints `kubectl set image` command with digest

## Bundled Charts

OpenClaw and OllamaRun charts are **not** released separately. They are:

- Packaged as tgz files in `clawrun/charts/` (baked into the Docker image at build time)
- Served by ClawRun's built-in chart server on port 3001
- Downloaded by Olares app-service during install

To update bundled charts:

```bash
# OpenClaw
helm package openclaw/ -d clawrun/charts/
# Update digest in clawrun/charts/static-index.yaml

# OllamaRun
helm package ollamarun/oac/ -d clawrun/charts/
# Update digest in clawrun/charts/static-index.yaml
```

Changes take effect on next ClawRun image build.

## Required Secrets (GitHub Actions)

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
