# Community 31

**Community 31** — 5 nodes

## Nodes

### User report of untranslated strings across public menu, checkout, dashboard tabs, settings, home page Р Р†Р вЂљРІР‚Сњ duplicated language picker, missing i18n keys, cart language stale on switch

- **ID:** `TranslationGaps_UserReport`
- **Type:** document
- **Degree:** 2
- **Source:** `05.05.26_Translation_issue.md`
- **Outbound:**
  - → `Cart language sync Р Р†Р вЂљРІР‚Сњ resolveItemName() looks up live translated name from categories prop by item ID + lang key, bypassing stale add-time name snapshot` [_`identified`_ | EXTRACTED | score: 1.0]

### Cart language sync Р Р†Р вЂљРІР‚Сњ resolveItemName() looks up live translated name from categories prop by item ID + lang key, bypassing stale add-time name snapshot

- **ID:** `CartLanguageSync`
- **Type:** code
- **Degree:** 1
- **Source:** `06.06.26_remaining_issue_translation_plus_other_fixes.md`

### Platform-managed DeepL translation Р Р†Р вЂљРІР‚Сњ 3 paths: (1) fire-and-forget pre-warm on menu create/update, (2) owner-triggered Translate All via POST /api/restaurants/:id/translate-all, (3) lazy on-demand via GET /api/menu/public/:id?lang=<code> caching to DB translations JSON

- **ID:** `DeepLTranslationArchitecture`
- **Type:** document
- **Degree:** 1
- **Source:** `05.05.26_Translation_issue.md`
- **Outbound:**
  - → `User report of untranslated strings across public menu, checkout, dashboard tabs, settings, home page Р Р†Р вЂљРІР‚Сњ duplicated language picker, missing i18n keys, cart language stale on switch` [_`addressed`_ | EXTRACTED | score: 1.0]
