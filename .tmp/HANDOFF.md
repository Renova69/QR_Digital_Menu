# Session handoff — 2026-08-10 (revision 4)

Paste-and-go context for a fresh Claude Code session started from `C:\dev\QR_Digital_Menu-main`.

Revision 4 is the "it shipped" revision. Revisions 1–3 tracked the translation-pipeline work while it
was still uncommitted; that work is now **merged, migrated, deployed and verified against production
data**. Everything below is measured, with file:line or query evidence.

---

## 0. TL;DR — state right now

- `main` @ `252a1d66e986`. **PR #28 and PR #29 both merged. CI green on main.**
- Production backend: **`qr-menu-backend-00175-zul`** (image `sha-252a1d66e986`), health 200.
- Production DB: both migrations applied; `prisma migrate status` reports no pending.
- Pro Dining repaired: **158/158 English item names**, 0 Cyrillic descriptions, 0 stuck runs.
- **Dev and prod deliberately share one database** (owner's decision — see §4).
- Nothing outstanding that blocks anything. Open items are small and listed in §6.

---

## 1. What shipped

### PR #28 — `fix: scope translation runs to explicit unit membership`

Three invariants now hold the pipeline together. Breaking any one reintroduces a bug already paid for:

1. **Explicit run membership.** `MenuTranslationState.runId` (nullable FK → `TranslationRun`,
   `ON DELETE SET NULL`). Only units queued by a Translate All carry it; auto-enqueue from an
   ordinary menu save leaves it NULL, so an edit during a run cannot move that run's frozen
   denominator. `getRestaurantProgress` scopes its `groupBy` to that membership.
2. **One active run per restaurant, enforced by the database.** Partial unique index
   `translation_run_one_active_per_restaurant_idx ON translation_run(restaurantId) WHERE status IN ('QUEUED','RUNNING')`.
   `enqueueTranslateAll` catches the resulting `P2002` and returns the winning run.
   **Prisma cannot express a filtered index**, so `prisma migrate dev` will emit a `DROP INDEX` for
   it — `schema.prisma` carries a block comment saying so. Do not let that DROP through.
3. **Status transitions are hash-driven, not status-driven.** `ON CONFLICT` resolves
   `sourceHash changed → STALE`, `sourceLang changed → STALE`, `ELSE CURRENT`.

Also in #28: `menuSourceLanguage` split from `dashboardLanguage`; `getRestaurantProgress` made
read-only (the run write moved into the worker's `emitProgress`, off the REST polling path);
`upsertAll` sequential (8 PgBouncer connections instead of 16); identity check extended to
`el`/`ja`/`zh`/`ar`; `needsReview` surfaced as data so the dashboard stops claiming success while its
own badge shows failures.

### PR #29 — mixed-script identity + recovered deploy guard

The identity rule required the source to contain **no Latin**, which exempted every mixed brand name.
Now any Cyrillic in an identity match is enough for a non-Cyrillic target. Pure-Latin names are
unaffected (no Cyrillic to match); Cyrillic targets still keep Cyrillic; an untranslatable value is
bounded — the worker parks it in `NEEDS_REVIEW`, which `claimBatch` never claims.

#29 also cherry-picked the `deploy.ps1` guard, which **missed #28's merge by six minutes**
(guard pushed 06:37:42Z, #28 merged 06:31:18Z) and was stranded on the merged branch.

---

## 2. Production migration — how it was done

Rehearsed on a throwaway Neon branch forked from production, then applied to `main`. Counts before
and after were identical on everything that is not translation:

|                            | before                                 | after         |
| -------------------------- | -------------------------------------- | ------------- |
| orders / order_items       | 2652 / 5397                            | 2652 / 5397   |
| payments / users / loyalty | 79 / 23 / 130                          | 79 / 23 / 130 |
| menu items / categories    | 1026 / 166                             | 1026 / 166    |
| active translation runs    | 71 (all `doneUnits=0`, back to Jul 25) | 0             |
| guard index                | absent                                 | present       |

Two corrections to earlier revisions, both found by querying rather than assuming:

- **Pro Dining's `dashboardLanguage` was already `bg`**, not `en`. The rev-1 theory about how the EN
  values got poisoned was wrong in its specifics.
- **All 7645 state rows were `CURRENT`.** The 71 "RUNNING" runs were phantoms with no attached work —
  that is why every restaurant was stuck on _"Translation is already running"_. They were cancelled
  (73 run rows preserved, none deleted).

Also set **The Azure Orchid** to `menuSourceLanguage='en'` — it is genuinely English-authored
(34 items, targets bg/ro), so the migration's blanket `'bg'` default mislabelled it.

The rehearsal branch auto-deleted on its TTL. Only `production` and the two July archives remain.

---

## 3. CI was broken on `main`, independently of this work

`main`'s last three runs had all died at the same step, which hid five further failures behind it.
Each was diagnosed to root cause:

1. **`DIRECT_URL` unset in CI.** `c750d3ab` wired it for prod (Secret Manager) and dev
   (`.env.example`); the workflow had **zero** occurrences. Every check behind the migration step had
   been dead for 3+ commits.
2. **Lint error on `main`** (`let prisma: any`) plus a warning ratchet. Rather than raise the ceiling
   by 25, `--fix` cleared 24 warnings in this branch's own files, so the ratchet moved by 1
   (1133 → 1134).
3. **PIN-entropy test** — ~40 bcrypt hashes, fine at 5s until coverage instrumentation.
4. **Payment concurrency e2e** — the first attempt (raising the transaction timeout) was a symptom
   fix and CI proved it by failing again at 15002 ms. The real error was one line lower:
   _connection pool limit 3_. Prisma sizes the pool at `num_cpus*2+1`, so CI gets 3 while a dev
   machine gets 17+, and the observer polling `pg_stat_activity` starved. **Reproduced locally by
   pinning `connection_limit=3`** (4/4 failed), fixed by sizing the pool, symptom fix reverted.
5. **`Modal.tsx` vs `modal.tsx`** — case-insensitive on Windows, ENOENT on Linux. All 14 paths that
   suite reads were checked; one mismatch.
6. **Registration smoke test** — clicked a submit button that `LoginDialog` keeps disabled until the
   terms checkbox is ticked. App correct, test skipped a required consent step.

None of 3–6 touched production code.

---

## 4. Environment topology — READ THIS FIRST

**Dev and production share one database. This is deliberate**, decided by the owner on 2026-08-10:
_"its design like this dev and prod use the same db as i still test, lets not complicate it with 2 db."_
Do not "fix" it by introducing a second database unless asked.

- `apps/backend/.env` → **Neon production**. `DATABASE_URL` is the pooled endpoint
  (`-pooler` host, `pgbouncer=true`); `DIRECT_URL` is the unpooled one (same endpoint, no `-pooler`).
  The two differ only by `-pooler`; swapping them breaks migrations.
- The local Docker Postgres (`qr_digital_menu-main-db-1`, port 5433, added by commit `6dd92914`) is
  **no longer used**. It can be deleted along with the `qr_menu_test` database.
- Consequence of deleting it: the two local concurrency e2e specs require a localhost database whose
  name ends in `_test` (`assertIsolatedTestDatabase`), so they **auto-skip** locally —
  `describeWithDatabase` becomes `describe.skip`. No failures. CI still runs them against its own
  Postgres.

### What protects a shared-database setup (verified, not assumed)

- `npm run seed` hits two independent blocks: `seed.ts:23` refuses a non-localhost URL, and
  `seed.ts:42` refuses when >5 users exist. Bypass needs `ALLOW_REMOTE_SEED=true` **and**
  `FORCE_SEED_WIPE=true`.
- `npm run migrate:dev` / `migrate:reset` go through `scripts/prisma-migrate-guard.js`, which refuses
  anything non-localhost unless `ALLOW_REMOTE_RESET=true`.
- `deploy.ps1` refuses to deploy when `DIRECT_URL` resolves to localhost.

### The one unguarded hole

**`npx prisma db push` has no wrapper and will silently reshape production.** `CLAUDE.md` still
recommends it "when migration history is drifted" — in this topology, don't. Drift was zero when
checked (53 applied matched 1:1). Use `migrate:deploy` only.

Note the deploy guard currently only rejects _localhost_. If a second Neon branch is ever introduced,
tighten it to pin the production endpoint (`ep-shiny-flower-al0icrn9`), or it will happily migrate the
wrong branch.

---

## 5. Verification of the actual repair

Run at 11:07 queued **exactly 5 units, 5 done, 0 failed** — the new validator flagged precisely the
mixed-script names and nothing else. Four were repaired:

| source            | now                                |
| ----------------- | ---------------------------------- |
| Мерло Yamantievs  | Merlot Yamantievs                  |
| Розе Pinot Noir   | Rosé Pinot Noir                    |
| Сира Yamantievs   | Syrah Yamantievs                   |
| Студен Чай Lipton | Lipton Iced Tea                    |
| Джин Beefeater    | _unchanged — by design, see below_ |

`Джин Beefeater` is **configuration, not a defect**. `glossary_term` holds
`sourceText='джин beefeater'`, `kind='DO_NOT_TRANSLATE'`, and
`deepl-glossary.service.ts:115` uploads that kind to DeepL as an **identity pair**
(`row.kind === 'DO_NOT_TRANSLATE' ? row.sourceText : row.translatedText`). DeepL was explicitly told
to leave it alone and obeyed. That row's `translatedText` already contained `"Beefeater Gin"`, unused
because of the kind.

**Resolved 2026-08-10:** all seven rows for that term (`de/en/es/fr/it/ro/ru`) were flipped to
`kind='TERM'`, so their existing translations are now used. Changing the glossary changes its
content hash, so `ensureGlossary` rebuilds the DeepL-side glossary on the next run. The item's stored
EN value is still an identity copy, so the validator will flag it, force it `STALE`, and retranslate
it — **a Translate All is required for this to take effect.**

Open question worth one look if it ever matters: the identity value came back and was written
`CURRENT` rather than being flagged by `isGarbageTranslation`, which suggests glossary-covered terms
are exempt from garbage validation somewhere in the write path. Not chased, because the outcome was
the intended one at the time.

### Systemic: 319 discarded glossary translations

`DO_NOT_TRANSLATE` is applied far more widely than brand protection needs:

| kind               | rows | of which carry a real translation |
| ------------------ | ---- | --------------------------------- |
| `TERM`             | 799  | 783                               |
| `DO_NOT_TRANSLATE` | 405  | **319**                           |
| `PROTECTED_DISH`   | 175  | 151                               |

319 rows hold a translation that is thrown away in favour of an identity pair — the same shape as
`джин beefeater`. Some are surely correct (a true brand like `Coca-Cola` should not be translated),
but "джин савой" → `Savoy Gin` sitting unused suggests many are mislabelled. `PROTECTED_DISH` is
unaffected: line 115 only special-cases `DO_NOT_TRANSLATE`, so those already use `translatedText`.

Not bulk-changed — it spans every restaurant and language and is a product decision, not a bug fix.
A sane approach would be to review the 319 by category, or to treat "has a `translatedText` that
differs from `sourceText`" as evidence of mislabelling and flip those after spot-checking a sample.

---

## 6. Open items

- **Run Translate All for Pro Dining once more** — the `джин beefeater` glossary rows were flipped to
  `TERM` after the last run, so the fix is staged but not yet applied to the cached translations.
- **The other 318 `DO_NOT_TRANSLATE` rows** carrying real translations (§5) — product decision.
- **Known limitation (not scheduled).** The predominance analysis in `isGarbageTranslation`
  (`:104-118`) counts only Latin and Cyrillic characters, so for `el`/`ja`/`zh`/`ar` a _non-identity_
  bad output is still not caught. Closing it needs a per-script range map (Greek, Kana/Han, Arabic)
  plus a target→script table — a real refactor, and speculative. The identity case is the one with
  production evidence behind it.
- **Untracked in the repo:** `.codex/`, `AGENTS.md`, `scripts/take-screenshots.js`, `.tmp/`. Decide
  commit vs `.gitignore`.
- **Neon password** appeared in a chat transcript on 2026-08-10 and was used in shell commands.
  `.env` is gitignored and untracked, so nothing leaked to git. Rotating when convenient is cheap:
  roll `neondb_owner` in the Neon console, then update the Cloud Run `DIRECT_URL` secret
  (`deploy.ps1:156` binds `DIRECT_URL:latest`) and `.env`.

---

## 7. Reference

**Production**

|              |                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------- |
| Neon project | `old-fog-33669483` (`qr-menu-db`, PG17), branch `production` = `br-lingering-mouse-alankxtb` |
| Pooled host  | `ep-shiny-flower-al0icrn9-pooler.c-3.eu-central-1.aws.neon.tech`                             |
| Direct host  | `ep-shiny-flower-al0icrn9.c-3.eu-central-1.aws.neon.tech`                                    |
| Cloud Run    | `qr-menu-backend`, project `qr-menu-app-469216`, region `europe-west1`                       |
| Pro Dining   | `cmp7fe0hp00080zw45ulnhw3a` (**not** the local seed id from older revisions)                 |

**Rollback**

```
gcloud run services update-traffic qr-menu-backend --project=qr-menu-app-469216 \
  --region=europe-west1 --to-revisions=qr-menu-backend-00171-niy=100
```

**Deploy** — `.\deploy.ps1` from the repo root, on `main`, clean tree. It builds a commit-SHA-tagged
image, migrates, deploys with `--no-traffic`, smoke-tests the tagged revision, then shifts traffic.
`NativeCommandError` lines in its output are the documented PowerShell 5.1 stderr artifact that
`Invoke-Native` absorbs — not failures.

---

## 8. Gotchas — do not repeat these

- **Never kill by process-name pattern.** A `Stop-Process` against `*nest*start*` once killed the
  owner's dev server. Resolve exact PIDs from the listening port and use `taskkill /PID <id> /T`.
  Exit code `4294967295` (= -1) in a dev log means external termination, not a crash.
- **Backend dev entrypoint is `node scripts/start-dev-safe.js`**, not `nest start` — it injects
  `NODE_ENV`, without which `validateRuntimeEnvironment()` throws and the port never binds.
- **API prefix is `/api/v1`**, not `/api`.
- **grep locates, it never proves absence.** Revision 1 declared the language separation
  "never implemented" after it had already landed.
- **Do not run `prisma generate` or a full `turbo build` while a dev server is running** — it holds
  `query_engine-windows.dll.node` open and the rename fails with EPERM. `migrate status`,
  `tsc --noEmit` and `jest` are all safe.
- **A hook blocks agents from editing `.env`.** Hand the owner exact lines instead — and note that
  long URLs pasted into Notepad acquire hard line breaks, which silently produce a value containing a
  newline. Verify with `dotenv.parse` after any `.env` edit, not by eye.
- **Node scripts run from a scratchpad resolve modules relative to the script.** This is an
  npm-workspaces monorepo: `@prisma/client` and `dotenv` are hoisted to the repo root.
- **`gh` template syntax**, not `--jq`, when formatting multi-row output; `ConvertFrom-Json` in
  PowerShell 5.1 returns PSCustomObject and mangles arrays in string interpolation.
