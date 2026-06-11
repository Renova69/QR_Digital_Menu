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

# Copy Prisma tooling and engine binaries from builder.
# .prisma/  — generated client; @prisma/ — engines+client packages (not in prod deps);
# prisma/   — CLI; .bin/prisma — CLI shim.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy Prisma schema/migrations for migrate deploy
COPY prisma ./prisma

RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 3000

# Run pending migrations before starting the server (Issue 48).
# Requires DATABASE_URL to be set via Secret Manager at runtime.
# Fail fast if the migration command blocks during DB cold start/network issues.
ENV PRISMA_MIGRATE_TIMEOUT_SECONDS=60
# NOTE: Before first use, baseline the prod DB:
#   npx prisma migrate resolve --applied 20260611000000_schema_safety_constraints
# Then verify clean: npx prisma migrate status
CMD ["sh", "-c", "timeout --foreground \"${PRISMA_MIGRATE_TIMEOUT_SECONDS:-60}s\" node_modules/.bin/prisma migrate deploy && node dist/src/main"]
