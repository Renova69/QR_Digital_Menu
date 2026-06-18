const fs = require('fs');
const path = require('path');
const DIR = 'apps/frontend/src/locales';
const LANGS = ['en', 'bg', 'ro'];

// ── NEW keys: added only if absent (never overwrite). ───────────────────────
const FILL = {
  // AuthContext error fallbacks
  'auto.loginFailed': {
    en: 'Login failed. Please check your credentials.',
    bg: 'Входът е неуспешен. Моля, проверете данните си.',
    ro: 'Autentificare eșuată. Verifică-ți datele de conectare.',
  },
  'auto.registrationFailed': {
    en: 'Registration failed. Please try again.',
    bg: 'Регистрацията е неуспешна. Моля, опитайте отново.',
    ro: 'Înregistrare eșuată. Te rugăm să încerci din nou.',
  },
  'auto.verificationFailed': {
    en: 'Verification failed. Please check the code.',
    bg: 'Потвърждението е неуспешно. Моля, проверете кода.',
    ro: 'Verificare eșuată. Te rugăm să verifici codul.',
  },
  // DeviceLoginPage
  'auto.invalidPin': {
    en: 'Invalid PIN',
    bg: 'Невалиден ПИН',
    ro: 'PIN invalid',
  },
  'auto.askManagerStaffDevice': {
    en: 'Ask a manager to generate a Staff Device QR from Settings, then scan it on this device.',
    bg: 'Помолете мениджър да генерира QR код за служебно устройство от Настройки, след което го сканирайте на това устройство.',
    ro: 'Roagă un manager să genereze un cod QR pentru dispozitivul personalului din Setări, apoi scanează-l pe acest dispozitiv.',
  },
  'auto.preparingDevice': {
    en: 'Preparing device...',
    bg: 'Подготовка на устройството...',
    ro: 'Se pregătește dispozitivul...',
  },
  'auto.verifying': {
    en: 'Verifying...',
    bg: 'Проверка...',
    ro: 'Se verifică...',
  },
  // Pluralised lockout message (i18next native _one/_other plurals)
  'auto.tryAgainInMinutes_one': {
    en: 'Try again in {{count}} minute.',
    bg: 'Опитайте отново след {{count}} минута.',
    ro: 'Încearcă din nou peste {{count}} minut.',
  },
  'auto.tryAgainInMinutes_other': {
    en: 'Try again in {{count}} minutes.',
    bg: 'Опитайте отново след {{count}} минути.',
    ro: 'Încearcă din nou peste {{count}} de minute.',
  },
};

// ── EXISTING keys that are Google-/login-flow critical but currently hold the
//    raw English string in bg/ro (auto-generated stubs). Replace ONLY when the
//    current value still equals the English string — never clobber a real
//    translation. ─────────────────────────────────────────────────────────────
const FIX_IF_EQUALS_EN = {
  'auto.signInWithGoogle': { bg: 'Вход с Google', ro: 'Conectare cu Google' },
  'auto.orContinueWith': { bg: 'Или продължете с', ro: 'Sau continuă cu' },
  'auto.completingSignIn': {
    bg: 'Завършване на входа...',
    ro: 'Se finalizează conectarea...',
  },
  'auto.password': { bg: 'Парола', ro: 'Parolă' },
  'auto.noDeviceConfigured': {
    bg: 'Няма конфигурирано устройство',
    ro: 'Niciun dispozitiv configurat',
  },
  'auto.tooManyAttempts': {
    bg: 'Твърде много опити',
    ro: 'Prea multe încercări',
  },
  'auto.sharedDevice': { bg: 'Споделено устройство', ro: 'Dispozitiv partajat' },
  'auto.restaurant': { bg: 'Ресторант', ro: 'Restaurant' },
};

const serialize = (o) => JSON.stringify(o, null, 2).replace(/\n/g, '\r\n'); // CRLF, no trailing newline

const raw = {},
  obj = {};
for (const l of LANGS) {
  raw[l] = fs.readFileSync(`${DIR}/${l}/translation.json`, 'utf8');
  obj[l] = JSON.parse(raw[l]);
}
// Self-check: serializer must reproduce each file byte-for-byte.
for (const l of LANGS)
  if (serialize(JSON.parse(raw[l])) !== raw[l]) {
    console.error('ABORT format mismatch', l);
    process.exit(1);
  }

function get(o, dotted) {
  const p = dotted.split('.');
  let c = o;
  for (const k of p) {
    if (c == null) return undefined;
    c = c[k];
  }
  return c;
}
function setIfAbsent(o, dotted, val) {
  const p = dotted.split('.');
  let c = o;
  for (let i = 0; i < p.length - 1; i++) {
    if (c[p[i]] == null || typeof c[p[i]] !== 'object') c[p[i]] = {};
    c = c[p[i]];
  }
  const k = p[p.length - 1];
  if (Object.prototype.hasOwnProperty.call(c, k)) return false;
  c[k] = val;
  return true;
}
function setNode(o, dotted, val) {
  const p = dotted.split('.');
  let c = o;
  for (let i = 0; i < p.length - 1; i++) {
    if (c[p[i]] == null || typeof c[p[i]] !== 'object') c[p[i]] = {};
    c = c[p[i]];
  }
  c[p[p.length - 1]] = val;
}

let added = 0;
for (const [k, langs] of Object.entries(FILL))
  for (const l of Object.keys(langs))
    if (setIfAbsent(obj[l], k, langs[l])) added++;

let fixed = 0;
for (const [k, langs] of Object.entries(FIX_IF_EQUALS_EN)) {
  const enVal = get(obj.en, k);
  if (typeof enVal !== 'string') {
    console.error('WARN: EN missing for', k, '— skipping fix');
    continue;
  }
  for (const l of Object.keys(langs)) {
    const cur = get(obj[l], k);
    if (cur === enVal) {
      // still an untranslated English stub → safe to replace
      setNode(obj[l], k, langs[l]);
      fixed++;
    } else {
      console.log(`  keep ${l} ${k} (already localized: ${JSON.stringify(cur)})`);
    }
  }
}

for (const l of LANGS)
  fs.writeFileSync(`${DIR}/${l}/translation.json`, serialize(obj[l]), 'utf8');

console.log('added (new keys):', added, ' fixed (en-stub→localized):', fixed);
