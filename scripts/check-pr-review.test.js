const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REQUIRED_REVIEW_ITEMS,
  findMissingReviewItems,
} = require("./check-pr-review");

function checklist(mark = "x") {
  return REQUIRED_REVIEW_ITEMS.map((item) => `- [${mark}] ${item}`).join("\n");
}

test("accepts the complete checked self-review list", () => {
  assert.deepEqual(findMissingReviewItems(checklist()), []);
  assert.deepEqual(findMissingReviewItems(checklist("X")), []);
});

test("rejects unchecked and omitted review items", () => {
  const body = checklist().replace("- [x] I checked", "- [ ] I checked");
  const missing = findMissingReviewItems(body);

  assert.deepEqual(missing, [REQUIRED_REVIEW_ITEMS[2]]);
  assert.deepEqual(findMissingReviewItems(null), REQUIRED_REVIEW_ITEMS);
});

test("does not accept copied prose without a checked box", () => {
  assert.deepEqual(
    findMissingReviewItems(REQUIRED_REVIEW_ITEMS.join("\n")),
    REQUIRED_REVIEW_ITEMS,
  );
});
