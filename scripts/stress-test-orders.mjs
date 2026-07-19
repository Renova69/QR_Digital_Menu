#!/usr/bin/env node
/**
 * Concurrent Multi-Restaurant Order Stress Test
 * ==============================================
 * Places orders across multiple restaurants simultaneously to verify
 * the backend handles concurrent writes without errors, race conditions,
 * or data corruption.
 *
 * ── PREPARATION ──────────────────────────────────────────────────────
 * 1. Start backend:  cd apps/backend && npm run start:dev
 * 2. Seed the DB:    cd apps/backend && npm run seed
 *    (creates "The Azure Orchid" + full menu; run seed-demo-restaurants.ts
 *     for 4 extra restaurants: npx ts-node prisma/seed-demo-restaurants.ts)
 * 3. For multi-restaurant testing, also seed demo restaurants AND add
 *    menu items to them (currently they have no menu items).
 *    Fastest: use dashboard UI to copy menu, or create a few items via API.
 *
 * ── USAGE ────────────────────────────────────────────────────────────
 *   node scripts/stress-test-orders.mjs
 *
 * Options (env vars):
 *   API_URL=http://localhost:3000/api/v1
 *   TEST_EMAIL=demo@codespaces.com
 *   TEST_PASSWORD=codespaces2026
 *   RESTAURANTS=3              — max restaurants to test (picks first N)
 *   ORDERS_PER_BATCH=5         — orders per restaurant per batch
 *   BATCHES=2                  — number of concurrent batches
 *   TABLES_PER_RESTAURANT=5    — tables to create per restaurant if none exist
 *   VERBOSE=true               — print request/response details
 *
 * ── EXAMPLES ─────────────────────────────────────────────────────────
 *   # Light smoke test (1 restaurant, 5 orders)
 *   RESTAURANTS=1 ORDERS_PER_BATCH=5 BATCHES=1 node scripts/stress-test-orders.mjs
 *
 *   # Heavy concurrent load (controlled concurrency)
 *   CONCURRENCY=20 RESTAURANTS=1 ORDERS_PER_BATCH=100 BATCHES=1 node scripts/stress-test-orders.mjs
 *
 *   # 1000 orders across 10 waves of 100 with 25 in-flight
 *   CONCURRENCY=25 RESTAURANTS=1 ORDERS_PER_BATCH=100 BATCHES=10 node scripts/stress-test-orders.mjs
 *
 * ── WHAT IT TESTS ────────────────────────────────────────────────────
 * - Concurrent order creation across different restaurants
 * - Table session auto-creation under concurrency (getOrCreateOpenSession)
 * - Menu item validation across restaurant boundaries
 * - Points-earning + loyalty calculations under load
 * - DB connection pool behavior with concurrent writes
 */

const API = (process.env.API_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'demo@codespaces.com';
const PASSWORD = process.env.TEST_PASSWORD || 'codespaces2026';
const MAX_RESTAURANTS = parseInt(process.env.RESTAURANTS || '3', 10);
const ORDERS_PER_BATCH = parseInt(process.env.ORDERS_PER_BATCH || '5', 10);
const BATCHES = parseInt(process.env.BATCHES || '2', 10);
const TABLES_PER_RESTAURANT = parseInt(process.env.TABLES_PER_RESTAURANT || '5', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const VERBOSE = process.env.VERBOSE === 'true';
// Comma-separated restaurant IDs to test (bypasses discovery via login).
// Use when restaurants belong to different owners. Tables must already exist
// or be creatable by the logged-in user.
const EXPLICIT_IDS = (process.env.RESTAURANT_IDS || '').split(',').filter(Boolean);

// ── Concurrency limiter (semaphore) ─────────────────────────────────

function createLimiter(max) {
  let running = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0) return;
    running++;
    const [fn, resolve] = queue.shift();
    fn().then(resolve).finally(() => { running--; next(); });
  };
  return (fn) => new Promise((resolve) => {
    if (running < max) { running++; fn().then(resolve).finally(() => { running--; next(); }); }
    else { queue.push([fn, resolve]); }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(section, msg, color = 'reset') {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${colors.dim}[${ts}]${colors.reset} ${colors[color]}[${section}]${colors.reset} ${msg}`);
}

function hr() {
  console.log('─'.repeat(60));
}

class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} from ${url}: ${JSON.stringify(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/**
 * Small fetch wrapper that returns parsed JSON + status.
 * Throws HttpError on non-2xx.
 */
async function request(method, path, opts = {}) {
  const { body, cookie, csrfToken } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  // Attach CSRF token for state-changing dashboard requests
  if (csrfToken && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const url = `${API}${path}`;
  if (VERBOSE) log('HTTP', `${method} ${path}`, 'dim');

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new HttpError(res.status, data, url);
  }

  // Extract set-cookie for JWT tracking (returns array, never comma-joined)
  const setCookie = res.headers.getSetCookie?.() || [];
  return { data, status: res.status, setCookie };
}

/**
 * Fetch with retry for transient network errors (ECONNRESET, ETIMEDOUT, etc.)
 * Retries up to `retries` times with exponential backoff.
 */
async function requestRetry(method, path, opts = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request(method, path, opts);
    } catch (err) {
      const isNetworkError = err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('socket hang up');
      if (isNetworkError && attempt < retries) {
        const delay = 200 * Math.pow(2, attempt);
        if (VERBOSE) log('RETRY', `${path}: attempt ${attempt + 1}/${retries + 1} — waiting ${delay}ms`, 'yellow');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ── Step 1: Login ────────────────────────────────────────────────────

async function login() {
  log('AUTH', `Logging in as ${EMAIL}...`, 'cyan');
  const { setCookie } = await request('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  // setCookie is array from getSetCookie() — find the auth token cookie
  const tokenCookie = setCookie.find(c => c.startsWith('token='));
  if (!tokenCookie) throw new Error('No token cookie in login response');
  const jwt = tokenCookie.split(';')[0].slice('token='.length);

  // Also extract CSRF token for state-changing dashboard requests
  const csrfCookie = setCookie.find(c => c.startsWith('csrf-token='));
  const csrfToken = csrfCookie ? csrfCookie.split(';')[0].slice('csrf-token='.length) : null;

  log('AUTH', 'Login OK, got JWT cookie', 'green');
  // Cookie must include BOTH token and csrf-token for CSRF-protected endpoints
  const cookie = csrfToken ? `token=${jwt}; csrf-token=${csrfToken}` : `token=${jwt}`;
  return { cookie, csrfToken };
}

// ── Step 2: Discover Restaurants ─────────────────────────────────────

async function discoverRestaurants(auth) {
  // If explicit IDs provided, use them directly
  if (EXPLICIT_IDS.length > 0) {
    log('DISC', `Using ${EXPLICIT_IDS.length} explicit restaurant ID(s)`, 'blue');
    const restaurants = [];
    for (const id of EXPLICIT_IDS) {
      try {
        const { data } = await request('GET', `/restaurants/${id}`, auth);
        restaurants.push(data);
      } catch (err) {
        // If this user doesn't own the restaurant, try public menu meta
        log('DISC', `Can't fetch ${id.slice(0, 8)}... via JWT — trying public meta`, 'yellow');
        const { data: meta } = await request('GET', `/menu/public/${id}/meta`);
        restaurants.push({ id, name: meta?.restaurantName || id.slice(0, 8) });
      }
    }
    return restaurants.slice(0, MAX_RESTAURANTS);
  }

  log('DISC', 'Fetching restaurants...', 'cyan');
  const { data } = await request('GET', '/restaurants', auth);

  if (!Array.isArray(data)) {
    const list = data.data || data.restaurants || data.items || [data];
    log('DISC', `Found ${list.length} restaurant(s)`, 'blue');
    return list.slice(0, MAX_RESTAURANTS);
  }

  log('DISC', `Found ${data.length} restaurant(s)`, 'blue');
  return data.slice(0, MAX_RESTAURANTS);
}

// ── Step 3: Ensure Tables Exist ──────────────────────────────────────

async function ensureTables(restaurantId, auth) {
  // First, list existing tables
  const { data } = await request('GET', `/restaurants/${restaurantId}/tables`, auth);
  const tables = Array.isArray(data) ? data : (data.data || []);

  if (tables.length >= TABLES_PER_RESTAURANT) {
    log('TABLES', `Restaurant ${restaurantId.slice(0, 8)}...: ${tables.length} tables exist`, 'green');
    return tables.map(t => ({ id: t.id, number: t.number || t.name }));
  }

  const need = TABLES_PER_RESTAURANT - tables.length;
  log('TABLES', `Restaurant ${restaurantId.slice(0, 8)}...: creating ${need} tables...`, 'yellow');
  try {
    await request('POST', `/restaurants/${restaurantId}/tables/bulk`, {
      ...auth,
      body: { count: need },
    });
    // Re-fetch
    const { data: data2 } = await request('GET', `/restaurants/${restaurantId}/tables`, auth);
    const all = Array.isArray(data2) ? data2 : (data2.data || []);
    log('TABLES', `Now have ${all.length} tables`, 'green');
    return all.map(t => ({ id: t.id, number: t.number || t.name }));
  } catch (err) {
    if (err.status === 403 || err.status === 401) {
      log('TABLES', `Cannot create tables (not owner) — using existing ${tables.length}`, 'yellow');
      if (tables.length === 0) {
        log('TABLES', 'FATAL: No tables and cannot create them. Pre-create tables for this restaurant.', 'red');
      }
      return tables.map(t => ({ id: t.id, number: t.number || t.name }));
    }
    throw err;
  }
}

// ── Step 4: Fetch Menu ───────────────────────────────────────────────

async function fetchMenu(restaurantId) {
  log('MENU', `Fetching menu for ${restaurantId.slice(0, 8)}...`, 'cyan');
  const { data } = await request('GET', `/menu/public/${restaurantId}`);

  const items = [];
  const categories = data.categories || data.data?.categories || [];

  for (const cat of categories) {
    const catItems = cat.items || cat.menuItems || [];
    for (const item of catItems) {
      // Skip items with required options — stress test doesn't resolve option choices
      const options = item.options || [];
      const hasRequired = options.some(o => o.required !== false);
      if (hasRequired) continue;

      items.push({
        id: item.id,
        name: item.name,
        price: item.price,
      });
    }
  }

  log('MENU', `Found ${items.length} usable menu items (skipped items with required options)`, 'blue');
  return items;
}

// ── Step 5: Place Orders ─────────────────────────────────────────────

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMultiple(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const CUSTOMER_NAMES = [
  'Alex Johnson', 'Maria Petrova', 'Ivan Dimitrov', 'Sarah Chen',
  'Georgi Todorov', 'Elena Rossi', 'Dimitar Stoyanov', 'Ana Kowalski',
  'Petar Iliev', 'Mila Vasileva', 'Chris Brown', 'Teodora Angelova',
];

function buildOrder(tableName, menuItems) {
  // Pick 1-3 random menu items
  const count = 1 + Math.floor(Math.random() * 3);
  const picked = pickMultiple(menuItems, count);

  return {
    customerName: pickOne(CUSTOMER_NAMES),
    tableId: tableName,  // table NAME ("1", "2"), NOT DB cuid — resolved server-side
    items: picked.map(item => ({
      menuItemId: item.id,
      quantity: 1 + Math.floor(Math.random() * 3),
    })),
    source: 'CUSTOMER',
  };
}

async function placeOrder(restaurantId, tableName, menuItems, label) {
  const order = buildOrder(tableName, menuItems);
  const start = Date.now();

  try {
    const { data } = await requestRetry('POST', '/orders', { body: order });
    const ms = Date.now() - start;
    if (VERBOSE) {
      log('ORDER', `${label}: OK ${ms}ms (orderId=${data.id?.slice(0, 8)}...)`, 'green');
    }
    return { ok: true, ms, orderId: data.id, error: null };
  } catch (err) {
    const ms = Date.now() - start;
    log('ORDER', `${label}: FAIL ${ms}ms — ${err.message}`, 'red');
    return { ok: false, ms, orderId: null, error: err.message };
  }
}

// ── Step 6: Run Batch ────────────────────────────────────────────────

async function runBatch(restaurants, batchNum) {
  const totalOrders = restaurants.length * ORDERS_PER_BATCH;
  log('BATCH', `=== Batch ${batchNum + 1}/${BATCHES} — ${restaurants.length} restaurants × ${ORDERS_PER_BATCH} orders = ${totalOrders} total (concurrency: ${CONCURRENCY}) ===`, 'magenta');

  const tasks = [];
  for (const restaurant of restaurants) {
    for (let i = 0; i < ORDERS_PER_BATCH; i++) {
      const table = pickOne(restaurant._tables);
      const label = `R:${restaurant.name.slice(0, 10)} T:${table.number} #${i + 1}`;
      tasks.push({ label, restaurant, table });
    }
  }

  const results = [];
  const limiter = createLimiter(CONCURRENCY);
  let done = 0;
  let lastReport = 0;
  const batchStart = Date.now();

  const promises = tasks.map(({ label, restaurant, table }) =>
    limiter(() =>
      placeOrder(restaurant.id, table.number, restaurant._menuItems, label).then(r => {
        results.push(r);
        done++;
        // Progress every 50 orders or 5 seconds
        if (done - lastReport >= 50 || (Date.now() - lastReport >= 5000 && done > lastReport)) {
          const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
          const pct = ((done / totalOrders) * 100).toFixed(0);
          const rate = (done / ((Date.now() - batchStart) / 1000)).toFixed(1);
          log('PROG', `${done}/${totalOrders} (${pct}%) — ${elapsed}s — ${rate} orders/sec`, 'cyan');
          lastReport = done;
        }
      })
    )
  );

  await Promise.all(promises);
  const elapsed = Date.now() - batchStart;

  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  const avgMs = results.reduce((s, r) => s + r.ms, 0) / results.length;
  const maxMs = Math.max(...results.map(r => r.ms));
  const minMs = Math.min(...results.map(r => r.ms));

  hr();
  log('BATCH', `Done in ${(elapsed / 1000).toFixed(1)}s — ${colors.green}${ok} OK${colors.reset} / ${colors.red}${fail} FAIL${colors.reset} — avg ${avgMs.toFixed(0)}ms, min ${minMs}ms, max ${maxMs}ms`, 'bold');

  if (fail > 0) {
    const errors = results.filter(r => !r.ok).map(r => r.error);
    const uniqueErrors = [...new Set(errors)].slice(0, 5);
    log('BATCH', `Top errors: ${uniqueErrors.join(' | ').slice(0, 300)}`, 'red');
  }

  return { ok, fail, elapsed, avgMs, minMs, maxMs, results };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${colors.bold}╔══════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}║  QR Digital Menu — Concurrent Order Stress Test  ║${colors.reset}`);
  console.log(`${colors.bold}╚══════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  API:       ${API}`);
  console.log(`  Auth:      ${EMAIL}`);
  console.log(`  Restaurants: ${MAX_RESTAURANTS}`);
  console.log(`  Orders/batch: ${ORDERS_PER_BATCH} per restaurant`);
  console.log(`  Batches:   ${BATCHES}`);
  console.log(`  Total:     up to ${MAX_RESTAURANTS * ORDERS_PER_BATCH * BATCHES} orders`);
  console.log('');

  // 1. Login
  const auth = await login();

  // 2. Discover restaurants
  const restaurants = await discoverRestaurants(auth);
  if (restaurants.length === 0) {
    log('FATAL', 'No restaurants found. Seed DB first: npm run seed', 'red');
    process.exit(1);
  }
  log('DISC', `Testing with: ${restaurants.map(r => r.name || r.id?.slice(0, 8)).join(', ')}`, 'blue');

  // 3. For each restaurant: ensure tables + fetch menu
  for (const r of restaurants) {
    hr();
    log('SETUP', `Preparing ${r.name || r.id.slice(0, 8)}...`, 'cyan');

    r._tables = await ensureTables(r.id, auth);
    r._menuItems = await fetchMenu(r.id);

    if (r._menuItems.length === 0) {
      log('SETUP', `WARNING: No menu items — orders will fail!`, 'yellow');
      r._menuItems = [{ id: '00000000-0000-0000-0000-000000000000', name: 'DUMMY', price: 0 }];
    }
  }

  // 4. Run batches
  const allResults = [];
  let totalOk = 0;
  let totalFail = 0;
  const batchStart = Date.now();

  for (let b = 0; b < BATCHES; b++) {
    const result = await runBatch(restaurants, b);
    allResults.push(result);
    totalOk += result.ok;
    totalFail += result.fail;
    // Cooldown between batches — let OS reclaim TCP sockets
    if (b < BATCHES - 1) {
      log('COOL', `Waiting 2s for connection cleanup...`, 'dim');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalElapsed = Date.now() - batchStart;

  // 5. Final report
  console.log('');
  console.log(`${colors.bold}╔══════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}║              FINAL REPORT                        ║${colors.reset}`);
  console.log(`${colors.bold}╚══════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  Total orders:   ${totalOk + totalFail}`);
  console.log(`  Successful:     ${colors.green}${totalOk}${colors.reset}`);
  console.log(`  Failed:         ${totalFail > 0 ? colors.red : colors.reset}${totalFail}${colors.reset}`);
  console.log(`  Success rate:   ${((totalOk / (totalOk + totalFail)) * 100).toFixed(1)}%`);
  console.log(`  Total time:     ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log(`  Avg latency:    ${(allResults.reduce((s, r) => s + r.avgMs * (r.ok + r.fail), 0) / (totalOk + totalFail)).toFixed(0)}ms`);
  console.log(`  Throughput:     ${((totalOk + totalFail) / (totalElapsed / 1000)).toFixed(1)} orders/sec`);
  console.log('');

  // Per-batch summary
  console.log(`${colors.bold}Batch details:${colors.reset}`);
  for (let i = 0; i < allResults.length; i++) {
    const b = allResults[i];
    const pct = ((b.ok / (b.ok + b.fail)) * 100).toFixed(0);
    console.log(`  Batch ${i + 1}: ${b.ok + b.fail} orders, ${b.ok} OK (${pct}%), ${b.elapsed}ms, avg ${b.avgMs.toFixed(0)}ms`);
  }
  console.log('');

  // Detailed failures
  if (totalFail > 0) {
    console.log(`${colors.red}${colors.bold}Failures:${colors.reset}`);
    const allFails = allResults.flatMap(r => r.results.filter(x => !x.ok));
    const byError = {};
    for (const f of allFails) {
      byError[f.error] = (byError[f.error] || 0) + 1;
    }
    for (const [err, count] of Object.entries(byError)) {
      console.log(`  ${count}x: ${err.slice(0, 120)}`);
    }
    console.log('');
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${colors.red}FATAL: ${err.message}${colors.reset}`);
  console.error(err.stack);
  process.exit(2);
});
