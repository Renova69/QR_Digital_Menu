const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const artifactPath = path.join(
  __dirname,
  "..",
  "apps",
  "docs",
  "static",
  "api",
  "openapi.json",
);

function loadArtifact() {
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

test("published OpenAPI contract includes the full API surface", () => {
  const document = loadArtifact();

  assert.ok(Object.keys(document.paths ?? {}).length >= 200);
  assert.ok(Object.keys(document.components?.schemas ?? {}).length >= 80);
});

test("representative DTO schemas retain generated properties", () => {
  const schemas = loadArtifact().components.schemas;

  assert.ok(schemas.CreateOrderDto.properties.items);
  assert.ok(schemas.UpdateRestaurantDto.properties.name);
  assert.ok(schemas.UpdateRestaurantDto.properties.pinLoginStartTime);
  assert.ok(schemas.RecordViewDto.properties.visitorId);
  assert.ok(schemas.RecordConsentDto.properties.policyVersion);
});

test("DTO schemas are not published as empty objects", () => {
  const schemas = loadArtifact().components.schemas;
  const emptySchemas = Object.entries(schemas)
    .filter(
      ([name, schema]) =>
        name !== "Object" && Object.keys(schema.properties ?? {}).length === 0,
    )
    .map(([name]) => name);

  assert.deepEqual(emptySchemas, []);
});
