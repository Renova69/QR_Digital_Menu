// Regenerates the backend's Prisma client on `npm install` at the repo
// root, for local-dev convenience (clone -> npm install -> ready to go).
//
// Skipped entirely on Vercel: the frontend project's `npm install` runs at
// repo root too (see vercel.json), but Vercel only ever deploys
// apps/frontend -- it has no use for the backend's Prisma client, and its
// build environment doesn't include apps/backend in a way this can rely on.
// Vercel always sets the VERCEL env var in its build containers, so that's
// the reliable signal to skip on, rather than guessing about file layout.
const { spawnSync } = require("child_process");

if (process.env.VERCEL) {
  console.log(
    "[postinstall] Skipping prisma generate on Vercel (frontend-only build).",
  );
  process.exit(0);
}

// Bare `prisma`, not `npx prisma`: npm lifecycle scripts already put
// node_modules/.bin on PATH, so this resolves the project's pinned local
// version. `npx` falls back to fetching the latest registry version when it
// can't resolve a local bin, which silently pulled in an incompatible
// Prisma 7 (this schema uses Prisma 6 syntax) during testing.
const result = spawnSync(
  "prisma",
  ["generate", "--schema", "apps/backend/prisma/schema.prisma"],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
