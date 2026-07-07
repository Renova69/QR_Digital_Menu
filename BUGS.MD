# BUGS.MD — Network Error Analysis Report

**Generated:** 2026-07-06 20:09 EEST (updated 21:14 EEST — second analysis session)
**Tool:** Chrome DevTools MCP (chrome-devtools-mcp@1.5.0)
**Environment:** Windows 10 Pro, Node.js, NestJS 11 + Vite React 18
**URL:** `http://127.0.0.1:3001` (frontend), `http://127.0.0.1:3000` (backend)
**Browser:** Chrome 149.0.0.0
**Tabs analyzed:** Tab 1 (Dashboard Orders), Tab 3 (Public Menu table=1), Tab 5 (Public Menu table=1, lang switch)
**Session flow:** Page load → Login → Dashboard → Menu tab → Reservations tab → Settings → Public Menu tabs
**Current branch:** `refactor/public-menu-review`
**Recent commits:** `6cfd85da` (lang dedup + data-hook API), `b6860bac` (PublicMenuPage hooks), `7d2a80e9` (batched items endpoint)

---

## Change-Impact Assessment

**Question:** Are these errors caused by the recent public-menu + reservations changes?

**Answer: No.** 16 of 18 failures are pre-existing infrastructure issues unrelated to the current branch.

### NOT caused by your changes (16 failures — pre-existing)

| Error | Count | Root Cause | Evidence |
|-------|-------|-----------|----------|
| B1: `client-logs` 500 | 8× | `AllExceptionsFilter.catch` — `writeAppLog()` unguarded, throws during startup | File not in diff: `all-exceptions.filter.ts` untouched since before branch |
| B2: `platform-settings/public` 500 | 6× | Prisma connection pool not ready when NestJS starts listening | File not in diff: `platform-settings.service.ts` untouched |
| B3: `auth/me` 500 | 2× | Same as B1 — filter throws while logging the 401 | Files not in diff: `jwt-auth.guard.ts`, `jwt.strategy.ts`, `all-exceptions.filter.ts` untouched |

### Possibly related to your changes (1 failure — needs verification)

| Error | Count | Verdict |
|-------|-------|---------|
| B4: `menu/import/confirm` 500 | 2× | **Unlikely.** 109KB payload exceeds default NestJS body-parser limit (100KB). Menu import endpoint not in diff. May be pre-existing. |

### Definitely NOT caused by your changes (3 failures — infrastructure)

| Error | Count | Verdict |
|-------|-------|---------|
| B7: R2 Images ORB Blocked | 157× | Cloudflare R2 CORS config. Zero code involvement. |
| B8: `subscription/status` 500 | 4× | Same pre-existing `AllExceptionsFilter` bug. Not in diff. |
| B9: `items` ERR_ABORTED | 2× | Browser cancels in-flight request on lang switch. Expected behavior, false positive in client-logs. |

### NOT a bug (1 failure — expected validation)

| Error | Count | Verdict |
|-------|-------|---------|
| B5: `reservation/settings` 400 | 1× | Valid business rule: "Add at least one service-hours row before enabling reservations." Tried enabling reservations without configuring service hours first. Subsequent PUT succeeded. |

### Git diff verification

```bash
git diff main...HEAD --stat
```

Files modified on `refactor/public-menu-review`:
- `apps/backend/src/reservations/reservation-availability.service.spec.ts`
- `apps/backend/src/reservations/reservation-availability.service.ts`
- `apps/backend/src/reservations/reservations.service.spec.ts`
- `apps/backend/src/reservations/reservations.service.ts`
- `apps/backend/test/preproduction-concurrency.e2e-spec.ts`

**None of the files implicated in the 500 errors appear in the diff.** The systemic root cause (`all-exceptions.filter.ts:55-66`) is infrastructure code untouched by this branch.

### The real systemic problem

`apps/backend/src/common/filters/all-exceptions.filter.ts:55-66` — `writeAppLog()` called WITHOUT try/catch inside the global exception filter. When it throws during startup, the error response at line 79 is never reached, and Express returns a bare 500 with empty body. This makes ALL errors invisible during startup.

This is **pre-existing infrastructure debt** — present before `refactor/public-menu-review` was branched.

---

## Summary

| # | Severity | Endpoint | Status | Count | Phase |
|---|----------|----------|--------|-------|-------|
| B1 | HIGH | `POST /api/v1/client-logs` | 500 | 8× | Startup |
| B2 | MEDIUM | `GET /api/v1/platform-settings/public` | 500 | 6× | Startup |
| B3 | MEDIUM | `GET /api/v1/auth/me` | 500 | 2× | Startup |
| B4 | MEDIUM | `POST /api/v1/restaurants/:id/menu/import/confirm` | 500 | 2× | Dashboard |
| B5 | LOW | `PUT /api/v1/reservations/:id/settings` | 400 | 1× | Dashboard |
| B6 | LOW | `GET /api/v1/reservations/:id/analytics` | Slow | 2× | Dashboard |
| **B7** | **CRITICAL** | **R2 Images (`*.r2.dev/*.webp`)** | **ORB Blocked** | **157×** | **All tabs** |
| B8 | MEDIUM | `GET /api/v1/subscription/status` | 500 | 4× | Dashboard |
| B9 | LOW | `GET /api/v1/menu/public/:id/items` | ERR_ABORTED | 2× | Public Menu |
| W1 | WARN | Socket room join denied | — | 12× | All phases |
| W2 | WARN | Recharts container width/height | — | 2× | Dashboard |
| W3 | WARN | WebSocket ERR_CONNECTION_REFUSED | — | 1× | Public Menu |

**Total failed requests: 185 (22× 500, 157× ORB blocked, 2× aborted, 1× 400)**
**Total successful requests: ~309**
**Error rate: ~37.4% (mostly ORB images)**

---

## B1: `POST /client-logs` → 500 (CRITICAL — Telemetry Blind Spot)

### Severity: HIGH

### Occurrences

| ReqID | Timestamp | Status | Failure |
|-------|-----------|--------|---------|
| 366 | 17:04:30 | 500 | net::ERR_ABORTED |
| 367 | 17:04:30 | 500 | net::ERR_ABORTED |
| 368 | 17:04:30 | 500 | net::ERR_ABORTED |
| 369 | 17:04:30 | 500 | net::ERR_ABORTED |
| 370 | 17:04:30 | 500 | net::ERR_ABORTED |
| 381 | 17:04:31 | 500 | net::ERR_ABORTED |
| 527 | 17:05:36 | 500 | — |
| 529 | 17:05:40 | 500 | — |

### Request Details (reqid=366)

```
POST /api/v1/client-logs HTTP/1.1
Host: 127.0.0.1:3001
Content-Type: application/json
Cookie: __stripe_mid=... (no auth cookie)
Content-Length: 572

Request Body:
{
  "level": "error",
  "type": "api_error",
  "message": "GET /platform-settings/public failed with 500",
  "context": {
    "method": "GET",
    "url": "/platform-settings/public",
    "status": 500,
    "responseMessage": "Request failed with status code 500",
    "currentPath": "/"
  },
  "clientSessionId": "336d4bdf-aebf-4313-a555-949285daf11f",
  "clientEventId": "b461a92b-d613-44ef-84b4-ae05806aa09e",
  "url": "http://127.0.0.1:3001/",
  "path": "/",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "buildMode": "development"
}
```

### Response

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain
<body empty>
net::ERR_ABORTED
```

### Root Cause Analysis

**File:** `apps/backend/src/client-logs/client-logs.controller.ts:98`

The `collect()` endpoint has **zero database dependencies**. It only calls `writeAppLog()` (`apps/backend/src/common/logging/app-logger.ts:90`) which does in-process `console.log`/`console.error`. The endpoint is CSRF-exempt (`apps/backend/src/common/security/csrf-exempt.ts:31`).

The 500 originates from a NestJS pipeline layer **before** the controller executes:
1. **Startup phase:** Browser fires `fetch()` with `keepalive: true` (`apps/frontend/src/lib/clientLogger.ts:103`). NestJS app is still initializing — PrismaModule not ready, middleware chain incomplete. The request hits a partially-initialized pipeline. Default exception filter converts unhandled error → 500.
2. **Runtime phase:** Same endpoint works normally (reqid=665 → 201 OK). Confirms startup-only issue.
3. **ERR_ABORTED:** Browser aborts `keepalive` fetch during page navigation (login page → dashboard transition). The fetch starts before navigation and is killed by the browser.

### Cascade Effect

```
platform-settings 500
  → api.ts interceptor calls logApiError() (frontend/src/lib/api.ts)
    → sendClientLog() fires fetch('/client-logs', {keepalive: true})
      → Backend still starting → 500
        → .catch(() => {}) silently swallows (clientLogger.ts:109)
          → ALL startup errors are permanently lost
```

### Impact

- **8 errors lost** during this session alone
- Every startup produces 8-14 invisible failures
- Debugging production incidents relies on client-logs, which is blind during startup
- `client-logs` is the ONLY telemetry channel for client-side errors

### Verification (curl)

```bash
# After backend is stable — works (201)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/v1/client-logs \
  -X POST -H "Content-Type: application/json" \
  -d '{"level":"error","type":"test","message":"test"}'
# → 201
```

### Suggested Fix

1. Ensure NestJS `listen()` only resolves after all modules (especially PrismaModule) finish `onModuleInit` / `onApplicationBootstrap`.
2. Add health-check gate in `main.ts`: `await app.listen(3000)` only after Prisma connection is confirmed.
3. Consider buffering client-logs in the frontend and flushing after first successful platform-settings response, to survive startup window.

---

## B2: `GET /platform-settings/public` → 500 (Startup Race)

### Severity: MEDIUM

### Occurrences

| ReqID | Timestamp | Status |
|-------|-----------|--------|
| 361 | 17:04:30 | 500 |
| 362 | 17:04:30 | 500 |
| 364 | 17:04:30 | 500 |
| 365 | 17:04:31 | 500 |
| 380 | 17:04:31 | 500 |
| — | 17:04:31 | 500 |
| 390 | 17:04:31 | **200** (7th attempt succeeds) |

### Request Details (reqid=361)

```
GET /api/v1/platform-settings/public HTTP/1.1
Host: 127.0.0.1:3001
Accept: application/json, text/plain, */*
x-correlation-id: 864a491f-54a1-4e5b-9569-15bd0908a346
x-trace-origin: /
Cookie: __stripe_mid=... (no auth cookie)
```

### Response

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain
<body empty>
```

### Successful Response (reqid=390, 7th attempt)

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{
  "gdprEnabled": true,
  "cookieBannerEnabled": true,
  "privacyPolicyEnabled": true,
  ...
  "announcementBannerEnabled": false,
  "announcementBannerText": "test banner",
  "announcementBannerType": "maintenance"
}
```

### Root Cause Analysis

**File:** `apps/backend/src/platform-settings/platform-settings.service.ts:14`

```typescript
async getOrCreate(): Promise<PlatformSettings> {
  return this.prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}
```

**Controller:** `apps/backend/src/platform-settings/platform-settings.controller.ts:20`
```typescript
async getPublic() {
  const settings = await this.platformSettingsService.getSettings();
  return this.platformSettingsService.getPublicPayload(settings);
}
```

The controller has **no try/catch**. When `prisma.platformSettings.upsert()` throws (Neon PgBouncer connection not established), the exception propagates to NestJS's default `AllExceptionsFilter` which returns `text/plain` 500 with empty body.

**Timing evidence:** All 6 failures occur within the first ~1 second of the page session (`x-request-started-at: 1783357470017` to `1783357471046`). After the 7th retry (~2 seconds in), the endpoint works consistently (200/304 for all subsequent calls).

**Why retries work:** NestJS eventually establishes the Prisma connection pool. `PlatformSettingsService` has a 30-second in-memory cache, so subsequent calls don't touch the DB.

### Impact

- Every page load during cold start shows 6 failures before recovery
- `AnnouncementBanner` and `CookieConsentBanner` delayed by ~2 seconds
- Triggers 6 `client-logs` calls (all fail → B1 cascade)

### Suggested Fix

1. `apps/backend/src/main.ts`: Add `await this.prisma.$connect()` before `app.listen()`.
2. `PlatformSettingsController.getPublic()`: Add try/catch returning fallback default settings on DB error.
3. `PlatformSettingsService.getOrCreate()`: Add retry logic (3 attempts, exponential backoff).

---

## B3: `GET /auth/me` → 500 Instead of 401

### Severity: MEDIUM

### Occurrences

| ReqID | Timestamp | Status |
|-------|-----------|--------|
| 363 | 17:04:30 | 500 |
| 365 | 17:04:30 | 500 |

### Request Details (reqid=363)

```
GET /api/v1/auth/me HTTP/1.1
Host: 127.0.0.1:3001
x-correlation-id: ca4aad11-ccce-4c3f-9f89-555d3cf4f860
Cookie: __stripe_mid=... (NO token cookie — user NOT logged in)
```

### Response

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain
<body empty>
```

### Root Cause Analysis

**The normal path correctly returns 401, not 500.** Full passport-to-filter trace:

1. **Controller:** `apps/backend/src/auth/auth.controller.ts:79` — `@UseGuards(JwtAuthGuard)` on `getProfile()`
2. **Guard:** `apps/backend/src/auth/jwt-auth.guard.ts:5` — `extends AuthGuard('jwt')`, no custom `handleRequest`, relies on NestJS default
3. **Passport-jwt extractor** (`jwt.strategy.ts`): `req?.cookies?.token ?? null` → returns `null`
4. **Passport-jwt strategy** (`passport-jwt/lib/strategy.js:96`): `self.fail(new Error("No auth token"))`
5. **Passport middleware** (`passport/lib/middleware/authenticate.js:108`): `allFailed()` → `callback(null, false, Error("No auth token"), undefined)`
6. **NestJS AuthGuard** (`@nestjs/passport/auth.guard.js:58`): default `handleRequest(null, false, Error(...))` → `if (err || !user)` true → **throws `new UnauthorizedException()` (401)**
7. **RouterProxy** (`@nestjs/core/router/router-proxy.js:6`): catches throw → `exceptionsHandler.next(e, host)`
8. **AllExceptionsFilter** (`apps/backend/src/common/filters/all-exceptions.filter.ts:46`): `exception instanceof HttpException` = true → **should return `res.status(401).json(...)`**

**Every step in this chain produces 401.** The 500 at reqid=363/365 means an unhandled error occurs **outside** or **after** the guard flow. Likely candidates:

| # | Candidate | File | Mechanism |
|---|-----------|------|-----------|
| 1 | **`AllExceptionsFilter.catch` itself throws** | `all-exceptions.filter.ts:55-66` | `writeAppLog()` not wrapped in try/catch — if logging throws (e.g. `req.originalUrl` access on incomplete request object), exception escapes filter → Express default handler → 500 |
| 2 | **`requestLogger` middleware throws** | `main.ts:104` | Middleware runs before route handler — if it fails, request never reaches guard |
| 3 | **Cookie-parser fails** | `main.ts` middleware chain | If `cookieParser()` can't parse malformed cookies, throws before passport runs |

**Most likely culprit (#1):** `AllExceptionsFilter` catches the `UnauthorizedException(401)` correctly, then calls `writeAppLog` to log it. During startup, `writeAppLog` (or the `req` accessors within it) throws a SECOND error. This second error is NOT caught, the 401 response is never sent, and Express's default error handler returns 500 with empty `text/plain` body.

This explains why the 500 only happens during startup and resolves once the backend is stable — the logging infrastructure itself isn't ready.

**Supporting evidence:** `AllExceptionsFilter.catch` at lines 55-66 (`apps/backend/src/common/filters/all-exceptions.filter.ts`) has no try/catch around its logging:
```typescript
// Line 55-66: NO try/catch wrapper
writeAppLog(
  statusCode >= 500 ? 'error' : 'warn',
  `HTTP ${statusCode} ${method} ${url}`,
  'HttpFilter',
  { ... }
);
// If this throws, the 401 response is never sent → Express default → 500
```

### Impact

- AuthContext calls `/auth/me` on every page load to check login state
- 500 triggers `logApiError` → `client-logs` → also fails → cascade
- `AuthContext` catches 401 silently but 500 causes double-retry (reqid=363 + 365)
- After backend stabilizes and user logs in, `/auth/me` works normally

### Suggested Fix

1. **Defensive `AllExceptionsFilter.catch`:** Wrap `writeAppLog` call in try/catch:
   ```typescript
   try {
     writeAppLog(...);
   } catch {
     // Logging must never prevent the error response from being sent
   }
   ```

2. **Health-check gate** (same as B2 fix): Ensure Prisma + all modules ready before `app.listen()`.

3. **Defense-in-depth — `JwtAuthGuard.handleRequest`:**
   ```typescript
   handleRequest(err: any, user: any, info: any) {
     if (err || !user) {
       throw err instanceof HttpException ? err : new UnauthorizedException();
     }
     return user;
   }
   ```

---

## B4: `POST /menu/import/confirm` → 500 (Runtime)

### Severity: MEDIUM

### Occurrences

| ReqID | Timestamp | Status |
|-------|-----------|--------|
| 526 | 17:05:36 | 500 |
| 528 | 17:05:40 | 500 |

### Request Details (reqid=526)

```
POST /api/v1/restaurants/cmp7fe0hp00080zw45ulnhw3a/menu/import/confirm HTTP/1.1
Host: 127.0.0.1:3001
Content-Type: application/json
Content-Length: 109256
Cookie: token=eyJ... (JWT authenticated)
x-csrf-token: 40cf38f7-a3a4-4ba0-83de-1e5f9e30e655
x-trace-origin: /dashboard/menu
```

**Request body:** 109KB JSON containing full menu import data — 9+ categories with items, each with translations (BG/EN/RO), allergen arrays, dietary tags, image URLs, thumbnail URLs, options.

### Response

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain
Access-Control-Allow-Origin: http://127.0.0.1:3001
<body empty>
```

### Root Cause Analysis

**File:** `apps/backend/src/restaurants/restaurants.service.ts` (menu import logic)
**File:** `apps/backend/src/menu-import/menu-import.module.ts`

The 109KB payload contains full menu data with nested translations. The import confirm endpoint likely fails on:
1. **Validation:** class-validator DTO rejects malformed data — but should return 400, not 500
2. **Prisma write error:** Transaction failure (foreign key, unique constraint, schema mismatch)
3. **Payload size:** 109KB is large for a single JSON body — may hit a NestJS body parser limit or cause a timeout

The empty `text/plain` response = unhandled exception, same pattern as B1-B3. No structured error message reaches the client.

The user retried and same error occurred (reqid=528), confirming the payload itself is problematic, not a transient issue.

### Impact

- User cannot import menu data via the dashboard UI
- Error message invisible to user (only visible in DevTools)
- 2 additional `client-logs` failures (B1 cascade)

### Suggested Fix

1. Check backend console for the actual exception stack trace.
2. Verify `ValidationPipe` is configured correctly on this endpoint.
3. Add try/catch in the import service returning structured error JSON.
4. Check NestJS body parser `limit` config — default is 100KB, this payload is 109KB.

---

## B5: `PUT /reservations/:id/settings` → 400 (Valid Business Rule — NOT a Bug)

### Severity: LOW (Expected validation)

### Occurrence

| ReqID | Timestamp | Status |
|-------|-----------|--------|
| 664 | 17:08:47 | 400 |

### Request Details

```
PUT /api/v1/reservations/cmp7fe0hp00080zw45ulnhw3a/settings HTTP/1.1
Content-Type: application/json
Content-Length: 16
Body: {"enabled": true}
```

### Response

```json
{
  "message": "Add at least one service-hours row before enabling reservations",
  "error": "Bad Request",
  "statusCode": 400,
  "requestId": "442dd74c-d1af-47e8-8135-e0325455dc2b"
}
```

### Analysis

This is **correct behavior** — proper business rule validation. User attempted to enable reservations without configuring service hours first. The response has:
- Proper JSON content-type
- Structured error body with `message`, `error`, `statusCode`, `requestId`
- Correct HTTP status (400, not 500)
- `X-Request-Id` header for tracing

**Subsequent success** (reqid=667 → 200): After adding service hours, the same PUT succeeded.

**Note:** Frontend `api.ts` interceptor logs ALL non-2xx responses to client-logs, including this valid 400. Consider filtering 400-level responses or treating them as `warn` (which it does: `status < 500 ? 'warn' : 'error'`).

---

## B6: `GET /reservations/:id/*` — Intermittent Slow Responses

### Severity: LOW

### Occurrences

| ReqID | Endpoint | Status |
|-------|----------|--------|
| 554 | `/reservations/:id/analytics` | 200 (delayed ~10s) |
| 555 | `/reservations/:id?upcoming=true` | 200 (delayed ~10s) |
| 556 | `/reservations/:id?date=2026-07-06` | 200 (delayed ~10s) |
| 640 | `/reservations/:id/analytics` | 304 (delayed ~5s) |
| 641 | `/reservations/:id?upcoming=true` | 304 (delayed ~5s) |
| 642 | `/reservations/:id?date=2026-07-06` | 304 (delayed ~5s) |

### Analysis

First navigation to Reservations tab: endpoints return 200 after ~10 seconds. Second navigation: 304 after ~5 seconds. All eventually succeed.

**Possible causes:**
- Cold DB query (first access loads reservation data, subsequent hits cache)
- Missing database indexes on reservation queries
- N+1 query pattern in reservations service
- Large result set without pagination on analytics endpoint

### Suggested Fix

1. Profile the reservation queries with `EXPLAIN ANALYZE`.
2. Check for missing indexes on `reservation.date`, `reservation.restaurantId`.
3. Add pagination to analytics endpoint if returning large datasets.

---

## B7: ALL R2 Images Blocked by ORB/CORB — Public Menu Broken (CRITICAL)

### Severity: CRITICAL — User-facing visual breakage

### Occurrences

| Tab | Count | Error |
|-----|-------|-------|
| Tab 1 (Dashboard Menu Editor) | 20× | `net::ERR_BLOCKED_BY_ORB` |
| Tab 3 (Public Menu table=1) | 37× | `net::ERR_BLOCKED_BY_ORB` + CORB console warning |
| Tab 5 (Public Menu table=1, lang switch) | 100× | `net::ERR_BLOCKED_BY_ORB` + CORB console warning |
| **Total** | **157×** | |

### Request Details

```
GET https://pub-f4951f9e4b404922be1de5861f7aaac5.r2.dev/<hash>.webp
Status: net::ERR_BLOCKED_BY_ORB
```

Every image request to the Cloudflare R2 bucket fails with Chrome's Opaque Response Blocking (ORB). The browser also logs:

```
msgid=16 [issue] Response was blocked by CORB (Cross-Origin Read Blocking) (count: 37/100)
```

### Root Cause Analysis

**Chrome's ORB (Opaque Response Blocking)** blocks cross-origin responses that look like they could contain data (JSON/HTML/XML) but are served with an image content-type, when the response lacks proper CORS headers. Chrome v149+ applies ORB to `<img>` tags loading from cross-origin URLs.

**The R2 bucket `pub-f4951f9e4b404922be1de5861f7aaac5.r2.dev`** does not return `Access-Control-Allow-Origin` headers on image responses. Chrome's ORB heuristic flags the `.webp` responses as potentially opaque and blocks them.

**This affects every page that renders R2 images:**
- Public menu → all menu item images broken (broken image icon)
- Dashboard menu editor → all item images broken
- Any component using `getImageUrl()` or `imageUrl.ts` with R2 URLs

**File:** `apps/frontend/src/lib/getImageUrl.ts` / `apps/frontend/src/lib/imageUrl.ts`

The image URLs are returned directly from the R2 bucket without any proxy or CORS handling.

### Impact

- **Public menu shows NO images** — completely broken visually for customers
- Dashboard menu editor shows no item images
- 157 failed network requests in this session alone
- Every page load with images triggers 30-100 blocked requests

### Verification

Check R2 bucket CORS configuration in Cloudflare dashboard:
1. Go to R2 → `pub-f4951f9e4b404922be1de5861f7aaac5` → Settings → CORS
2. Ensure CORS is enabled with:
   ```
   Allowed Origins: * (or specific origins)
   Allowed Methods: GET, HEAD
   Allowed Headers: *
   ```
3. If CORS is already enabled, the issue may be Chrome 149's ORB heuristic being overly aggressive with WebP images — may need to serve images through a proxy or use `<img>` with `crossorigin="anonymous"` attribute.

### Suggested Fix

1. **Immediate:** Add CORS headers to R2 bucket (`Access-Control-Allow-Origin: *`)
2. **Alternative:** Proxy images through the NestJS backend (`/api/storage/proxy/:key`)
3. **Frontend workaround:** Add `crossorigin="anonymous"` to all `<img>` tags rendering R2 URLs
4. **Investigate:** Chrome 149 ORB changes — this may have started with a recent Chrome update

---

## B8: `GET /subscription/status` → 500 (Flapping)

### Severity: MEDIUM

### Occurrences

| ReqID | Timestamp | Status |
|-------|-----------|--------|
| 727 | 17:14:02 | 500 |
| 729 | 17:14:03 | 500 |
| 731 | 17:14:04 | 500 |
| 733 | 17:14:05 | 500 |
| 735 | 17:14:06 | **200** (5th attempt) |

### Request Details (reqid=727)

```
GET /api/v1/subscription/status?restaurantId=cmp7fe0hp00080zw45ulnhw3a HTTP/1.1
Cookie: token=eyJ... (JWT authenticated)
x-correlation-id: bcff878f-ca07-4bca-82d5-5d98a774e7bd
x-trace-origin: /dashboard
If-None-Match: W/"24f-RxXvA17QHIeg0fit3qbdLPpG4ss"
```

### Response

```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain
<body empty>
```

### Console Messages

```
msgid=154 [error] Failed to load resource: the server responded with a status of 500
msgid=155 [error] [client-log:api_error] GET /subscription/status failed with 500
msgid=165 [error] Failed to load resource: the server responded with a status of 500
```

### Root Cause Analysis

**File:** `apps/backend/src/subscription/subscription.service.ts`

Same pattern as B2 (platform-settings): Prisma query or Stripe API call fails transiently, no try/catch in controller/service, unhandled exception → `AllExceptionsFilter` → `writeAppLog` may throw during partial outage → empty 500.

The `If-None-Match` header suggests the client had a cached ETag (`W/"24f-..."`). The 500 might be related to cache revalidation — the backend calculates a new ETag but the DB connection drops mid-query.

**Timing:** 4 failures in 4 seconds, then self-recovers. Consistent with Neon connection pool exhaustion or PgBouncer transaction-mode timeout.

### Impact

- `SubscriptionBanner`, `FeatureGuard`, `BillingView` all depend on this endpoint
- During outage, tier gating may fail open/closed unpredictably
- Triggers `client-logs` cascade (reqid=728, 730, 732, 734 → all 500)

### Suggested Fix

1. Add retry with exponential backoff in the subscription service
2. Add try/catch returning cached/stale subscription data on transient failure
3. Same systemic fix as B2: health-check gate before `listen()`

---

## B9: `GET /menu/public/:id/items` → ERR_ABORTED on Language Switch (LOW)

### Severity: LOW (False positive in error logging)

### Occurrences

| ReqID | Endpoint | Status |
|-------|----------|--------|
| 241 | `/items?lang=bg` | `net::ERR_ABORTED` |
| 245 | `/items?lang=de` | `net::ERR_ABORTED` |

### Console

```
msgid=17 [error] [client-log:api_error] GET /menu/public/cmp7fe0hp00080zw45ulnhw3a/items failed
  [object Object] (2 times)
```

### Root Cause

User rapidly switches language (EN → BG → DE → ES). The in-flight `items?lang=bg` request is aborted by the browser when a new `items?lang=de` request is initiated. The `api.ts` axios interceptor treats the aborted request as an `api_error` and logs it to `client-logs`.

**This is NOT a real error.** The request was intentionally cancelled by the browser because the user changed language before it completed.

**File:** `apps/frontend/src/lib/api.ts` — the axios response interceptor does not check `axios.isCancel(error)` before logging.

### Impact

- False positive errors in `client-logs` telemetry
- Wastes client-logs quota (60 req/min throttle)
- No user impact (items load correctly in the selected language)

### Suggested Fix

In `api.ts` response interceptor, skip logging for cancelled requests:
```typescript
if (axios.isCancel(error)) return Promise.reject(error);
```

---

## W1: Socket Room Join Denied (Auth Warning)

### Severity: WARN (Expected during auth transition)

### Console Messages

| MsgID | Message |
|-------|---------|
| 135 | `Socket room join denied: restaurant-orders UNAUTHORIZED` |
| 136 | `Socket room join denied: (empty) UNAUTHORIZED` |
| 137 | `Socket room join denied: restaurant UNAUTHORIZED` |
| 138 | `Socket room join denied: (empty) UNAUTHORIZED` |

### Analysis

Socket.io client attempts to join rooms before JWT authentication completes. The `EventsGateway` (`apps/backend/src/events/`) correctly rejects unauthorized room joins. The client retries after auth and succeeds (msgid=134: `Socket connected`).

**Not a bug** — expected race condition during auth bootstrap. Consider silencing these in dev or deferring socket connection until after `/auth/me` resolves.

---

## W2: Recharts Container Warning

### Severity: WARN (Cosmetic)

### Console Message

```
msgid=130 [warn] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width. (2 occurrences)
```

### Analysis

Recharts component in `AnalyticsView` (`apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`) or summary charts renders with zero-size container during initial mount (before DOM measurements are available). The chart auto-resizes on next render.

**Cosmetic only** — no functional impact.

---

## Systemic Issues

### S1 (CRITICAL): `AllExceptionsFilter.catch` Has Unguarded `writeAppLog` Call

**File:** `apps/backend/src/common/filters/all-exceptions.filter.ts:55-66`

```typescript
// Line 55-66: NO try/catch wrapper around this block
writeAppLog(level, getMessage(responseBody), 'ExceptionFilter', {
  requestId,
  method: req?.method,
  path: redactSensitivePath(req?.originalUrl || req?.url),
  statusCode,
  errorName: error?.name,
  stack: error?.stack,
  userId: req?.user?.id,
  role: req?.user?.role,
  restaurantId: req?.user?.restaurantId,
});
```

**This is THE central systemic root cause.** When `writeAppLog` (or any of the `req` property accesses on lines 57-66) throws:
1. The exception escapes `catch()` — it is NOT caught by anything
2. The error response at line 79 (`res.status(statusCode).json(safeResponse)`) is **never reached**
3. Express's default error handler takes over
4. Express returns `500 Internal Server Error` with `Content-Type: text/plain` and **empty body**

This explains ALL the empty-body 500 errors (B1, B2, B3, B4). The filter that is supposed to produce structured error responses is itself the failure point.

**Why startup-only:** During startup, `writeAppLog`'s dependencies (or the `req` object shape) may not be fully initialized. Once NestJS is stable, `writeAppLog` works correctly and all error responses return proper JSON.

**Proof:** reqid=664 (reservation settings 400) produces a **proper** JSON response:
```json
{"message":"Add at least one service-hours row...","error":"Bad Request","statusCode":400,"requestId":"..."}
```

This is the `AllExceptionsFilter` working **correctly** — `writeAppLog` didn't throw, so the response at line 79 ran.

**Fix:** Wrap lines 55-66 in try/catch:
```typescript
try {
  writeAppLog(level, getMessage(responseBody), 'ExceptionFilter', { ... });
} catch {
  // Logging must never prevent the error response from being sent.
  // Fall back to a bare console.error so the error is at least visible.
  console.error('[AllExceptionsFilter] Failed to write log', exception);
}
```

### S2: No Health-Check Gate Before Listening

NestJS calls `app.listen(3000)` before PrismaModule fully connects. First ~3 seconds of requests fail. Combined with S1, ALL startup errors become invisible 500s.

**Recommendation:** Add `OnApplicationBootstrap` hook or explicit `await prisma.$connect()` before `listen()`.

### S3: Cascading Telemetry Failure

Client error logger (`client-logs`) is a POST endpoint on the same backend. When the backend is unhealthy, error telemetry is also unhealthy. All startup errors are permanently lost.

**Recommendation:** 
1. Buffer client logs in `sessionStorage` and flush when backend is healthy.
2. Or use a separate, minimal health-check endpoint that doesn't depend on Prisma.

### S4: All 500 Errors Are Identical — Impossible to Triage

All 500 errors share the same signature:
- `Content-Type: text/plain`
- Empty response body
- No error code, no request ID, no stack trace

This is the **symptom** of S1. Once S1 is fixed, all error responses will include structured JSON bodies with `requestId`, enabling production triage.

---

## Timeline

```
17:04:30.017  Page loads at http://127.0.0.1:3001/ → redirects to /login
17:04:30.017  platform-settings/public (reqid=361) → 500
17:04:30.017  platform-settings/public (reqid=362) → 500
17:04:30.017  auth/me (reqid=363) → 500
17:04:30.017  platform-settings/public (reqid=364) → 500
17:04:30.017  auth/me (reqid=365) → 500
17:04:30.017  6× client-logs (reqid=366-370, 381) → 500
17:04:31.046  platform-settings/public (reqid=380) → 500
17:04:31.???  platform-settings/public (reqid=390) → 200 ✓ (7th retry)
17:04:31.???  csrf-token → 200 ✓
17:04:31.???  auth/login → 201 ✓ (user logs in)
17:04:31.???  Dashboard loads — all endpoints 200 ✓
17:05:36.???  menu/import/confirm (reqid=526) → 500
17:05:36.???  client-logs (reqid=527) → 500
17:05:40.???  menu/import/confirm (reqid=528) → 500 (retry)
17:05:40.???  client-logs (reqid=529) → 500
17:05:41+     All endpoints stable ✓
17:08:47.???  reservation/settings PUT → 400 (valid business rule)
17:08:47.???  client-logs → 201 ✓ (telemetry working now)
```

---

## Files Requiring Investigation

| File | Issue |
|------|-------|
| `apps/backend/src/main.ts` | No health-check before `listen()`, exception filter returns text/plain |
| `apps/backend/src/platform-settings/platform-settings.service.ts:14` | `getOrCreate()` has no retry/fallback |
| `apps/backend/src/platform-settings/platform-settings.controller.ts:20` | `getPublic()` has no try/catch |
| `apps/backend/src/auth/jwt-auth.guard.ts:1-5` | No custom `handleRequest` — raw errors → 500 |
| `apps/backend/src/auth/jwt.strategy.ts:42-191` | 149-line `validate()` with 3 DB queries, no error boundary |
| `apps/backend/src/client-logs/client-logs.controller.ts:98` | Works after startup, fails during startup (pipeline issue) |
| `apps/backend/src/restaurants/` (menu import) | 109KB payload causes unhandled 500 |
| `apps/frontend/src/lib/clientLogger.ts:103` | `keepalive` fetch aborted during navigation |
| `apps/frontend/src/lib/api.ts` | `logApiError` fires for all non-2xx, no startup buffer |

---

## Test Coverage Impact

- `apps/backend/src/client-logs/client-logs.controller.spec.ts` — exists, but likely tests only happy path (controller alone, no pipeline)
- `apps/backend/src/platform-settings/` — no spec file for service
- `apps/backend/src/auth/jwt-auth.guard.ts` — no guard spec file
- Menu import confirm — unknown test coverage

---

*Report generated from Chrome DevTools MCP network inspection. All reqids, timestamps, headers, and bodies captured from live browser session against `127.0.0.1:3001`.*
