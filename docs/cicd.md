# CI/CD & Deployment Guide

## Assumptions

| Item | Value |
|---|---|
| Node.js version | 22 LTS |
| Test runner | Vitest (not Jest — the project uses Vitest) |
| Frontend | Next.js 16 (monorepo — no separate Express backend yet) |
| Frontend deploy | Vercel (via CLI in GitHub Actions) |
| Backend deploy | AWS EC2 via Docker + SSH (placeholder — activate when `/backend` is added) |
| Container registry | GitHub Container Registry (ghcr.io) |
| Monitoring | New Relic APM (server) + Sentry (server + browser) |

---

## Repository Structure Added

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml          # Runs on every PR and push to main/develop
│       ├── deploy.yml      # Runs on push to main — deploys to production
│       └── preview.yml     # Runs on PRs — deploys Vercel preview + comments URL
├── backend/
│   ├── Dockerfile          # Express backend image (activate when /backend is added)
│   └── .env.example        # Backend env var reference
├── docs/
│   └── cicd.md             # This file
├── scripts/
│   └── deploy-backend.sh   # EC2 deploy script (called by deploy.yml)
├── .dockerignore
├── .env.example            # Frontend env var reference
├── docker-compose.yml      # Local dev stack (postgres + redis + frontend)
├── Dockerfile              # Next.js multi-stage production image
├── instrumentation.ts      # Next.js 16 instrumentation entry point
├── instrumentation-node.ts # New Relic + Sentry server-side init
├── next.config.ts          # Added output: 'standalone' for Docker
└── sentry.client.config.ts # Sentry browser-side init
```

---

## Required GitHub Actions Secrets

Set these in **Settings → Secrets and variables → Actions** on your GitHub repository.

### Always required (CI + Deploy)

| Secret | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `DATABASE_URL` | Prisma session pooler connection string |
| `DIRECT_URL` | Prisma direct connection string (for migrations) |
| `JWT_SECRET` | JWT signing secret (≥ 32 chars) |

### Vercel deployment

| Secret | Description | How to get |
|---|---|---|
| `VERCEL_TOKEN` | Personal access token | vercel.com → Settings → Tokens |
| `VERCEL_ORG_ID` | Team/org ID | `vercel env pull` or project settings |
| `VERCEL_PROJECT_ID` | Project ID | `vercel env pull` or project settings |

### Monitoring (optional but recommended)

| Secret | Description |
|---|---|
| `SENTRY_DSN` | Sentry server-side DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client-side DSN (same project) |
| `NEW_RELIC_LICENSE_KEY` | New Relic ingest license key |
| `NEW_RELIC_APP_NAME` | App name in New Relic (default: `hulm-ecommerce`) |

### EC2 backend (activate when `/backend` is added)

| Secret | Description |
|---|---|
| `EC2_HOST` | Public IP or hostname of EC2 instance |
| `EC2_USER` | SSH user (e.g. `ubuntu`) |
| `EC2_SSH_KEY` | Private SSH key (PEM, full content) |
| `EC2_PORT` | SSH port (default: `22`) |

---

## CI Pipeline

### Triggers

- **`ci.yml`** — every push to `main`/`develop` and every PR targeting those branches
- **`preview.yml`** — every PR open/update (deploys Vercel preview)
- **`deploy.yml`** — every push to `main` (deploys to production)

### Jobs

```
ci.yml
└── frontend
    ├── Checkout + setup Node 22
    ├── Restore .next/cache (GitHub Actions cache)
    ├── npm ci
    ├── npm run lint
    ├── npm run test          ← vitest --run
    ├── Upload coverage artifact
    └── npm run build
```

### Running CI locally

Use [act](https://github.com/nektos/act) to run GitHub Actions locally:

```bash
# Install act (macOS)
brew install act

# Run the CI workflow
act push -W .github/workflows/ci.yml \
  --secret-file .env.local \
  -P ubuntu-latest=catthehacker/ubuntu:act-22.04
```

Or run the individual steps directly:

```bash
npm ci
npm run lint
npm run test
npm run build
```

---

## Deployment

### Frontend → Vercel

**First-time setup:**

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Link the project (run once, follow prompts)
vercel link

# 3. Note the org and project IDs from .vercel/project.json
cat .vercel/project.json
# → { "orgId": "...", "projectId": "..." }

# 4. Add VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID to GitHub secrets
```

**How it works:**

- Every PR → `preview.yml` deploys a preview URL and comments it on the PR
- Every push to `main` → `deploy.yml` deploys to production

**Vercel environment variables:**

Set these in the Vercel dashboard (Project → Settings → Environment Variables) for production:
- All `NEXT_PUBLIC_*` vars
- `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `SENTRY_DSN`, `NEW_RELIC_LICENSE_KEY`

### Backend → AWS EC2

> **Status:** Placeholder — activate when `/backend` directory is added.

**EC2 prerequisites:**

```bash
# On the EC2 instance (run once)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu

# Create deploy directory
sudo mkdir -p /opt/hulm-backend
sudo chown ubuntu:ubuntu /opt/hulm-backend

# Copy docker-compose.prod.yml to /opt/hulm-backend/
# (create this file with your production compose config)
```

**Activating the backend deploy:**

1. Add your Express backend code under `/backend/`
2. In `.github/workflows/deploy.yml`, remove the `if: false` lines from `build-backend-image` and `deploy-backend` jobs
3. Add EC2 secrets to GitHub Actions
4. Push to `main`

**Manual deploy:**

```bash
EC2_HOST=1.2.3.4 \
EC2_USER=ubuntu \
EC2_SSH_KEY="$(cat ~/.ssh/your-key.pem)" \
IMAGE_TAG=ghcr.io/your-org/hulm-ecommerce/hulm-backend:sha-abc123 \
bash scripts/deploy-backend.sh
```

---

## Docker Local Dev Stack

Before starting the compose stack, create a local env file and point Prisma at the Postgres container through the host-published port:

```bash
cp .env.example .env.local

# Then edit .env.local for local Docker usage:
# DATABASE_URL=postgresql://hulm:hulm_dev_password@localhost:5432/hulm_dev
# DIRECT_URL=postgresql://hulm:hulm_dev_password@localhost:5432/hulm_dev
```

```bash
# Start all services (postgres, redis, frontend dev server)
docker compose up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Destroy volumes (wipe DB data)
docker compose down -v
```

Services:

| Service | Port | Notes |
|---|---|---|
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 with password |
| `frontend` | 3000 | Next.js dev server with hot reload |

The frontend container mounts your source directory, so edits are reflected immediately.

**First run — run Prisma migrations from the host shell:**

```bash
npx prisma migrate dev
```

---

## Monitoring Setup

### New Relic

1. Install the agent: `npm install newrelic`
2. Set `NEW_RELIC_LICENSE_KEY` and `NEW_RELIC_APP_NAME` in your environment
3. The `instrumentation.ts` file initialises the agent at server startup

### Sentry

1. Install: `npm install @sentry/nextjs`
2. Set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser) in your environment
3. Server init: `instrumentation-node.ts` (via `instrumentation.ts`)
4. Browser init: `sentry.client.config.ts` (auto-loaded by `@sentry/nextjs`)

---

## Rollback Strategy

### Frontend (Vercel)

Vercel keeps all previous deployments. To roll back:

```bash
# Option 1: Vercel dashboard → Deployments → click any previous deploy → Promote to Production

# Option 2: CLI
vercel rollback [deployment-url]
```

### Backend (EC2)

The deploy script pulls a specific image tag (SHA-pinned). To roll back:

```bash
# SSH into EC2
ssh ubuntu@$EC2_HOST

cd /opt/hulm-backend

# Set the previous image tag
export IMAGE_TAG=ghcr.io/your-org/hulm-ecommerce/hulm-backend:sha-<previous-sha>

# Restart with the old image
docker compose -f docker-compose.prod.yml up -d --no-deps backend
```

All image tags are preserved in GHCR. The `latest` tag always points to the most recent `main` build.

### Git-level rollback

```bash
# Revert the last commit and push (triggers CI + deploy)
git revert HEAD --no-edit
git push origin main
```

---

## Environment Variable Management

| File | Purpose | Committed? |
|---|---|---|
| `.env.example` | Frontend reference (no real values) | ✅ Yes |
| `backend/.env.example` | Backend reference (no real values) | ✅ Yes |
| `.env.local` | Local dev overrides | ❌ No (gitignored) |
| `.env` | Shared non-secret defaults | ⚠️ Only if no secrets |

**Precedence (Next.js):** `process.env` → `.env.{NODE_ENV}.local` → `.env.local` → `.env.{NODE_ENV}` → `.env`

**In GitHub Actions:** All secrets are set via repository/environment secrets and injected as `env:` in workflow steps. Never hardcode secrets in workflow files.

**In Vercel:** Set via the Vercel dashboard or `vercel env add`. Vercel automatically injects them at build and runtime.
