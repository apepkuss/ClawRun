#!/usr/bin/env bash
set -euo pipefail

IMAGE="apepkuss/clawrun"
NAMESPACE="clawrun-apepkuss"
CHART_NAME="clawrun"

# ── 1. Read version from Chart.yaml (single source of truth) ──
VERSION=$(grep '^version:' oac/Chart.yaml | head -1 | awk '{print $2}' | tr -d "'\"")
if [ -z "$VERSION" ]; then
  echo "ERROR: Could not read version from oac/Chart.yaml"
  exit 1
fi
echo "==> Version: ${VERSION}"

# ── 2. Sync version across all manifests ──
sed -i '' "s|image: \"${IMAGE}:.*\"|image: \"${IMAGE}:${VERSION}\"|" oac/templates/deployment.yaml
sed -i '' "s/^  version: .*/  version: '${VERSION}'/" oac/OlaresManifest.yaml
sed -i '' "s/^  versionName: .*/  versionName: '${VERSION}'/" oac/OlaresManifest.yaml

# ── 3. Package bundled charts (OpenClaw + Ollama CPU) ──
echo "==> Packaging bundled charts ..."
helm package ../openclaw/ -d charts/
helm package ../ollama-cpu/oac/ -d charts/

# ── 4. Build and push Docker image ──
echo "==> Cleaning up old local images ..."
docker images "${IMAGE}" --format '{{.ID}} {{.Tag}}' | while read -r id tag; do
  if [ "$tag" != "$VERSION" ] && [ "$tag" != "latest" ]; then
    docker rmi "${IMAGE}:${tag}" 2>/dev/null || true
  fi
done
docker image prune -f 2>/dev/null || true

echo "==> Building ${IMAGE}:${VERSION} (linux/arm64) ..."
docker build --platform linux/arm64 -t "${IMAGE}:${VERSION}" -t "${IMAGE}:latest" .

echo "==> Pushing ${IMAGE}:${VERSION} and ${IMAGE}:latest ..."
docker push "${IMAGE}:${VERSION}"
docker push "${IMAGE}:latest"

DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "${IMAGE}:${VERSION}" 2>/dev/null | sed 's/.*@//')

# ── 5. Package OAC chart ──
echo "==> Packaging OAC chart ..."
TGZ="${CHART_NAME}-${VERSION}.tgz"
helm package oac/ -d /tmp/clawrun-oac >/dev/null
mv "/tmp/clawrun-oac/${TGZ}" "oac/${TGZ}"
rm -rf /tmp/clawrun-oac

echo ""
echo "════════════════════════════════════════════════════"
echo "  Version : ${VERSION}"
echo "  Image   : ${IMAGE}:${VERSION}"
echo "  Digest  : ${DIGEST}"
echo "  OAC     : oac/${TGZ}"
echo "════════════════════════════════════════════════════"
echo ""
echo "Deploy (existing install):"
echo "  kubectl set image deployment/clawrun -n ${NAMESPACE} clawrun=\"${IMAGE}@${DIGEST}\""
echo ""
echo "Fresh install (copy tgz to Olares, then):"
echo "  helm install ${CHART_NAME} oac/${TGZ} -n ${NAMESPACE}"
echo ""
