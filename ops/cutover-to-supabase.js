#!/usr/bin/env node
//
// Point production at Supabase.
//
// Reads SUPABASE_DATABASE_URL / SUPABASE_DIRECT_URL from apps/backend/.env and
// adds them as new versions of the DATABASE_URL / DIRECT_URL secrets. The
// previous versions stay enabled, so rolling back is a `gcloud secrets
// versions` disable away -- nothing is destroyed here.
//
// Running instances are NOT affected: Cloud Run resolves `:latest` when an
// instance starts, so the switch only takes effect on the next deploy.
//
// Usage:  node ops/cutover-to-supabase.js [--dry-run]

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT = "qr-menu-app-469216";
const ENV_FILE = path.join(__dirname, "..", "apps", "backend", ".env");
const GCLOUD = "C:/google-cloud-sdk/bin/gcloud.cmd";
const DRY_RUN = process.argv.includes("--dry-run");

// secret name in Secret Manager -> key in .env holding the new value
const MAPPING = {
  DATABASE_URL: "SUPABASE_DATABASE_URL",
  DIRECT_URL: "SUPABASE_DIRECT_URL",
};

function readEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

function describe(value) {
  // Never print the credential itself.
  const url = new URL(value);
  return `${url.hostname}:${url.port}${url.pathname} user=${url.username} pw=${
    url.password ? "set" : "MISSING"
  }${url.search || ""}`;
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`Not found: ${ENV_FILE}`);
    return 1;
  }
  const env = readEnv(ENV_FILE);

  for (const [secret, sourceKey] of Object.entries(MAPPING)) {
    const value = env[sourceKey];
    if (!value) {
      console.error(`${sourceKey} is not set in apps/backend/.env — aborting.`);
      return 1;
    }
    let shape;
    try {
      shape = describe(value);
    } catch (error) {
      console.error(`${sourceKey} is not a valid URL: ${error.message}`);
      return 1;
    }

    console.log(`${secret}  <-  ${sourceKey}`);
    console.log(`   ${shape}`);

    if (DRY_RUN) {
      console.log("   (dry run — nothing written)\n");
      continue;
    }

    // Via a file, not an argument: anything on the command line is visible to
    // other local processes and lands in shell history.
    //
    // The file holds a live database password, so it is created inside a
    // freshly-made 0o700 directory and opened O_EXCL with mode 0o600 — never
    // straight into a shared temp dir at default permissions, where any local
    // user could read it in the window before it is unlinked. (Windows leans on
    // per-user ACLs on %TEMP% rather than mode bits, but this script should not
    // depend on which OS it runs under.)
    //
    // No trailing newline — Secret Manager stores bytes verbatim, and a stray
    // \n silently becomes part of the connection string.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cutover-"), {
      mode: 0o700,
    });
    const tmp = path.join(dir, `${secret}.txt`);
    const fd = fs.openSync(
      tmp,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    try {
      fs.writeFileSync(fd, value, { encoding: "utf8" });
      fs.closeSync(fd);

      // shell: true is required — gcloud ships as a .cmd batch file on Windows
      // and Node cannot exec that directly; without it spawnSync fails with
      // ENOENT and an empty stderr, which looks like gcloud rejecting the
      // request rather than never having run.
      //
      // shell: true means the OS re-parses the command line, so the temp path
      // must be quoted: the default temp directory sits under the user's
      // profile, which routinely contains a space.
      const result = spawnSync(
        `"${GCLOUD}"`,
        [
          "secrets",
          "versions",
          "add",
          secret,
          `--data-file="${tmp}"`,
          `--project=${PROJECT}`,
        ],
        { encoding: "utf8", shell: true },
      );
      if (result.error || result.status !== 0) {
        // Report every channel. An exec failure surfaces on result.error with
        // nothing on stderr, and gcloud sometimes writes diagnostics to stdout.
        const detail =
          [
            result.error && `spawn: ${result.error.message}`,
            String(result.stderr || "").trim(),
            String(result.stdout || "").trim(),
          ]
            .filter(Boolean)
            .join(" | ") || `exit code ${result.status}`;
        console.error(`   FAILED: ${detail}`);
        return 1;
      }
      const line = String(result.stderr || "")
        .trim()
        .split("\n")
        .pop();
      console.log(`   ${line}\n`);
    } finally {
      // rmSync removes the file and the directory together, so nothing is left
      // behind even if the write above threw before closeSync.
      try {
        fs.closeSync(fd);
      } catch {
        // already closed on the success path
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("Secrets updated. Nothing is live yet — deploy to switch over.");
  return 0;
}

process.exit(main());
