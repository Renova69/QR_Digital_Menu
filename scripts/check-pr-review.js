#!/usr/bin/env node

const { readFileSync } = require("node:fs");

const REQUIRED_REVIEW_ITEMS = [
  "I reviewed the full diff, including migrations and generated files.",
  "I added or updated tests for changed behavior, or explained why no test applies.",
  "I checked authentication, authorization, tenant isolation, and sensitive-data exposure where applicable.",
  "I confirmed this change does not wipe, reset, truncate, or silently overwrite existing data.",
  "I documented rollout, rollback, and manual verification needs where applicable.",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findMissingReviewItems(body) {
  const text = typeof body === "string" ? body : "";
  return REQUIRED_REVIEW_ITEMS.filter((item) => {
    const checkedItem = new RegExp(
      `^\\s*-\\s*\\[[xX]\\]\\s+${escapeRegExp(item)}\\s*$`,
      "mu",
    );
    return !checkedItem.test(text);
  });
}

function main() {
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    console.log("PR self-review gate skipped outside pull_request events.");
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const missing = findMissingReviewItems(event.pull_request?.body);

  if (missing.length === 0) {
    console.log("PR self-review checklist passed.");
    return;
  }

  console.error("BLOCKED: complete the self-review checklist in the PR body:");
  for (const item of missing) console.error(`- [ ] ${item}`);
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { REQUIRED_REVIEW_ITEMS, findMissingReviewItems };
