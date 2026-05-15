#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deploy-backend.sh
#
# Deploys the backend Docker image to an AWS EC2 instance.
# Called by .github/workflows/deploy.yml (deploy-backend job).
#
# Required environment variables (set as GitHub Actions secrets):
#   EC2_HOST          — public IP or hostname of the EC2 instance
#   EC2_USER          — SSH user (e.g. ubuntu, ec2-user)
#   EC2_SSH_KEY       — private SSH key (PEM format, stored as secret)
#   GHCR_TOKEN        — GitHub token with read:packages scope
#   IMAGE_TAG         — full image tag to deploy (e.g. ghcr.io/org/repo/hulm-backend:sha-abc123)
#
# Usage (local):
#   EC2_HOST=1.2.3.4 EC2_USER=ubuntu IMAGE_TAG=... bash scripts/deploy-backend.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${EC2_HOST:?EC2_HOST is required}"
: "${EC2_USER:?EC2_USER is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

DEPLOY_DIR="/opt/hulm-backend"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

echo "▶ Deploying $IMAGE_TAG to $EC2_USER@$EC2_HOST"

# Write SSH key to a temp file
SSH_KEY_FILE=$(mktemp)
chmod 600 "$SSH_KEY_FILE"
echo "${EC2_SSH_KEY}" > "$SSH_KEY_FILE"

SSH_OPTS="-i $SSH_KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=30"

# ── Remote commands ──────────────────────────────────────────────────────────
ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash <<REMOTE
set -euo pipefail

# Ensure deploy directory exists
mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# Log in to GHCR
echo "\${GHCR_TOKEN}" | docker login ghcr.io -u github-actions --password-stdin

# Pull the new image
docker pull $IMAGE_TAG

# Update IMAGE_TAG in the environment for compose
export IMAGE_TAG=$IMAGE_TAG

# Rolling restart — only the backend service
docker compose -f $COMPOSE_FILE pull backend
docker compose -f $COMPOSE_FILE up -d --no-deps --remove-orphans backend

# Health check (retry 6 times, 5 s apart = 30 s window)
for i in \$(seq 1 6); do
  if curl -sf http://localhost:3001/health; then
    echo "✅ Health check passed"
    break
  fi
  echo "⏳ Waiting for backend to be healthy (\$i/6)..."
  sleep 5
  if [ \$i -eq 6 ]; then
    echo "❌ Health check failed — rolling back"
    docker compose -f $COMPOSE_FILE rollback backend 2>/dev/null || true
    docker compose -f $COMPOSE_FILE logs --tail=50 backend
    exit 1
  fi
done

# Prune dangling images
docker image prune -f
REMOTE

# Clean up temp key
rm -f "$SSH_KEY_FILE"

echo "✅ Deployment complete"
