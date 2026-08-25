const assert = require("node:assert/strict");
const test = require("node:test");

const { backupMissingPolicy, backupPolicy } = require("./setup-alerts");

test("explicit backup failures remain observable", () => {
  const policy = backupPolicy();
  const filter = policy.conditions[0].conditionMatchedLog.filter;

  assert.match(filter, /cloud_run_job/);
  assert.match(filter, /db-backup/);
  assert.match(filter, /severity>=ERROR/);
});

test("a missed twice-daily execution alerts after 15 hours", () => {
  const policy = backupMissingPolicy();
  const condition = policy.conditions[0].conditionAbsent;

  assert.equal(condition.duration, "54000s");
  assert.equal(condition.aggregations[0].perSeriesAligner, "ALIGN_SUM");
  assert.match(condition.filter, /completed_execution_count/);
  assert.match(condition.filter, /result="succeeded"/);
  assert.match(condition.filter, /job_name="db-backup"/);
});
