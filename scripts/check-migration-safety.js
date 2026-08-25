#!/usr/bin/env node

const { readdirSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const RULES = [
  { rule: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/giu },
  { rule: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/giu },
  { rule: "TRUNCATE", pattern: /\bTRUNCATE(?:\s+TABLE)?\b/giu },
  { rule: "DELETE FROM", pattern: /\bDELETE\s+FROM\b/giu },
  {
    rule: "DROP COLUMN",
    pattern: /\bALTER\s+TABLE\b[^;]*?\bDROP\s+COLUMN\b/giu,
  },
  { rule: "DROP TYPE", pattern: /\bDROP\s+TYPE\b/giu },
];

/**
 * Replace SQL comments with spaces while preserving newlines and offsets. That
 * keeps finding line numbers exact and avoids flagging safety explanations such
 * as "never DROP SCHEMA" as executable SQL.
 */
function stripComments(sql) {
  let result = "";
  let state = "normal";

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
        result += char;
      } else {
        result += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "normal";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single-quote") {
      result += char;
      if (char === "'" && next === "'") {
        result += next;
        index += 1;
      } else if (char === "'") {
        state = "normal";
      }
      continue;
    }

    if (char === "-" && next === "-") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else {
      result += char;
      if (char === "'") state = "single-quote";
    }
  }

  return result;
}

function findUnsafeStatements(sql) {
  const executableSql = stripComments(sql);
  const findings = [];

  for (const { rule, pattern } of RULES) {
    pattern.lastIndex = 0;
    for (const match of executableSql.matchAll(pattern)) {
      const index = match.index ?? 0;
      findings.push({
        rule,
        line: executableSql.slice(0, index).split("\n").length,
        preview: match[0].replace(/\s+/gu, " ").trim().slice(0, 120),
      });
    }
  }

  return findings.sort(
    (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
  );
}

function scanMigrationDirectory(directory) {
  const findings = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(directory, entry.name, "migration.sql");
    let sql;
    try {
      sql = readFileSync(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const finding of findUnsafeStatements(sql)) {
      findings.push({ ...finding, file });
    }
  }
  return findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

function main() {
  const directory = resolve(
    process.argv[2] || "apps/backend/prisma/migrations",
  );
  const findings = scanMigrationDirectory(directory);
  if (findings.length === 0) {
    console.log(`Migration safety gate passed: ${directory}`);
    return;
  }

  console.error("BLOCKED: data-destructive SQL found in Prisma migrations.");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.rule}] ${finding.preview}`,
    );
  }
  console.error(
    "Use a forward-only expand/backfill/contract migration. Destructive " +
      "migration SQL is not permitted in this repository.",
  );
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  findUnsafeStatements,
  scanMigrationDirectory,
  stripComments,
};
