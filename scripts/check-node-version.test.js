const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getNodeVersionError,
  parseNodeMajor,
} = require("./check-node-version");

test("parseNodeMajor accepts Node's version format", () => {
  assert.equal(parseNodeMajor("v24.18.0"), 24);
  assert.equal(parseNodeMajor("24.0.0"), 24);
});

test("parseNodeMajor rejects malformed versions", () => {
  assert.equal(parseNodeMajor("not-a-version"), null);
  assert.equal(parseNodeMajor(""), null);
});

test("Node 24 is supported", () => {
  assert.equal(getNodeVersionError("v24.18.0"), null);
});

test("other Node majors receive an actionable NVM error", () => {
  const error = getNodeVersionError("v25.7.0");

  assert.match(error, /requires Node\.js 24\.x/);
  assert.match(error, /nvm install 24\.18\.0/);
  assert.match(error, /nvm use 24\.18\.0/);
  assert.doesNotMatch(error, /&&/);
});
