const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const backendSrc = path.join(repoRoot, 'apps', 'backend', 'src');

const QUERY_RAW_CALL =
  /\$queryRaw(?:Unsafe)?\s*(?:<[^`(]*>)?\s*(?:`[\s\S]*?`|\([\s\S]*?\))/g;
const VOID_POSTGRES_FUNCTIONS = [
  'pg_advisory_xact_lock',
  'pg_advisory_lock',
  'pg_advisory_unlock',
  'pg_advisory_unlock_all',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile()) return [];
    if (!entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.spec.ts')) return [];
    return [fullPath];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const violations = [];

for (const filePath of walk(backendSrc)) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(QUERY_RAW_CALL)) {
    const sql = match[0].toLowerCase();
    const fn = VOID_POSTGRES_FUNCTIONS.find((name) =>
      new RegExp(`\\b${name}\\b`, 'i').test(sql),
    );
    if (!fn) continue;

    violations.push({
      filePath,
      line: lineNumber(source, match.index ?? 0),
      fn,
    });
  }
}

if (violations.length > 0) {
  console.error(
    'Prisma raw-query guard failed: void-returning PostgreSQL functions must use $executeRaw, not $queryRaw.',
  );
  for (const violation of violations) {
    const rel = path.relative(repoRoot, violation.filePath);
    console.error(`- ${rel}:${violation.line} uses $queryRaw with ${violation.fn}`);
  }
  process.exit(1);
}

console.log('Prisma raw-query guard passed.');
