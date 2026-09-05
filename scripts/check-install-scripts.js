#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const DEFAULT_LOCKFILES = [
  "package-lock.json",
  "apps/backend/package-lock.json",
  "apps/frontend/package-lock.json",
];

function collectInstallScriptPackages(lockfile) {
  if (!lockfile || typeof lockfile !== "object" || !lockfile.packages) {
    throw new Error("Lockfile does not contain a packages map");
  }

  const packages = new Set();
  for (const [packagePath, entry] of Object.entries(lockfile.packages)) {
    if (!packagePath || !entry?.hasInstallScript) continue;

    const marker = "node_modules/";
    const markerIndex = packagePath.lastIndexOf(marker);
    // Root/workspace lifecycle scripts are tracked source. This gate covers
    // dependency code fetched from the registry.
    if (markerIndex < 0) continue;

    const name = packagePath.slice(markerIndex + marker.length);
    const version = entry.version;
    if (!name || typeof version !== "string" || !version) {
      throw new Error(
        `Install-script dependency has no stable name/version: ${packagePath}`,
      );
    }
    packages.add(`${name}@${version}`);
  }

  return [...packages].sort();
}

function findUnreviewedInstallScripts(actual, reviewed) {
  const reviewedSet = new Set(reviewed);
  return [...new Set(actual)]
    .filter((packageId) => !reviewedSet.has(packageId))
    .sort();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const allowlistPath = resolve(
    process.argv[2] || "security/npm-install-scripts-allowlist.json",
  );
  const lockfilePaths = (
    process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_LOCKFILES
  ).map((lockfilePath) => resolve(lockfilePath));
  const allowlist = readJson(allowlistPath);
  const reviewed = allowlist.packages;
  if (
    !Array.isArray(reviewed) ||
    reviewed.some((entry) => typeof entry !== "string" || !entry)
  ) {
    throw new Error("Install-script allowlist must contain package IDs");
  }

  const actual = new Set();
  for (const lockfilePath of lockfilePaths) {
    for (const packageId of collectInstallScriptPackages(
      readJson(lockfilePath),
    )) {
      actual.add(packageId);
    }
  }

  const unreviewed = findUnreviewedInstallScripts([...actual], reviewed);
  if (unreviewed.length > 0) {
    console.error("BLOCKED: unreviewed dependency install script:");
    for (const packageId of unreviewed) console.error(`- ${packageId}`);
    console.error(
      "Review the package lifecycle script and provenance before updating the allowlist.",
    );
    process.exitCode = 1;
    return;
  }

  const stale = reviewed.filter((packageId) => !actual.has(packageId));
  if (stale.length > 0) {
    console.warn(
      `Install-script allowlist entries no longer present: ${stale.join(", ")}`,
    );
  }
  console.log(
    `Install-script audit passed: ${actual.size} exact package version(s) reviewed.`,
  );
}

if (require.main === module) main();

module.exports = {
  collectInstallScriptPackages,
  findUnreviewedInstallScripts,
};
