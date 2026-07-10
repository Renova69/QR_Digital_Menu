---
phase: 1
plan: 2
title: "Fix Tests, Prisma Schema & Project Hygiene"
wave: 1
depends_on: []
files_modified:
  - backend/src/app.controller.spec.ts
  - backend/test/app.e2e-spec.ts
  - backend/test/dashboard.e2e-spec.ts
  - backend/prisma/schema.prisma
  - frontend/Dockerfile
  - frontend/package.json
requirements: [REQ-001]
autonomous: true
must_haves:
  - Unit test passes for AppController.getApiInfo()
  - E2E test for GET /api returns 200 with JSON body
  - Dashboard E2E test uses /api prefix
  - Prisma schema has onDelete Cascade on all parent relations
  - Frontend Dockerfile copies source before building
  - Frontend package.json has a "dev" script
  - frontend/backend/ directory removed
---

<objective>
Fix all stale tests, add cascade deletes to Prisma schema, fix the frontend Dockerfile build order, add missing npm scripts, and clean up dead directories.
</objective>

## Tasks

<task id="2.1">
<title>Fix AppController unit test</title>
<read_first>
- backend/src/app.controller.ts
- backend/src/app.controller.spec.ts
- backend/src/app.service.ts
</read_first>
<action>
Replace the entire content of `backend/src/app.controller.spec.ts` with a test that matches the current `AppController`:

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("getApiInfo", () => {
    it("should return API information object", () => {
      const result = appController.getApiInfo();
      expect(result).toHaveProperty("message", "QR Menu API");
      expect(result).toHaveProperty("version", "1.0.0");
      expect(result).toHaveProperty("documentation", "/api-docs");
      expect(result).toHaveProperty("endpoints");
      expect(result.endpoints).toHaveProperty("authentication", "/api/auth");
      expect(result.endpoints).toHaveProperty("menu", "/api/menu");
      expect(result.endpoints).toHaveProperty(
        "restaurants",
        "/api/restaurants",
      );
    });
  });
});
```

Note: `AppService` is removed from providers since `AppController` constructor no longer takes it (the constructor is `constructor() {}`).
</action>
<acceptance_criteria>

- `backend/src/app.controller.spec.ts` contains `getApiInfo` test
- `backend/src/app.controller.spec.ts` does NOT import `AppService`
- `backend/src/app.controller.spec.ts` asserts `message` equals `'QR Menu API'`
- `backend/src/app.controller.spec.ts` asserts result has `endpoints` property
  </acceptance_criteria>
  </task>

<task id="2.2">
<title>Fix E2E tests to use /api prefix</title>
<read_first>
- backend/test/app.e2e-spec.ts
- backend/test/dashboard.e2e-spec.ts
- backend/src/main.ts (to check setGlobalPrefix)
</read_first>
<action>
Replace the content of `backend/test/app.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "./../src/app.module";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/api (GET)", () => {
    return request(app.getHttpServer())
      .get("/api")
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toBe("QR Menu API");
        expect(res.body.version).toBe("1.0.0");
      });
  });
});
```

Update `backend/test/dashboard.e2e-spec.ts` to also set the global prefix:

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("DashboardController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("/api/dashboard/summary (GET)", () => {
    it("should return 401 Unauthorized if no token is provided", () => {
      return request(app.getHttpServer())
        .get("/api/dashboard/summary?restaurantId=some-id")
        .expect(401);
    });
  });
});
```

</action>
<acceptance_criteria>
- `backend/test/app.e2e-spec.ts` contains `app.setGlobalPrefix('api')`
- `backend/test/app.e2e-spec.ts` sends GET request to `/api` not `/`
- `backend/test/app.e2e-spec.ts` expects `QR Menu API` in response body
- `backend/test/app.e2e-spec.ts` has `afterAll` with `app.close()`
- `backend/test/dashboard.e2e-spec.ts` contains `app.setGlobalPrefix('api')`
- `backend/test/dashboard.e2e-spec.ts` sends GET request to `/api/dashboard/summary`
</acceptance_criteria>
</task>

<task id="2.3">
<title>Add cascade deletes to Prisma schema</title>
<read_first>
- backend/prisma/schema.prisma
</read_first>
<action>
Update `backend/prisma/schema.prisma` to add `onDelete: Cascade` to all child relations that reference a parent. The specific changes:

1. `Restaurant.owner` relation (line 54):
   Change: `owner User @relation(fields: [ownerId], references: [id])`
   To: `owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)`

2. `MenuCategory.restaurant` relation (line 68):
   Change: `restaurant Restaurant @relation(fields: [restaurantId], references: [id])`
   To: `restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)`

3. `MenuItem.category` relation (line 88):
   Change: `category MenuCategory @relation(fields: [categoryId], references: [id])`
   To: `category MenuCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)`

4. `MenuOption.menuItem` relation (line 104):
   Change: `menuItem MenuItem @relation(fields: [menuItemId], references: [id])`
   To: `menuItem MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)`

5. `Order.restaurant` relation (line 119):
   Change: `restaurant Restaurant @relation(fields: [restaurantId], references: [id])`
   To: `restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)`

6. `OrderItem.order` relation (line 130):
   Change: `order Order @relation(fields: [orderId], references: [id])`
   To: `order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)`

7. `OrderItem.menuItem` relation (line 132):
   Change: `menuItem MenuItem @relation(fields: [menuItemId], references: [id])`
   To: `menuItem MenuItem @relation(fields: [menuItemId], references: [id], onDelete: SetNull)`
   Also change `menuItemId String` to `menuItemId String?` (nullable — preserve order items if menu item is deleted)

8. `AssistanceRequest.restaurant` relation (line 144):
   Change: `restaurant Restaurant @relation(fields: [restaurantId], references: [id])`
   To: `restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)`
   </action>
   <acceptance_criteria>

- `grep -c "onDelete: Cascade" backend/prisma/schema.prisma` returns 7
- `grep "onDelete: SetNull" backend/prisma/schema.prisma` returns 1 match (OrderItem.menuItem)
- Deleting a restaurant will cascade to its categories, items, orders, and assistance requests
- Deleting a category will cascade delete its items
- Deleting an item will cascade delete its options
  </acceptance_criteria>
  </task>

<task id="2.4">
<title>Fix frontend Dockerfile and add dev script</title>
<read_first>
- frontend/Dockerfile
- frontend/package.json
</read_first>
<action>
Replace the content of `frontend/Dockerfile` with the corrected build order:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3001
CMD ["npm", "run", "start"]
```

The fix: `COPY . .` is now BEFORE `RUN npm run build` (previously it was after, meaning the build had no source files).

Add a `dev` script to `frontend/package.json` in the scripts section:

```json
"dev": "vite --host",
```

Add it right before the existing `"start"` script.
</action>
<acceptance_criteria>

- `frontend/Dockerfile` has `COPY . .` on a line BEFORE `RUN npm run build`
- `frontend/Dockerfile` does NOT have `RUN npm run build` before `COPY . .`
- `frontend/package.json` contains `"dev": "vite --host"`
- `grep "dev" frontend/package.json` shows the dev script
  </acceptance_criteria>
  </task>

<task id="2.5">
<title>Remove unused frontend/backend directory</title>
<read_first>
- frontend/backend/package.json
</read_first>
<action>
Delete the entire `frontend/backend/` directory. It contains only a `package.json` (152 bytes) and `package-lock.json` that appear to be leftover artifacts from early development. No source code imports from this directory.

```bash
rm -rf frontend/backend/
```

</action>
<acceptance_criteria>
- Directory `frontend/backend/` does not exist
- `ls frontend/backend/ 2>&1` returns an error (directory not found)
</acceptance_criteria>
</task>

## Verification

```bash
# Unit test should pass (if deps available)
cd backend && npx jest src/app.controller.spec.ts --no-cache 2>&1 | head -20

# Cascade deletes configured
grep -c "onDelete" backend/prisma/schema.prisma

# Dockerfile build order correct
head -10 frontend/Dockerfile

# Dev script exists
grep "dev" frontend/package.json

# Unused directory removed
test -d frontend/backend && echo "EXISTS" || echo "REMOVED"
```
