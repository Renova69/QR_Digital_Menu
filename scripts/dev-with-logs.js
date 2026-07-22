#!/usr/bin/env node
// Wraps `turbo dev` so every dev session writes its own timestamped log file
// instead of overwriting a single shared one. Console output is unaffected —
// this only adds a tee to disk.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const logsDir = path.join(root, "logs", "dev");
fs.mkdirSync(logsDir, { recursive: true });

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

const logFile = path.join(logsDir, `dev-${timestamp()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: "a" });

// Strip ANSI escape codes before writing to disk so the log stays grep-able;
// the terminal still gets the original colored chunk.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

logStream.write(
  `=== dev session started ${new Date().toISOString()} ===\n` +
    `cwd: ${root}\n` +
    `command: turbo dev\n\n`,
);

console.log(`[dev-logs] writing to ${path.relative(root, logFile)}`);

const child = spawn("npx", ["turbo", "dev"], {
  cwd: root,
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
  env: { ...process.env, FORCE_COLOR: "1" },
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk.toString().replace(ANSI_RE, ""));
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk.toString().replace(ANSI_RE, ""));
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  logStream.write(
    `\n=== dev session ended ${new Date().toISOString()} (code=${code}, signal=${signal}) ===\n`,
  );
  logStream.end(() => {
    process.exit(code === null ? 1 : code);
  });
});
