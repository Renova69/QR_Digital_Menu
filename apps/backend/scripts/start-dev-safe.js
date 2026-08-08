#!/usr/bin/env node
// Wraps `nest start --watch` so a bare `npm run start:dev` (run directly in
// apps/backend, bypassing the root `npm run dev` wrapper) always has
// NODE_ENV set. Without this, validateRuntimeEnvironment() in main.ts
// throws "NODE_ENV must be explicitly set..." and nest --watch does not
// restart on a crashed child, so the backend never listens (see
// apps/backend/src/auth/auth-runtime-policy.ts and 2998691e). The root
// wrapper (scripts/dev-with-logs.js) already does this for `npm run dev`;
// this mirrors that default for direct/standalone invocation.
//
// Uses nest-cli.dev.json rather than nest-cli.json so watch mode keeps
// `deleteOutDir: false`: wiping and rewriting all 422 dist files on every
// start is expensive on a spinning disk, and the rewrite churns the chokidar
// watcher that nest uses to decide when to respawn the app. `nest build`
// still reads nest-cli.json, so release builds stay clean + type-checked.
// If a renamed or deleted source leaves a stale dist file behind, run
// `npm run clean`.
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const backendRoot = join(__dirname, '..');
const devConfig = 'nest-cli.dev.json';

// The Nest CLI silently falls back to its built-in defaults (builder: tsc)
// when -c points at a missing file, which would swap SWC for a much slower
// compiler without saying so. Fail loudly instead.
if (!existsSync(join(backendRoot, devConfig))) {
  console.error(
    `[start:dev] Missing ${devConfig} in ${backendRoot} — refusing to start ` +
      `because the Nest CLI would silently fall back to the tsc builder.`,
  );
  process.exit(1);
}

const child = spawn('npx', ['nest', 'start', '--watch', '-c', devConfig], {
  cwd: backendRoot,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
  },
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(code === null ? (signal ? 1 : 0) : code);
});
