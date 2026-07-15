const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const graphifyOutDir = path.join(repoRoot, "graphify-out");
const reportPath = path.join(graphifyOutDir, "GRAPH_REPORT.md");
const vaultRoot =
  "C:\\Users\\Elysian Canvas\\Documents\\Obsidian Vaults\\QR Digital Menu Graph";
const communitiesDir = path.join(vaultRoot, "Communities");
const dataDir = path.join(vaultRoot, "Data");

const BACK_LINK =
  "\n\n---\n[[QR Digital Menu - Graphify Index|<- Back to Index]]\n";

function splitTopSections(raw) {
  const parts = raw.split(/\n## /);
  const title = parts.shift().trim();
  const sections = {};
  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    const header = part.slice(0, newlineIdx).trim();
    const body = part.slice(newlineIdx + 1);
    sections[header] = body;
  }
  return { title, sections };
}

function findSection(sections, prefix) {
  const key = Object.keys(sections).find((h) => h.startsWith(prefix));
  if (!key)
    throw new Error(
      `Missing GRAPH_REPORT.md section starting with "${prefix}"`,
    );
  return { header: key, body: sections[key] };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeNote(filePath, content) {
  fs.writeFileSync(filePath, content.trimEnd() + "\n", "utf8");
}

function syncDataJunction() {
  if (fs.existsSync(dataDir)) {
    const stat = fs.lstatSync(dataDir);
    if (stat.isSymbolicLink()) return;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.symlinkSync(graphifyOutDir, dataDir, "junction");
}

function main() {
  const raw = fs.readFileSync(reportPath, "utf8");
  const { sections } = splitTopSections(raw);

  const corpus = findSection(sections, "Corpus Check");
  const summary = findSection(sections, "Summary");
  const freshness = findSection(sections, "Graph Freshness");
  const godNodes = findSection(sections, "God Nodes");
  const surprising = findSection(sections, "Surprising Connections");
  const hyperedges = findSection(sections, "Hyperedges");
  const communities = findSection(sections, "Communities (");

  const commitMatch = freshness.body.match(/Built from commit: `([0-9a-f]+)`/);
  const commitHash = commitMatch ? commitMatch[1] : "unknown";

  ensureDir(vaultRoot);
  ensureDir(communitiesDir);
  syncDataJunction();

  writeNote(
    path.join(vaultRoot, "Corpus and Summary.md"),
    `## ${corpus.header}\n${corpus.body}\n## ${summary.header}\n${summary.body}\n## ${freshness.header}\n${freshness.body}` +
      BACK_LINK,
  );
  writeNote(
    path.join(vaultRoot, "God Nodes.md"),
    `## ${godNodes.header}\n${godNodes.body}` + BACK_LINK,
  );
  writeNote(
    path.join(vaultRoot, "Surprising Connections.md"),
    `## ${surprising.header}\n${surprising.body}` + BACK_LINK,
  );
  writeNote(
    path.join(vaultRoot, "Hyperedges.md"),
    `## ${hyperedges.header}\n${hyperedges.body}` + BACK_LINK,
  );

  const communityBlocks = communities.body
    .split(/\n### /)
    .filter((b) => b.trim().length > 0);
  const indexLines = [];
  const seenFiles = new Set();

  for (const block of communityBlocks) {
    const newlineIdx = block.indexOf("\n");
    const header = block.slice(0, newlineIdx).trim();
    const body = block.slice(newlineIdx + 1);

    const nameMatch = header.match(/^(Community \d+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const cohesionMatch = body.match(/Cohesion:\s*([\d.]+)/);
    const nodesMatch = body.match(/Nodes \((\d+)\):\s*(.*)/);
    const cohesion = cohesionMatch ? cohesionMatch[1] : "0";
    const nodeCount = nodesMatch ? nodesMatch[1] : "0";
    const nodeList = nodesMatch ? nodesMatch[2].trim() : "";

    const fileName = `_COMMUNITY_${name}.md`;
    seenFiles.add(fileName);
    writeNote(
      path.join(communitiesDir, fileName),
      `# ${name}\n\n- **Cohesion:** ${cohesion}\n- **Node count:** ${nodeCount}\n\n## Nodes\n${nodeList}` +
        BACK_LINK,
    );
    indexLines.push(
      `- [[_COMMUNITY_${name}|${name}]] — ${nodeCount} nodes, cohesion ${cohesion}`,
    );
  }

  for (const existing of fs.readdirSync(communitiesDir)) {
    if (!seenFiles.has(existing))
      fs.rmSync(path.join(communitiesDir, existing));
  }

  writeNote(
    path.join(vaultRoot, "Communities Index.md"),
    `# Communities Index (${indexLines.length} shown)\n\n${indexLines.join("\n")}\n`,
  );

  writeNote(
    path.join(vaultRoot, "QR Digital Menu - Graphify Index.md"),
    `# QR Digital Menu - Graphify Index

Knowledge graph export from [[graphify]] for the QR_Digital_Menu-main repo, built from commit \`${commitHash}\`.

## Sections
- [[Corpus and Summary]]
- [[God Nodes]] — most connected core abstractions
- [[Surprising Connections]] — non-obvious relationships
- [[Hyperedges]] — group relationships
- [[Communities Index]] — all ${indexLines.length} communities

## Raw data
See the \`Data/\` folder for the original graphify-out exports: graph.json, manifest.json, communities.json, stats.json, cost.json, and index.html (interactive visualization).
`,
  );

  console.log(
    `graphify-to-vault: synced ${indexLines.length} communities, commit ${commitHash}`,
  );
}

main();
