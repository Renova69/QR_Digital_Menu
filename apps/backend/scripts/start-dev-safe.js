#!/usr/bin/env node
// Wraps `nest start --watch` so a bare `npm run start:dev` (run directly in
// apps/backend, bypassing the root `npm run dev` wrapper) always has
// NODE_ENV set. Without this, validateRuntimeEnvironment() in main.ts
// throws "NODE_ENV must be explicitly set..." and nest --watch does not
// restart on a crashed child, so the backend never listens (see
// apps/backend/src/auth/auth-runtime-policy.ts and 2998691e). The root
// wrapper (scripts/dev-with-logs.js) already does this for `npm run dev`;
// this mirrors that default for direct/standalone invocation.
const { spawn } = require('node:child_process');

const child = spawn('npx', ['nest', 'start', '--watch'], {
  cwd: __dirname + '/..',
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
