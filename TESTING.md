# Testing

Run the fast repository checks from the root:

```bash
npm test
npm run lint
npm run test:coverage
npm run test:browser
```

Database-backed backend tests use `npm run test:e2e`. They require local
PostgreSQL URLs whose database names end in `_test`; CI provisions PostgreSQL
and runs migrations before executing them.

## File naming

- `*.spec.ts` is used for NestJS/backend Jest specs and Playwright browser
  journeys.
- `*.test.ts` and `*.test.tsx` are used for frontend Vitest tests and
  printer-agent Jest tests.
- `*.mock.ts` is reserved for reusable test doubles shared by multiple suites.
  Keep a mock inline when it is private to one test file.

A `.mock.ts` file is a helper, not a test suite, and should not contain
top-level `describe` or `test` calls.

## Test boundaries

- Unit tests isolate one service, component, hook, or native adapter.
- Backend e2e tests exercise real NestJS and PostgreSQL integration.
- Browser smoke tests cover a few critical customer and owner journeys while
  mocking the API boundary for speed and determinism.
- Printer-agent tests use `jest-expo` and mock native networking or wake-lock
  boundaries; they do not require an Android emulator.

## Coverage and lint

Coverage thresholds are baselines, not targets. Raise them as meaningful tests
are added; do not lower them merely to make CI pass.

Existing lint debt is reported as warnings with a fixed warning budget.
Correctness rules remain errors, and CI fails when the warning count grows
beyond the recorded baseline. Use each package's `lint:fix` only for deliberate
formatting or cleanup work.
