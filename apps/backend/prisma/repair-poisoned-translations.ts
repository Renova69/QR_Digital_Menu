/**
 * Repairs entities whose stored translation is suspected to be un-translated
 * source text, written by the pre-fix "glossary-only mode" gate in
 * TranslationService (see translation.service.ts history / the
 * "Dynamic Menu Translation Architecture" rework). The Phase-3 migration
 * (20260725100000_translation_rework_schema) already flagged suspect UNITS
 * as MenuTranslationState.status = 'NEEDS_REVIEW' using a coarse per-
 * (restaurant, locale) ratio test — it flags every NAME/DESCRIPTION row in a
 * locale that LOOKS poisoned overall, not just the individually-poisoned
 * ones. This script does the fine-grained per-FIELD adjudication and, in
 * --apply mode, the actual repair.
 *
 * Usage:
 *   npx ts-node prisma/repair-poisoned-translations.ts            (dry-run,
 *     default — prints what WOULD happen, writes nothing)
 *   npx ts-node prisma/repair-poisoned-translations.ts --apply     (backs up
 *     then repairs)
 *   npx ts-node prisma/repair-poisoned-translations.ts --restaurant=<id>
 *     (scope to one tenant — recommended for the first real run)
 *
 * ── Critical invariant: re-verify identity before touching anything ────────
 * A NEEDS_REVIEW flag on a state row means "this (entity, field, locale) sat
 * inside a locale the coarse ratio test called poisoned" — it does NOT mean
 * this specific field's stored value is actually identical to source. Some
 * items in a "poisoned" locale can have perfectly good, already-correct
 * translations (e.g. a dish name a PROTECTED_DISH glossary term already
 * translated correctly before the gate bug started, or content translated
 * by a different, unaffected path). Deleting those would be a second,
 * self-inflicted data-loss bug on top of the one this script exists to fix.
 * So every unit is re-checked here, live, against the actual current
 * stored value:
 *
 *   storedValue missing/empty        -> nothing stored yet; mark STALE so
 *                                        the worker translates it fresh.
 *   storedValue != normalize(source) -> NOT poisoning, a real (possibly
 *                                        different) translation exists;
 *                                        mark CURRENT, touch nothing.
 *   storedValue == normalize(source) -> genuinely suspect. Then:
 *     - matches a verified DO_NOT_TRANSLATE glossary identity term,
 *     - OR is pure Latin script with no Cyrillic at all (untranslatable
 *       international brand not in the curated glossary),
 *     - OR is purely numeric/units (e.g. "0.5 л", "250g")
 *       -> legitimately untranslated; mark CURRENT, touch nothing.
 *     - otherwise -> genuinely poisoned; delete just that field's key from
 *       translations->locale (never the whole locale object, so a sibling
 *       field that's actually fine in the same locale is never destroyed);
 *       mark STALE so the worker retranslates it.
 *
 * Every entity touched gets a full pre-repair snapshot of its `translations`
 * column written to menu_translation_backup under one batchId BEFORE any
 * repair statement runs, so `restore-poisoned-translations.ts --batch <id>`
 * can undo this run by re-merging (not overwriting) that snapshot.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const LATIN_ONLY = /^[a-zA-Z0-9\s\-.,'"()&/!?:%]+$/;
const HAS_CYRILLIC = /[Ѐ-ӿ]/;
const NUMERIC_UNIT_ONLY =
  /^[\d\s.,\-/×x]+(мл|л|г|гр|кг|ml|l|g|kg|cl|бр|pcs?)?\.?$/i;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isProtectedValue(
  text: string,
  locale: string,
  doNotTranslateByLocale: Map<string, Set<string>>,
): 'glossary' | 'latin-brand' | 'numeric' | null {
  const norm = normalize(text);
  if (doNotTranslateByLocale.get(locale)?.has(norm)) return 'glossary';
  if (LATIN_ONLY.test(text) && !HAS_CYRILLIC.test(text)) return 'latin-brand';
  if (NUMERIC_UNIT_ONLY.test(text.trim())) return 'numeric';
  return null;
}

type EntityType = 'CATEGORY' | 'ITEM' | 'OPTION';
type Field = 'NAME' | 'DESCRIPTION';

interface RepairUnit {
  stateId: string;
  restaurantId: string;
  entityType: EntityType;
  entityId: string;
  field: Field;
  locale: string;
  sourceLang: string;
}

const TABLE_BY_ENTITY: Record<EntityType, string> = {
  CATEGORY: 'menu_category',
  ITEM: 'menu_item',
  OPTION: 'menu_option',
};

const JSON_KEY_BY_FIELD: Record<Field, 'name' | 'description'> = {
  NAME: 'name',
  DESCRIPTION: 'description',
};

async function loadDoNotTranslateSet(): Promise<Map<string, Set<string>>> {
  const rows = await prisma.glossaryTerm.findMany({
    where: { sourceLang: 'bg', kind: 'DO_NOT_TRANSLATE', verified: true },
    select: { targetLang: true, sourceText: true, translatedText: true },
  });
  const byLocale = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byLocale.get(row.targetLang) ?? new Set<string>();
    set.add(normalize(row.sourceText));
    set.add(normalize(row.translatedText));
    byLocale.set(row.targetLang, set);
  }
  return byLocale;
}

interface EntitySnapshot {
  canonicalName: string | null;
  canonicalDescription: string | null;
  translations: any;
}

/** Loads the entity's current canonical name/description and full
 * translations column — always re-read live at repair time, never trusted
 * from the migration-time snapshot (content may have changed since). */
async function loadEntity(
  entityType: EntityType,
  entityId: string,
): Promise<EntitySnapshot | null> {
  switch (entityType) {
    case 'CATEGORY': {
      const row = await prisma.menuCategory.findUnique({
        where: { id: entityId },
        select: { name: true, translations: true },
      });
      if (!row) return null;
      return {
        canonicalName: row.name,
        canonicalDescription: null,
        translations: row.translations,
      };
    }
    case 'ITEM': {
      const row = await prisma.menuItem.findUnique({
        where: { id: entityId },
        select: { name: true, description: true, translations: true },
      });
      if (!row) return null;
      return {
        canonicalName: row.name,
        canonicalDescription: row.description,
        translations: row.translations,
      };
    }
    case 'OPTION': {
      const row = await prisma.menuOption.findUnique({
        where: { id: entityId },
        select: { name: true, translations: true },
      });
      if (!row) return null;
      return {
        canonicalName: row.name,
        canonicalDescription: null,
        translations: row.translations,
      };
    }
  }
}

async function backupEntityOnce(
  batchId: string,
  unit: Pick<RepairUnit, 'entityType' | 'entityId' | 'restaurantId'>,
  translations: any,
  backedUp: Set<string>,
) {
  const key = `${unit.entityType}:${unit.entityId}`;
  if (backedUp.has(key)) return;
  backedUp.add(key);
  await prisma.menuTranslationBackup.create({
    data: {
      batchId,
      entityType: unit.entityType,
      entityId: unit.entityId,
      restaurantId: unit.restaurantId,
      translations: translations ?? {},
    },
  });
}

/** Deletes exactly one field key from translations->locale — never the
 * whole locale object — so a sibling field that's genuinely fine in the
 * same locale is never touched. */
async function deleteFieldKey(
  entityType: EntityType,
  entityId: string,
  locale: string,
  jsonKey: 'name' | 'description',
) {
  const table = TABLE_BY_ENTITY[entityType];
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}"
     SET translations = jsonb_set(translations, ARRAY[$1]::text[], COALESCE(translations -> $1, '{}'::jsonb) - $3)
     WHERE id = $2 AND translations -> $1 IS NOT NULL`,
    locale,
    entityId,
    jsonKey,
  );
}

type Verdict =
  | { kind: 'empty' } // nothing stored — needs translation, not a repair
  | { kind: 'not-poisoned' } // stored value differs from source — a real translation
  | { kind: 'protected'; reason: 'glossary' | 'latin-brand' | 'numeric' }
  | { kind: 'poisoned' };

function adjudicate(
  storedValue: string | undefined,
  canonicalText: string | null,
  locale: string,
  doNotTranslateByLocale: Map<string, Set<string>>,
): Verdict {
  if (!storedValue || !storedValue.trim()) return { kind: 'empty' };
  if (canonicalText === null) return { kind: 'empty' };
  if (normalize(storedValue) !== normalize(canonicalText)) {
    return { kind: 'not-poisoned' };
  }
  const reason = isProtectedValue(
    canonicalText,
    locale,
    doNotTranslateByLocale,
  );
  if (reason) return { kind: 'protected', reason };
  return { kind: 'poisoned' };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const restaurantArg = args.find((a) => a.startsWith('--restaurant='));
  const restaurantId = restaurantArg?.split('=')[1];

  if (apply && process.env.NODE_ENV === 'production') {
    console.error(
      '❌ Repair aborted: NODE_ENV=production. Run --apply against a non-production connection, or set ALLOW_REMOTE_SEED=true deliberately if this really is intended for the live DB.',
    );
    if (process.env.ALLOW_REMOTE_SEED !== 'true') process.exit(1);
    console.warn(
      '⚠️  ALLOW_REMOTE_SEED=true — proceeding with --apply against production.',
    );
  }

  const doNotTranslateByLocale = await loadDoNotTranslateSet();

  const flagged = await prisma.menuTranslationState.findMany({
    where: {
      status: 'NEEDS_REVIEW',
      ...(restaurantId ? { restaurantId } : {}),
    },
    select: {
      id: true,
      restaurantId: true,
      entityType: true,
      entityId: true,
      field: true,
      locale: true,
      sourceLang: true,
    },
    orderBy: [
      { restaurantId: 'asc' },
      { entityType: 'asc' },
      { entityId: 'asc' },
    ],
  });

  if (flagged.length === 0) {
    console.log('No NEEDS_REVIEW units found. Nothing to do.');
    return;
  }

  const units: RepairUnit[] = flagged.map((row) => {
    if (row.field !== 'NAME' && row.field !== 'DESCRIPTION') {
      throw new Error(
        `Unexpected field "${row.field}" on NEEDS_REVIEW state row ${row.id} — repair script only handles NAME/DESCRIPTION.`,
      );
    }
    return {
      stateId: row.id,
      restaurantId: row.restaurantId,
      entityType: row.entityType,
      entityId: row.entityId,
      field: row.field,
      locale: row.locale,
      sourceLang: row.sourceLang,
    };
  });

  // Cache entity reads — multiple flagged fields (NAME + DESCRIPTION) for
  // the same entity share one load.
  const entityCache = new Map<string, EntitySnapshot | null>();
  const batchId = randomUUID();
  const backedUp = new Set<string>();

  const counts = {
    empty: 0,
    notPoisoned: 0,
    protected: 0,
    poisoned: 0,
  };
  const protectionReasons: Record<string, number> = {};
  const perRestaurant: Record<
    string,
    { protected: number; repaired: number; notPoisoned: number; empty: number }
  > = {};

  for (const unit of units) {
    const entityKey = `${unit.entityType}:${unit.entityId}`;
    if (!entityCache.has(entityKey)) {
      entityCache.set(
        entityKey,
        await loadEntity(unit.entityType, unit.entityId),
      );
    }
    const entity = entityCache.get(entityKey);

    const bucket = (perRestaurant[unit.restaurantId] ??= {
      protected: 0,
      repaired: 0,
      notPoisoned: 0,
      empty: 0,
    });

    if (!entity) {
      // Entity was deleted since the migration ran — nothing to repair.
      counts.empty++;
      bucket.empty++;
      if (apply) {
        await prisma.menuTranslationState.update({
          where: { id: unit.stateId },
          data: { status: 'CURRENT' },
        });
      }
      continue;
    }

    const jsonKey = JSON_KEY_BY_FIELD[unit.field];
    const canonicalText =
      unit.field === 'NAME'
        ? entity.canonicalName
        : entity.canonicalDescription;
    const storedValue = entity.translations?.[unit.locale]?.[jsonKey] as
      string | undefined;

    const verdict = adjudicate(
      storedValue,
      canonicalText,
      unit.locale,
      doNotTranslateByLocale,
    );

    switch (verdict.kind) {
      case 'empty':
        counts.empty++;
        bucket.empty++;
        if (apply) {
          await prisma.menuTranslationState.update({
            where: { id: unit.stateId },
            data: { status: 'STALE', nextAttemptAt: null, failureCount: 0 },
          });
        }
        break;

      case 'not-poisoned':
        counts.notPoisoned++;
        bucket.notPoisoned++;
        if (apply) {
          await prisma.menuTranslationState.update({
            where: { id: unit.stateId },
            data: { status: 'CURRENT' },
          });
        }
        break;

      case 'protected':
        counts.protected++;
        bucket.protected++;
        protectionReasons[verdict.reason] =
          (protectionReasons[verdict.reason] ?? 0) + 1;
        if (apply) {
          await prisma.menuTranslationState.update({
            where: { id: unit.stateId },
            data: { status: 'CURRENT' },
          });
        }
        break;

      case 'poisoned':
        counts.poisoned++;
        bucket.repaired++;
        if (apply) {
          await backupEntityOnce(batchId, unit, entity.translations, backedUp);
          await deleteFieldKey(
            unit.entityType,
            unit.entityId,
            unit.locale,
            jsonKey,
          );
          await prisma.menuTranslationState.update({
            where: { id: unit.stateId },
            data: {
              status: 'STALE',
              nextAttemptAt: null,
              failureCount: 0,
              translatedAt: null,
            },
          });
        }
        break;
    }
  }

  console.log(
    `── ${apply ? 'APPLY' : 'DRY RUN'} ─────────────────────────────`,
  );
  console.log(`Flagged units examined: ${units.length}`);
  console.log(
    `  Not poisoned (real translation, left alone): ${counts.notPoisoned}`,
  );
  console.log(
    `  Protected (identical to source, left alone): ${counts.protected}`,
  );
  for (const [reason, count] of Object.entries(protectionReasons)) {
    console.log(`    ${reason}: ${count}`);
  }
  console.log(
    `  Empty (nothing stored, ${apply ? 'marked STALE' : 'would mark STALE'}): ${counts.empty}`,
  );
  console.log(`  ${apply ? 'Repaired' : 'Would repair'}: ${counts.poisoned}`);
  if (apply) {
    console.log(
      `Backup batchId: ${batchId} (${backedUp.size} entities snapshotted)`,
    );
    console.log(
      `Restore with: npx ts-node prisma/restore-poisoned-translations.ts --batch=${batchId} --apply`,
    );
  } else {
    console.log('Re-run with --apply to perform the repair (backs up first).');
  }
  console.log('\nPer-restaurant breakdown:');
  for (const [rid, c] of Object.entries(perRestaurant)) {
    console.log(
      `  ${rid}: repaired=${c.repaired} protected=${c.protected} notPoisoned=${c.notPoisoned} empty=${c.empty}`,
    );
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
