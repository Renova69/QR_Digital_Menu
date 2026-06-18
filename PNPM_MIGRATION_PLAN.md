# pnpm Migration Plan

> Status: PROPOSED — not started. Written 2026-06-13.
> Migrate the Turborepo monorepo from **npm workspaces** to **pnpm workspaces**.

## 0. Why / when

pnpm gains: faster installs, content-addressable store (less disk), strict `node_modules`
(kills phantom deps), first-class Turborepo support, `workspace:*` protocol.

Cost: strict install surfaces hidden missing deps (must fix), and **three** deploy/runtime
surfaces change. Do this as a dedicated task, NOT during firefighting. Test every deploy on a
Vercel preview + a throwaway Cloud Run revision before touching prod traffic.

## 1. Current state (snapshot)

| Surface | Detail |
|---|---|
| Root | `packageManager: npm@10.2.4`, `workspaces: ["apps/*"]`, root `overrides` (react pins), stray root `dependencies.helmet` |
| Apps | `backend` (NestJS), `frontend` (Vite), `printer-agent` (**Expo React Native**) |
| Lockfiles | root `package-lock.json` **and** a separate tracked `apps/backend/package-lock.json` (used by standalone Docker build) |
| backend Docker | `deploy.ps1` → `gcloud builds submit … apps/backend` (context = **apps/backend only**), Dockerfile `COPY package*.json` + `npm ci` / `npm ci --omit=dev`, node:24-slim, two-stage, Prisma generate in build |
| frontend deploy | `vercel.json`: `installCommand: npm install`, `buildCommand: npx turbo build --filter=frontend`, output `apps/frontend/dist` |
| CI | `.github/workflows/ci.yml`: `setup-node cache: npm` + `npm ci` |
| Node | no `engines` pinned; Docker uses node 24, CI uses node 20 |

## 2. Go/no-go risk gates (read before starting)

1. **backend standalone Docker build** — biggest change. pnpm has one root `pnpm-lock.yaml`;
   the per-package `apps/backend/package-lock.json` goes away. The Cloud Build context must move
   to **repo root** (so lockfile + workspace manifest are present), with `.gcloudignore` trimming
   frontend/printer-agent. See §6.
2. **Expo printer-agent** — Metro/React Native breaks under pnpm's symlinked store. Requires
   `node-linker=hoisted` (or `shamefully-hoist`) in `.npmrc`. If printer-agent is not actively
   built right now, you can still migrate web apps safely as long as the `.npmrc` is in place.
3. **Phantom deps** — strict install will throw `Cannot find module X` for anything imported but
   not declared. Backend (NestJS transitive deps) is the likely offender. Budget time to add
   missing `dependencies`.

If any gate is unacceptable this week, defer.

## 3. Prerequisites

```bash
# Pin pnpm via corepack (ships with Node). Use a fixed version everywhere.
corepack enable
corepack prepare pnpm@9.15.9 --activate   # pnpm 10.x also fine; pin ONE version
pnpm --version
```

Add an `engines` + `packageManager` pin to root `package.json`:

```jsonc
{
  "packageManager": "pnpm@9.15.9",
  "engines": { "node": ">=20 <25", "pnpm": ">=9" }
}
```

## 4. Phase 1 — workspace config (local)

1. Create `pnpm-workspace.yaml` at repo root:

```yaml
packages:
  - "apps/*"
```

2. Create root `.npmrc`:

```ini
# Required for Expo/React Native (Metro) to resolve modules.
node-linker=hoisted
# Surface peer issues but don't hard-fail the whole install on them.
strict-peer-dependencies=false
# Keep installs reproducible in CI/Docker.
# (use --frozen-lockfile in CI; locally pnpm auto-updates the lockfile)
```

> `node-linker=hoisted` gives a flat npm-like layout. It sacrifices some of pnpm's strictness but
> is the pragmatic choice with Expo in the tree. If printer-agent is ever removed, drop this for
> full isolated mode and fix the phantom deps it exposes.

3. Migrate `overrides` → `pnpm.overrides` (pnpm ignores npm's `overrides`, and only honors them at
   the **root**). Merge root + frontend overrides into root `package.json`:

```jsonc
{
  "pnpm": {
    "overrides": {
      "react": "18.3.1",
      "react-dom": "18.3.1",
      "@types/react": "18.3.12",
      "@types/react-dom": "18.3.1",
      "@svgr/webpack": "^8.0.1",
      "@adobe/css-tools": "^4.3.1",
      "postcss": "^8.4.31"
    }
  }
}
```
Then delete the `overrides` block from both root and `apps/frontend/package.json`.

4. Remove the stray root `dependencies.helmet` (backend already declares it; root shouldn't carry
   app runtime deps).

5. Delete npm lockfiles and install:

```bash
rm package-lock.json apps/backend/package-lock.json
rm -rf node_modules apps/*/node_modules
pnpm install
```

6. Commit `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`. Add npm lockfiles to `.gitignore`
   (optional) to prevent reintroduction.

## 5. Phase 2 — fix strict-install fallout

Run each app's build/test and fix `Cannot find module` by adding the real dep to that app's
`package.json` (never rely on hoisting):

```bash
pnpm --filter backend run build      # prisma generate + nest build
pnpm --filter backend run test
pnpm --filter frontend run build
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend run test
```

Script call sites that use `npm run` internally still work, but prefer pnpm equivalents.
Backend script `dev: "npm run start:dev"` and `seed: "npm run build && …"` — change inner
`npm run` to `pnpm run` for consistency (npm would still resolve, but mixing is a smell).

## 6. Phase 3 — backend Docker / Cloud Run (the hard part)

The build context must become the **repo root** so `pnpm-lock.yaml` + `pnpm-workspace.yaml` exist.

1. Update `deploy.ps1`: change `$SRC = "apps/backend"` → `$SRC = "."` (send repo root).
2. Add a root `.gcloudignore` to keep the context small:

```
node_modules
**/node_modules
**/dist
apps/frontend
apps/printer-agent
.git
.claude
.worktrees
graphify-out
*.md
```

3. Replace `apps/backend/Dockerfile` with a workspace-aware, two-stage build that produces a
   self-contained runtime via `pnpm deploy` (backend has no internal workspace deps, so this is
   clean):

```dockerfile
# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:24-slim AS builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Manifests + lockfile first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --filter backend... --frozen-lockfile

# Source + build
COPY apps/backend apps/backend
RUN pnpm --filter backend run build          # prisma generate + nest build

# Produce a self-contained prod bundle (node_modules + dist)
RUN pnpm --filter backend deploy --prod /app

# ─── Stage 2: Runtime ────────────────────────────────────────────
FROM node:24-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /repo/apps/backend/prisma ./prisma
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 3000
ENV PRISMA_MIGRATE_TIMEOUT_SECONDS=60
CMD ["sh","-c","timeout --foreground \"${PRISMA_MIGRATE_TIMEOUT_SECONDS:-60}s\" node_modules/.bin/prisma migrate deploy && node dist/src/main"]
```

> Note: `pnpm deploy` requires pnpm 9+ and works because backend has no `workspace:*` deps. The
> `.prisma` generated client lands inside the deployed `node_modules` automatically (generate ran
> before deploy). Verify `node_modules/.prisma/client` exists in the runner.

4. Test on a **throwaway** revision with no traffic:

```powershell
$GCLOUD builds submit --project=qr-menu-app-469216 --tag=gcr.io/qr-menu-app-469216/qr-menu-backend:pnpm-test .
$GCLOUD run deploy qr-menu-backend-canary --image=…:pnpm-test --region=europe-west1 --no-traffic
```
Hit `/api/v1/health` + a DB-backed endpoint on the canary URL before promoting.

## 7. Phase 4 — Vercel (frontend)

Update `vercel.json`:

```jsonc
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm turbo build --filter=frontend",
  "outputDirectory": "apps/frontend/dist",
  "framework": "vite",
  "rewrites": [ /* unchanged */ ]
}
```

Vercel auto-detects pnpm from `pnpm-lock.yaml` and respects `packageManager`. Push to a branch →
verify the **preview** deployment builds and serves before merging.

## 8. Phase 5 — CI

`.github/workflows/ci.yml`:

```yaml
      - uses: pnpm/action-setup@v4          # reads packageManager from package.json
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      # then: pnpm --filter backend exec prisma generate
      #       pnpm --filter backend exec jest --reporters=default --ci
      #       pnpm --filter frontend exec tsc --noEmit
      #       pnpm --filter frontend exec vitest run
      #       pnpm turbo run build
```

## 9. Verification matrix (all must pass before prod promote)

- [ ] `pnpm install` clean from scratch (no peer hard-fails)
- [ ] `pnpm --filter backend build` + `test` green
- [ ] `pnpm --filter frontend build` + `tsc --noEmit` + `vitest` green
- [ ] `pnpm turbo build` green (cache works)
- [ ] printer-agent: `pnpm --filter printer-agent exec expo start` resolves modules (Metro boots)
- [ ] Docker image builds from repo-root context; canary Cloud Run revision serves `/api/v1/health` + DB endpoint
- [ ] Vercel preview build + SPA + `/api/v1` rewrite work
- [ ] CI workflow green on the migration PR

## 10. Rollback

- The migration is a single PR. Revert it → npm lockfiles return, Docker/Vercel/CI restored.
- Keep prod Cloud Run on the current revision until the canary is verified; promote traffic only
  after §9 passes. Vercel: keep prior production deployment; promote the preview manually.
- Do NOT delete the npm lockfiles from history; revert restores them.

## 11. Effort estimate

~1–2 focused days. Risk-weighted: backend Docker (§6) and Expo (§2) are the time sinks; web build
+ CI are quick. Single PR, single reviewer, staged deploy verification.
