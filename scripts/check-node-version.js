#!/usr/bin/env node

"use strict";

const REQUIRED_NODE_MAJOR = 24;
const RECOMMENDED_NODE_VERSION = "24.18.0";

function parseNodeMajor(version) {
  if (typeof version !== "string") {
    return null;
  }

  const match = /^v?(\d+)(?:\.|$)/.exec(version.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

function getNodeVersionError(version) {
  const major = parseNodeMajor(version);

  if (major === REQUIRED_NODE_MAJOR) {
    return null;
  }

  const displayVersion =
    typeof version === "string" && version.trim() ? version.trim() : "unknown";

  return [
    `[node-version] Unsupported Node.js ${displayVersion}.`,
    `This repository requires Node.js ${REQUIRED_NODE_MAJOR}.x; other majors can break the Nest/SWC development watcher.`,
    "With NVM for Windows, run these commands:",
    `  nvm install ${RECOMMENDED_NODE_VERSION}`,
    `  nvm use ${RECOMMENDED_NODE_VERSION}`,
  ].join("\n");
}

if (require.main === module) {
  const error = getNodeVersionError(process.version);

  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  getNodeVersionError,
  parseNodeMajor,
};
