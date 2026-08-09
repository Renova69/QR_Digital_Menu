const { spawn } = require("node:child_process");
const path = require("node:path");

const docsRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(docsRoot, "../..");
const docusaurusCli = path.join(
  repositoryRoot,
  "node_modules",
  "@docusaurus",
  "core",
  "bin",
  "docusaurus.mjs",
);

const localeServers = [
  { locale: "en", port: 3002 },
  { locale: "bg", port: 3003 },
  { locale: "ro", port: 3004 },
];

let shuttingDown = false;
let exitCode = 0;
let runningChildren = localeServers.length;

const children = localeServers.map(({ locale, port }) => {
  const child = spawn(
    process.execPath,
    [
      docusaurusCli,
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--locale",
      locale,
      "--no-open",
    ],
    {
      cwd: docsRoot,
      env: {
        ...process.env,
        // Docusaurus' update notifier reads the user's global config store.
        // That store may be unavailable in sandboxed/dev environments and can
        // delay every locale process for minutes before the server starts.
        NO_UPDATE_NOTIFIER: "1",
        DOCUSAURUS_GENERATED_FILES_DIR_NAME: path.join(
          ".docusaurus",
          locale,
        ),
      },
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error(`[docs:${locale}] failed to start:`, error);
    exitCode = 1;
    stopChildren();
  });

  child.on("close", (code, signal) => {
    runningChildren -= 1;

    if (!shuttingDown) {
      console.error(
        `[docs:${locale}] exited unexpectedly (code=${code}, signal=${signal})`,
      );
      exitCode = code || 1;
      stopChildren();
    }

    if (runningChildren === 0) process.exit(exitCode);
  });

  return child;
});

function stopChildren(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));
