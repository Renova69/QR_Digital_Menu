#!/usr/bin/env node
/**
 * Fills missing i18n locale files using DeepL.
 * Reads DEEPL_API_KEY from apps/backend/.env.
 * Run: node scripts/translate-i18n.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LOCALES = resolve(ROOT, 'apps/frontend/src/locales');

// Read DEEPL_API_KEY from backend .env
function readDeeplKey() {
  const envPath = resolve(ROOT, 'apps/backend/.env');
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/^DEEPL_API_KEY=(.+)$/m);
  if (!match) throw new Error('DEEPL_API_KEY not found in apps/backend/.env');
  return match[1].trim();
}

const DEEPL_KEY = readDeeplKey();
const IS_FREE = DEEPL_KEY.endsWith(':fx');
const DEEPL_URL = IS_FREE
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';

// i18n lang code → DeepL target language code
const LANG_MAP = {
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
  zh: 'ZH',
  el: 'EL',
  ja: 'JA',
  ru: 'RU',
  ar: 'AR',
};

// Flatten nested object to { 'a.b.c': 'value' } — skip arrays
function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[key] = v;
    } else if (Array.isArray(v)) {
      // skip array values
    } else if (typeof v === 'object' && v !== null) {
      Object.assign(result, flatten(v, key));
    }
  }
  return result;
}

// Rebuild nested object from flat keys
function unflatten(flat) {
  const result = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.');
    let obj = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
  return result;
}

// Send up to 50 strings per request; rate-limit between batches
async function translateBatch(texts, targetLang) {
  const BATCH_SIZE = 50;
  const DELAY_MS = 300;
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams();
    params.append('target_lang', targetLang);
    params.append('source_lang', 'EN');
    params.append('preserve_formatting', '1');
    for (const t of batch) params.append('text', t);

    let attempt = 0;
    while (attempt < 5) {
      const res = await fetch(DEEPL_URL, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (res.ok) {
        const data = await res.json();
        results.push(...data.translations.map((t) => t.text));
        break;
      }

      if (res.status === 429 || res.status === 529) {
        const wait = 1000 * Math.pow(2, attempt);
        console.log(`    Rate limited — waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
        continue;
      }

      const body = await res.text();
      throw new Error(`DeepL ${res.status}: ${body}`);
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

async function processLanguage(lang, deeplLang, enFlat) {
  const filePath = `${LOCALES}/${lang}/translation.json`;
  let existing = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(readFileSync(filePath, 'utf8'));
  }

  const existingFlat = flatten(existing);
  const missingKeys = Object.keys(enFlat).filter((k) => !existingFlat[k]);

  if (missingKeys.length === 0) {
    console.log(`  ✓ ${lang}: already complete (${Object.keys(enFlat).length} keys)`);
    return;
  }

  console.log(`  ${lang}: translating ${missingKeys.length} missing keys...`);

  const missingValues = missingKeys.map((k) => enFlat[k]);
  let translatedValues;

  try {
    translatedValues = await translateBatch(missingValues, deeplLang);
  } catch (e) {
    console.error(`  ✗ ${lang}: ${e.message}`);
    return;
  }

  const merged = { ...existingFlat };
  for (let i = 0; i < missingKeys.length; i++) {
    merged[missingKeys[i]] = translatedValues[i];
  }

  const nested = unflatten(merged);
  writeFileSync(filePath, JSON.stringify(nested, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${lang}: written (${Object.keys(merged).length} total keys)`);
}

async function main() {
  console.log(`DeepL endpoint: ${DEEPL_URL}`);
  const en = JSON.parse(readFileSync(`${LOCALES}/en/translation.json`, 'utf8'));
  const enFlat = flatten(en);
  console.log(`EN source: ${Object.keys(enFlat).length} leaf keys\n`);

  for (const [lang, deeplLang] of Object.entries(LANG_MAP)) {
    await processLanguage(lang, deeplLang, enFlat);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
