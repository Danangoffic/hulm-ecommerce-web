# ─────────────────────────────────────────────────────────────────────────────
# Backend — Express / Node.js
# Multi-stage build for a lean production image.
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: production runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodeapp

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nodeapp:nodejs . .

USER nodeapp

EXPOSE 3001
ENV PORT=3001

# New Relic must be the first require — pass via NODE_OPTIONS
# ENV NODE_OPTIONS="-r newrelic"

CMD ["node", "src/index.js"]
