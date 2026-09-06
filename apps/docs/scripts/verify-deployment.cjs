const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../..");
const frontendVercelConfig = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "vercel.json"), "utf8"),
);
const docsVercelConfig = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "apps/docs/vercel.json"), "utf8"),
);
const docsHome = fs.readFileSync(
  path.join(repositoryRoot, "apps/docs/build/index.html"),
  "utf8",
);
const docsBuildDirectory = path.join(repositoryRoot, "apps/docs/build");

const findHtmlFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(entryPath);
    return entry.name.endsWith(".html") ? [entryPath] : [];
  });

assert(
  frontendVercelConfig.redirects?.some(
    ({ source, destination }) => source === "/docs" && destination === "/docs/",
  ),
  "The frontend must redirect /docs to the Docusaurus base URL /docs/.",
);

const docsRewriteIndex = frontendVercelConfig.rewrites.findIndex(
  ({ source, destination }) =>
    source === "/docs/(.*)" &&
    destination === "https://qr-digital-menu-docs.vercel.app/$1",
);
const spaFallbackIndex = frontendVercelConfig.rewrites.findIndex(
  ({ destination }) => destination === "/index.html",
);

assert(docsRewriteIndex >= 0, "The frontend docs proxy rewrite is missing.");
assert(
  docsRewriteIndex < spaFallbackIndex,
  "The docs proxy must run before the frontend SPA fallback.",
);
assert(
  docsHome.includes("href=/docs/assets/") &&
    docsHome.includes("href=/docs/getting-started"),
  "The generated documentation does not use the /docs base URL.",
);
assert(
  fs.existsSync(
    path.join(repositoryRoot, "apps/docs/build/getting-started.html"),
  ),
  "The docs origin is missing the proxied getting-started route.",
);
assert(
  docsVercelConfig.cleanUrls === true,
  "The docs origin must serve generated .html files through extensionless URLs.",
);

const contentSecurityPolicy = frontendVercelConfig.headers
  .flatMap(({ headers }) => headers)
  .find(({ key }) => key === "Content-Security-Policy")?.value;
const docsHeaders =
  docsVercelConfig.headers?.flatMap(({ headers }) => headers) ?? [];
const docsHeader = (name) =>
  docsHeaders.find(({ key }) => key.toLowerCase() === name.toLowerCase())
    ?.value;
const docsContentSecurityPolicy = docsHeader("Content-Security-Policy");
const executableInlineScripts = findHtmlFiles(docsBuildDirectory)
  .flatMap((htmlFile) => [
    ...fs
      .readFileSync(htmlFile, "utf8")
      .matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),
  ])
  // JSON-LD is structured metadata, not executable JavaScript, so script-src
  // does not apply to it. External scripts have an empty inline body.
  .filter(
    ([, attributes, script]) =>
      script && !/\btype=(?:"|')?application\/ld\+json/i.test(attributes),
  )
  .map(([, , script]) => script);
const inlineScriptHashes = [
  ...new Set(
    executableInlineScripts.map(
      (script) =>
        `sha256-${crypto.createHash("sha256").update(script).digest("base64")}`,
    ),
  ),
];

assert(
  contentSecurityPolicy,
  "The frontend Content-Security-Policy is missing.",
);
const missingInlineScriptHashes = inlineScriptHashes.filter(
  (hash) => !contentSecurityPolicy.includes(`'${hash}'`),
);
assert(
  missingInlineScriptHashes.length === 0,
  `The frontend CSP does not permit these Docusaurus inline scripts: ${missingInlineScriptHashes.join(
    ", ",
  )}.`,
);

assert(
  docsContentSecurityPolicy,
  "The directly reachable docs origin Content-Security-Policy is missing.",
);
assert(
  docsHeader("Content-Security-Policy-Report-Only") === undefined,
  "The docs CSP must be enforced, not report-only.",
);
for (const directive of [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
]) {
  assert(
    docsContentSecurityPolicy.includes(directive),
    `The docs CSP is missing the required directive: ${directive}.`,
  );
}
const missingDocsInlineScriptHashes = inlineScriptHashes.filter(
  (hash) => !docsContentSecurityPolicy.includes(`'${hash}'`),
);
assert(
  missingDocsInlineScriptHashes.length === 0,
  `The docs CSP does not permit these Docusaurus inline scripts: ${missingDocsInlineScriptHashes.join(
    ", ",
  )}.`,
);

console.log("Docs subpath, origin mapping, and CSP checks passed.");
