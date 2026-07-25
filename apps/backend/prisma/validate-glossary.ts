import type { TermRow } from './seed-glossary-terms';

// Pure structural validator — no I/O, no process.exit, no ROWS import at
// module scope (that would create a require cycle with seed-glossary-terms.ts,
// which imports validateRows from here as a pre-flight). Callers pass the
// rows to check; seed-glossary-terms.ts calls this with its own ROWS before
// writing anything.

const REQUIRED_LANGS = ['en', 'de', 'ru', 'ro', 'it', 'es', 'fr'] as const;

/** Returns a list of human-readable error strings; empty array = valid. */
export function validateRows(rows: TermRow[]): string[] {
  const errors: string[] = [];
  const seenBg = new Set<string>();

  for (const term of rows) {
    const bg = term.bg;

    if (seenBg.has(bg.toLowerCase())) {
      errors.push(`Duplicate Bulgarian term found: "${bg}"`);
    }
    seenBg.add(bg.toLowerCase());

    if (bg !== bg.trim()) {
      errors.push(`Bulgarian term has leading/trailing spaces: "${bg}"`);
    }
    if (bg !== bg.toLowerCase()) {
      errors.push(
        `Bulgarian term is not lowercase (glossary lookups normalize to lowercase): "${bg}"`,
      );
    }

    for (const lang of REQUIRED_LANGS) {
      const translation = term.t[lang];
      if (!translation) {
        errors.push(`Term "${bg}" is missing language: ${lang}`);
      } else if (translation !== translation.trim()) {
        errors.push(
          `Term "${bg}" translation for ${lang} has leading/trailing spaces: "${translation}"`,
        );
      }
    }
  }

  return errors;
}

// Standalone CLI usage: `npx ts-node prisma/validate-glossary.ts` — imports
// ROWS lazily (inside main, not at module scope) so this file has zero
// runtime dependency on seed-glossary-terms.ts unless actually run directly.
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ROWS } = require('./seed-glossary-terms') as {
    ROWS: TermRow[];
  };
  const errors = validateRows(ROWS);
  console.log(`Checked ${ROWS.length} terms.`);
  if (errors.length > 0) {
    console.log(`\n--- ${errors.length} ERROR(S) FOUND ---`);
    errors.forEach((e) => console.log(e));
    process.exitCode = 1;
  } else {
    console.log('No structural errors found.');
  }
}
