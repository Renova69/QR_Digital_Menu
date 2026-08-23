#!/usr/bin/env node
//
// Installs `.git/hooks/pre-commit` as a thin delegate to the tracked
// `scripts/hooks/pre-commit`.
//
// Deliberately not a `core.hooksPath` switch: this repo's plugin tooling
// already writes post-checkout and post-commit into `.git/hooks/`, and
// repointing hooksPath silently disables them.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DELEGATE = `#!/bin/sh
# Installed by scripts/install-git-hooks.js -- edit scripts/hooks/pre-commit.
. "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"
`;

function gitDir() {
  return execFileSync("git", ["rev-parse", "--git-dir"], {
    encoding: "utf8",
  }).trim();
}

function install() {
  const hookPath = path.join(gitDir(), "hooks", "pre-commit");

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf8");
    if (existing.includes("scripts/hooks/pre-commit")) {
      console.log("[hooks] pre-commit already delegates to the tracked hook.");
      return 0;
    }
    // Someone else's hook is there. Refuse rather than clobber it -- an
    // overwritten hook is a silently disabled check.
    console.error(
      `[hooks] ${hookPath} already exists and is not ours. Merge it by hand:\n` +
        `        add  . "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"`,
    );
    return 1;
  }

  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, DELEGATE, { mode: 0o755 });
  console.log(`[hooks] Installed ${hookPath}`);
  return 0;
}

if (require.main === module) process.exit(install());
module.exports = { install, DELEGATE };
