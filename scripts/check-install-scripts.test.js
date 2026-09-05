const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectInstallScriptPackages,
  findUnreviewedInstallScripts,
} = require("./check-install-scripts");
const rootPackage = require("../package.json");

function lockfile(packages) {
  return { lockfileVersion: 3, packages };
}

test("collects dependency lifecycle scripts but ignores the tracked workspace root", () => {
  const result = collectInstallScriptPackages(
    lockfile({
      "": { name: "workspace", hasInstallScript: true },
      "node_modules/safe-package": {
        version: "1.2.3",
        hasInstallScript: true,
      },
      "node_modules/no-script": { version: "4.5.6" },
      "apps/example/node_modules/@scope/native": {
        version: "7.8.9",
        hasInstallScript: true,
      },
    }),
  );

  assert.deepEqual(result, ["@scope/native@7.8.9", "safe-package@1.2.3"]);
});

test("blocks a newly introduced dependency install script", () => {
  assert.deepEqual(
    findUnreviewedInstallScripts(
      ["reviewed@1.0.0", "unexpected@2.0.0"],
      ["reviewed@1.0.0"],
    ),
    ["unexpected@2.0.0"],
  );
});

test("requires review again when an install-script package version changes", () => {
  assert.deepEqual(
    findUnreviewedInstallScripts(
      ["native-addon@2.0.0"],
      ["native-addon@1.0.0"],
    ),
    ["native-addon@2.0.0"],
  );
});

test("accepts only exact reviewed package versions", () => {
  assert.deepEqual(
    findUnreviewedInstallScripts(
      ["b@2.0.0", "a@1.0.0"],
      ["a@1.0.0", "b@2.0.0"],
    ),
    [],
  );
});

test("explicitly disables transitive Scarf install analytics", () => {
  assert.equal(rootPackage.scarfSettings?.enabled, false);
});
