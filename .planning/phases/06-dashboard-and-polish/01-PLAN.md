---
phase: 6
plan: 1
title: "Restaurant Branding & Landing Page Polish"
wave: 1
depends_on: []
files_modified:
  - backend/prisma/schema.prisma
  - backend/src/restaurants/restaurants.controller.ts
  - backend/src/restaurants/restaurants.service.ts
  - backend/src/restaurants/dto/update-restaurant.dto.ts
  - frontend/src/pages/HomePage.tsx
  - frontend/src/pages/PublicMenuPage.tsx
requirements: [REQ-013, REQ-015]
autonomous: true
must_haves:
  - Restaurant model accommodates `logoUrl` and `accentColor`.
  - Public menu renders custom branding colors and logos.
  - HomePage features modern landing copy and layout instead of just placeholder text.
---

<objective>
Migrate the `Restaurant` entity to natively support brand assets (`logoUrl`, `accentColor`). Extend backend REST services allowing users to edit these fields. Polish the `HomePage` with premium public marketing material and apply the loaded branding onto the `PublicMenuPage`.
</objective>

## Tasks

<task id="1.1">
<title>Database schema branding</title>
<read_first>
- backend/prisma/schema.prisma
</read_first>
<action>
Modify `schema.prisma`. Attach to `Restaurant` model:
```prisma
  logoUrl            String?
  accentColor        String?    @default("#4F46E5") // Indigo-600
```
Trigger database push and generated mapping:
```bash
npx.cmd prisma@6.15.0 db push --schema=prisma/schema.prisma
npx.cmd prisma@6.15.0 generate --schema=prisma/schema.prisma
```
</action>
<acceptance_criteria>
- Schema supports brand parameters accurately natively passing migration.
</acceptance_criteria>
</task>

<task id="1.2">
<title>Implement Backend Updating Endpoints</title>
<read_first>
- backend/src/restaurants/restaurants.controller.ts
- backend/src/restaurants/restaurants.service.ts
</read_first>
<action>
Ensure the `UpdateRestaurantDto` (if it exists, create if not) accounts for `logoUrl` and `accentColor`. 
Implement `PATCH /restaurants/:id` protecting the endpoint by ensuring the `ownerId` logic binds correctly. 
</action>
<acceptance_criteria>
- Restaurant updates execute cleanly over API payloads parsing colors correctly.
</acceptance_criteria>
</task>

<task id="1.3">
<title>Revamp PublicMenuPage visual branding</title>
<read_first>
- frontend/src/pages/PublicMenuPage.tsx
</read_first>
<action>
In `PublicMenuPage`:
- Wait for the API returning the `restaurant` model.
- Conditionally apply `accentColor` into `style={{ backgroundColor: restaurant.accentColor }}` or explicit style tags resolving brand consistency at the Header array natively. 
- Inject `restaurant.logoUrl` pointing natively towards `VITE_API_URL + '/' + logoUrl` or raw URLs dynamically inside the header box instead of pure text strings.
</action>
<acceptance_criteria>
- Public Menu looks explicitly 'skinned' based off database color parameters.
</acceptance_criteria>
</task>

<task id="1.4">
<title>Polish the HomePage landing component</title>
<read_first>
- frontend/src/pages/HomePage.tsx
</read_first>
<action>
Update the root `HomePage.tsx`. Wipe the placeholder block. Implement a sleek frontend Hero component leveraging existing Tailwind blocks (large headings, "Create your digital QR menu in minutes" subheading, bold CTA button linking securely towards `/login`).
</action>
<acceptance_criteria>
- HomePage looks like a robust SaaS marketing page.
</acceptance_criteria>
</task>
