#!/usr/bin/env bash
set -euo pipefail

IMAGE="apepkuss/clawrun"
VERSION=$(awk -F'"' '/"version"/{print $4; exit}' package.json)
TAG="${IMAGE}:${VERSION}"

echo "==> Building ${TAG} (linux/arm64) ..."
docker build --platform linux/arm64 -t "${TAG}" .

echo "==> Pushing ${TAG} ..."
docker push "${TAG}"

# Get the pushed digest (registry-authoritative)
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "${TAG}")
echo "==> Done: ${DIGEST}"
echo ""
echo "Next step: run the following command on the Olares machine to deploy:"
echo ""
echo "  kubectl set image deployment/clawrun -n clawrun-apepkuss clawrun=\"${DIGEST}\""
echo ""
