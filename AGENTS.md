## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## 🛑 CRITICAL: Never `prisma migrate reset` on remote DB

This project connects to a remote Neon PostgreSQL database. **`prisma migrate reset` DROPS the entire database.** All data permanently lost (users, restaurants, menu items, orders, reservations, loyalty, payments). This happened once — do not repeat.

### Safe migration workflow

```bash
npx prisma migrate dev --create-only --name your_migration   # create file only
npx prisma migrate deploy                                     # apply safely
```

### If drift detected

- Do NOT reset. Use `npx prisma migrate diff` or `npx prisma db pull` and reconcile manually.

### Blocked commands

- `prisma migrate reset` — blocked by `.claude/settings.json` hook + `scripts/prisma-migrate-guard.js`
- `prisma migrate dev --force` — same block
