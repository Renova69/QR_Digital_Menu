# ─── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: Production ───────────────────────────────────────────────────
FROM node:24-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Production deps only (excludes devDependencies, reduces image size)
RUN npm ci --omit=dev

# Copy generated Prisma client from builder (created by prisma generate in npm run build).
# prisma and @prisma/client are prod deps so npm ci --omit=dev installs them;
# only the generated .prisma/ directory needs copying from builder.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy Prisma schema/migrations for migrate deploy
COPY prisma ./prisma

RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 3000

# Migrations deliberately do NOT run here. They used to (Issue 48), chained as
# `prisma migrate deploy && node dist/main`, which meant every container start
# raced every other one: maxScale is 3, so three instances could apply the same
# migration at once. Prisma's own guard against that is a session-scoped
# advisory lock, which cannot work through PgBouncer transaction pooling, so it
# had been switched off with PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 — leaving no
# protection at all. Re-enabling the lock would only have traded the race for a
# new failure: a second instance blocking on the lock past the 60s timeout got
# killed, and the `&&` then stopped it from ever serving.
#
# deploy.ps1 now runs `prisma migrate deploy` exactly once per deploy, over the
# unpooled DIRECT_URL where the advisory lock genuinely works, and aborts the
# deploy if it fails. One run per deploy instead of one per instance removes
# the contention rather than arbitrating it.
#
# Trade-off worth knowing: a container started outside deploy.ps1 no longer
# self-heals its schema. Every migration must remain compatible with the
# revision currently serving production. Contract migrations require a
# separately deployed readiness revision first. A fresh environment must be
# migrated explicitly before its first boot.
CMD ["node", "dist/main"]
