#!/usr/bin/env node
//
// Blocks a commit that stages a live credential.
//
// This runs alongside gitleaks rather than instead of it: gitleaks is the
// broad, maintained ruleset and is what CI enforces, but it is not installed
// by default on a fresh clone and a pre-commit gate nobody has the binary for
// is theatre. These patterns are deliberately narrow and tuned to the secrets
// THIS repo actually handles -- Neon, Stripe, DeepL, R2, Twilio, VAPID, JWT --
// so they cost nothing to run and catch the realistic mistake: pasting a real
// value into a config, a script, or a test fixture.
//
// Only *added* lines in the staged diff are scanned. Rewriting history for
// secrets already in the log is a separate, deliberate operation; failing every
// commit over a value that was rotated months ago would just get this
// uninstalled.

const { execFileSync } = require("child_process");

// A finding is a real credential, not a placeholder. Anything matching these is
// documentation, a test fixture, or a CI stand-in.
const PLACEHOLDER = [
  // No \b anchor: the common shape is `sk_live_xxxxxxxx`, and `_` is a word
  // character so a boundary never appears before the run. Four or more is
  // specific enough that a real random credential effectively never trips it.
  /x{4,}/i,
  /\byour[-_]/i,
  /\bexample\b/i,
  /\bplaceholder\b/i,
  /\bchangeme\b/i,
  /\bdummy\b/i,
  /\bnot[-_]for[-_]production\b/i,
  /\btest[-_]secret\b/i,
  /\bfake\b/i,
  /\bsample\b/i,
  /<[^>]+>/, // <REDACTED>, <your-key>
  /\.{3,}/, // sk_live_...
  /\bREPLACE\b/i,
];

// Files whose whole purpose is to contain credential-shaped strings. Kept to
// exact paths, never globs: the scanner's own fixtures and the gitleaks config
// (which quotes the CI stand-in Postgres URL as an allowlist regex). Anything
// broader would be a place to hide a real secret.
const SELF_EXEMPT_PATHS = new Set([
  "scripts/scan-staged-secrets.js",
  "scripts/scan-staged-secrets.test.js",
  ".gitleaks.toml",
  ".gitleaksignore",
]);

const RULES = [
  {
    id: "postgres-url-with-password",
    // Neon and any other Postgres URL carrying inline credentials. The leak
    // that actually happened to this repo.
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/"']+:[^\s:@/"']+@[^\s/"']+/g,
    description: "Postgres connection string with an inline password",
  },
  {
    id: "stripe-secret-key",
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g,
    description: "Stripe secret or restricted key",
  },
  {
    id: "stripe-webhook-secret",
    pattern: /\bwhsec_[A-Za-z0-9]{20,}/g,
    description: "Stripe webhook signing secret",
  },
  {
    id: "deepl-api-key",
    pattern:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:fx\b/g,
    description: "DeepL API key",
  },
  {
    id: "aws-r2-access-key-id",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    description: "AWS-format access key id (R2 uses the same shape)",
  },
  {
    id: "twilio-account-sid",
    pattern: /\bAC[0-9a-f]{32}\b/g,
    description: "Twilio account SID",
  },
  {
    id: "google-oauth-client-secret",
    pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g,
    description: "Google OAuth client secret",
  },
  {
    id: "private-key-block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    description: "Private key block",
    // The match is only the header, so the placeholder check would never see
    // the body -- and a fixture whose body is a stub such as "MIIE..." is
    // obviously not a key precisely because of what follows the header.
    // Judge the whole line instead of the matched fragment.
    placeholderScope: "line",
  },
  {
    id: "assigned-secret-literal",
    // A secret-ish name assigned a long literal. The catch-all for the
    // "just paste it in for a second" mistake.
    pattern:
      /\b(?:[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?TOKEN|PRIVATE_?KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*["'`]([^"'`\s]{16,})["'`]/g,
    description: "Secret-named variable assigned a long literal",
    // Only the captured value decides whether this is a placeholder -- the
    // variable name itself often contains the word "example".
    valueGroup: 1,
  },
];

function isPlaceholder(text) {
  return PLACEHOLDER.some((pattern) => pattern.test(text));
}

/**
 * Parse a unified diff into `{ file, line, text }` for added lines only.
 * Hunk headers give the new-file line numbers, so a finding points at a real
 * location the author can open.
 */
function parseAddedLines(diff) {
  const added = [];
  let file = null;
  let lineNumber = 0;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim();
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
      lineNumber = match ? Number(match[1]) : 0;
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      if (file) added.push({ file, line: lineNumber, text: raw.slice(1) });
      lineNumber++;
      continue;
    }
    if (!raw.startsWith("-") && !raw.startsWith("\\")) lineNumber++;
  }

  return added;
}

function scanAddedLines(addedLines) {
  const findings = [];

  for (const { file, line, text } of addedLines) {
    if (SELF_EXEMPT_PATHS.has(file)) continue;
    for (const rule of RULES) {
      // Rules carry the /g flag, so reset between lines or lastIndex leaks
      // across iterations and silently skips matches.
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(text)) !== null) {
        const value = rule.valueGroup ? match[rule.valueGroup] : match[0];
        const subject = rule.placeholderScope === "line" ? text : value;
        if (isPlaceholder(subject)) continue;
        findings.push({
          file,
          line,
          rule: rule.id,
          description: rule.description,
          // Never echo the credential itself: hook output lands in terminal
          // scrollback, CI logs, and screenshots.
          preview: `${value.slice(0, 4)}...${value.slice(-2)}`,
        });
      }
    }
  }

  return findings;
}

function readStagedDiff() {
  return execFileSync(
    "git",
    ["diff", "--cached", "--unified=0", "--no-color", "--diff-filter=ACMR"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

function formatFindings(findings) {
  const lines = [
    "",
    "  BLOCKED: staged changes look like they contain a live credential.",
    "",
  ];
  for (const finding of findings) {
    lines.push(
      `    ${finding.file}:${finding.line}  [${finding.rule}] ${finding.description} (${finding.preview})`,
    );
  }
  lines.push(
    "",
    "  If this is a real secret: remove it, put it in .env or Secret Manager,",
    "  and rotate it -- staging it means it is already on disk in the index.",
    "",
    "  If it is a false positive, make the placeholder obvious (example/xxx/",
    "  <your-key>) or commit with SKIP_SECRET_SCAN=1 and say why in the message.",
    "",
  );
  return lines.join("\n");
}

function main() {
  if (process.env.SKIP_SECRET_SCAN === "1") {
    console.warn("[secret-scan] Skipped via SKIP_SECRET_SCAN=1.");
    return 0;
  }

  let diff;
  try {
    diff = readStagedDiff();
  } catch (error) {
    // Never block a commit because the scanner itself broke.
    console.warn(
      `[secret-scan] Could not read the staged diff, skipping: ${error.message}`,
    );
    return 0;
  }

  const findings = scanAddedLines(parseAddedLines(diff));
  if (findings.length === 0) return 0;

  console.error(formatFindings(findings));
  return 1;
}

module.exports = {
  parseAddedLines,
  scanAddedLines,
  isPlaceholder,
  RULES,
  SELF_EXEMPT_PATHS,
};

if (require.main === module) process.exit(main());
