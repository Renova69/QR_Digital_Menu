---
phase: 4
plan: 1
title: "Table Model & Backend CRUD"
wave: 1
depends_on: []
files_modified:
  - backend/prisma/schema.prisma
  - backend/package.json
requirements: [REQ-007, REQ-008]
autonomous: true
must_haves:
  - Table model exists in Prisma with id, name, and restaurantId
  - Backend exposes GET/POST/DELETE endpoints for tables scoped to restaurants
  - Prisma client generated locally
---

<objective>
Update the Prisma schema to support an explicit `Table` entity belonging to a `Restaurant`. Generate the necessary Prisma client and build a backend controller structure (service and controller) to handle Create, Read, and Delete (CRUD) for tables.
</objective>

## Tasks

<task id="1.1">
<title>Add Table model to schema</title>
<read_first>
- backend/prisma/schema.prisma
</read_first>
<action>
Open `backend/prisma/schema.prisma` and add the `RestaurantTable` model (mapped to `restaurant_table` so it avoids reserved SQL keywords):

```prisma
model RestaurantTable {
  id           String     @id @default(cuid())
  name         String     // e.g., "5", "Patio-A"
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  restaurantId String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  
  @@map("restaurant_table")
}
```

Add the inverse relation to the `Restaurant` model:
```prisma
  tables             RestaurantTable[]
```
</action>
<acceptance_criteria>
- Schema contains the new model with all correct relation fields.
</acceptance_criteria>
</task>

<task id="1.2">
<title>Push schema and migrate DB</title>
<action>
Execute shell command:
```bash
npx prisma db push --schema=backend/prisma/schema.prisma
npx prisma generate --schema=backend/prisma/schema.prisma
```
*(Running push since this is rapid prototyping and we haven't strictly enforced sequential migration files yet)*
</action>
<acceptance_criteria>
- Command runs successfully and prisma client is generated.
</acceptance_criteria>
</task>

<task id="1.3">
<title>Generate Tables backend resource</title>
<action>
Run NestJS CLI to scaffold the tables resource in the backend:
```bash
cd backend && npx nest g resource tables --no-spec
```
Choose `REST API` and `Y` for CRUD entry points.
</action>
<acceptance_criteria>
- `backend/src/tables` created with controller, module, and service.
- Registered in `app.module.ts`.
</acceptance_criteria>
</task>

<task id="1.4">
<title>Implement Table CRUD endpoints</title>
<read_first>
- backend/src/tables/tables.service.ts
- backend/src/tables/tables.controller.ts
</read_first>
<action>
Update `tables.service.ts` and `tables.controller.ts` to implement:
- `POST /restaurants/:restaurantId/tables` -> creates a table expecting `{ name: "Table 1" }`.
- `GET /restaurants/:restaurantId/tables` -> fetches all tables for a given restaurant.
- `DELETE /tables/:id` -> deletes a specific table.

Ensure endpoints fetch the user ID from `@Request()` and check restaurant ownership if necessary, or just query scoped to `restaurantId`. Ensure DTO validation is handled.
</action>
<acceptance_criteria>
- `tables.controller.ts` has endpoints matching the requirements.
- `tables.service.ts` leverages `PrismaService` successfully.
</acceptance_criteria>
</task>
