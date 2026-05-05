# Testing

## Backend Testing

### Framework
- **Unit tests:** Jest v30.0.0 with `ts-jest` transform
- **E2E tests:** Jest + Supertest v7.0.0
- **Config:** Jest inline in `backend/package.json`, E2E config in `backend/test/jest-e2e.json`

### Test Structure

```
backend/
├── src/
│   └── app.controller.spec.ts           # Unit test (1 file)
└── test/
    ├── app.e2e-spec.ts                  # App E2E test
    ├── dashboard.e2e-spec.ts            # Dashboard E2E test
    └── jest-e2e.json                    # E2E Jest config
```

### Unit Test Config (`package.json`)
```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

### E2E Test Config (`test/jest-e2e.json`)
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^src/(.*)$": "<rootDir>/../src/$1" }
}
```

### Existing Tests

#### `app.controller.spec.ts` (Unit)
- Tests `AppController` via `@nestjs/testing`
- 1 test: verifies `getHello()` returns `"Hello World!"`
- **Note:** This test is likely stale — `AppController` no longer has `getHello()`

#### `app.e2e-spec.ts` (E2E)
- Tests `GET /` returns 200 with "Hello World!"
- **Note:** This test may fail — root now redirects to `/api`

#### `dashboard.e2e-spec.ts` (E2E)
- Tests `GET /dashboard/summary` returns 401 without auth token
- Uses `beforeAll`/`afterAll` instead of `beforeEach` (proper app lifecycle)
- **Note:** Missing `/api` prefix — may need `app.setGlobalPrefix('api')`

### Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:ci` | Full CI pipeline (clean, install, generate, e2e) |
| `npm run test:prepare` | Copy `.env.test` to `.env` |

### E2E Test Environment
- Docker service `test-app` runs E2E tests via `docker-compose.yml`
- Uses separate test database: `qr_menu_test`
- `NODE_ENV=test`

## Frontend Testing

### Framework
- **Test runner:** Vitest v3.0.7
- **DOM environment:** jsdom v26.1.0
- **Testing libraries:** `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`

### Test Config (in `vite.config.js`)
```javascript
test: {
  globals: true,
  environment: 'jsdom',
}
```

### Existing Tests
- `frontend/src/App.test.tsx` — Basic render test (1 file)
- `frontend/src/setupTests.js` — Testing library setup

### Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run Vitest |

## Test Coverage Assessment

### Coverage Gaps (Critical)
- **No service-level unit tests** — Auth, Menu, Restaurant, Order, Assistance services have zero unit tests
- **No controller unit tests** — Only the stale `AppController` spec exists
- **No frontend component tests** — Only 1 basic render test
- **No integration tests** — Frontend ↔ Backend flow untested
- **E2E tests are minimal** — 2 tests total, both may be broken

### What Should Be Tested
1. **Auth flow:** Register, login, JWT validation, Google OAuth
2. **Menu CRUD:** Category/item/option CRUD with ownership checks
3. **Restaurant CRUD:** Create, list, update, delete with auth
4. **Order flow:** Create order, update status
5. **Cart logic:** Add/remove/update items, total calculation, localStorage persistence
6. **Public menu:** Public endpoint returns correct data, filters out-of-stock items

## Mocking Patterns
- **Backend unit tests:** Should use `@nestjs/testing` with mocked `PrismaService`
- **E2E tests:** Use real `AppModule` with test database
- **Frontend tests:** Should mock Axios/API calls, render with context providers
