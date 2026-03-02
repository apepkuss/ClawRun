#!/usr/bin/env bash
set -euo pipefail

IMAGE="apepkuss/clawrun"
NAMESPACE="clawrun-apepkuss"

# Remove old local images (dangling + previous builds of this repo)
echo "==> Cleaning up old local images for ${IMAGE} ..."
docker images "${IMAGE}" --format '{{.ID}} {{.Tag}}' | while read -r id tag; do
  if [ "$tag" != "latest" ]; then
    echo "    Removing ${IMAGE}:${tag} (${id})"
    docker rmi "${IMAGE}:${tag}" 2>/dev/null || true
  fi
done
# Also remove dangling (untagged) images left over from multi-stage builds
docker image prune -f 2>/dev/null || true

echo "==> Building ${IMAGE}:latest (linux/arm64) ..."
docker build --platform linux/arm64 -t "${IMAGE}:latest" .

echo "==> Pushing ${IMAGE}:latest ..."
docker push "${IMAGE}:latest"

echo "==> Done."
echo ""
echo "Next step: run the following command on the Olares machine to deploy:"
echo ""
echo "  kubectl rollout restart deployment/clawrun -n ${NAMESPACE}"
echo ""
