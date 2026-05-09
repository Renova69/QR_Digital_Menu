# SaaS Menu Import — Implementation Prompt

## Context

I have an **offline OCR menu digitizer** (Node.js + Python sidecar + Ollama) that extracts Bulgarian restaurant menus from images/PDFs into structured JSON. I need to build a **Menu Import** feature in my SaaS platform (Next.js / Prisma / PostgreSQL) that accepts data from this tool via:

1. **API push** — OCR tool pushes directly to a REST endpoint
2. **JSON file upload** — user uploads the OCR export file
3. **CSV file upload** — user uploads the OCR CSV export

This document gives you the exact OCR output formats, schema, and implementation tasks. Do not invent your own schema — match what the OCR tool produces.

---

## OCR Tool Output Formats

### Canonical JSON Schema (what the OCR tool exports)

```json
{
  "version": "1.0",
  "exported_at": "2026-05-09T12:00:00Z",
  "source": "offline-ocr-import",
  "schemaVersion": "2.0",
  "restaurant_name": "string or null",
  "currency": "BGN | EUR | USD",
  "categories": [
    {
      "id": "uuid",
      "name": "string",
      "sort_order": 1,
      "items": [
        {
          "id": "uuid",
          "name": "string",
          "description": "string or empty string",
          "price": 12.99,
          "weight": "300g | null",
          "variants": [
            { "name": "Small", "price": 8.99, "weight": "250g or null" }
          ],
          "tags": ["vegetarian", "spicy", "contains-nuts"],
          "image_url": null,
          "sort_order": 1,
          "confidence": 0.95
        }
      ]
    }
  ]
}
```

### SaaS Push Payload (what the OCR tool sends to the API)

The OCR tool transforms the above into this payload before pushing. Your API endpoint **must accept exactly this structure**:

```json
{
  "restaurantId": "string or null",
  "restaurant_name": "string or null",
  "categories": [
    {
      "name": "string",
      "order": 1,
      "availabilityType": "ALWAYS",
      "items": [
        {
          "name": "string",
          "description": "string or null",
          "price": 12.99,
          "weight": "300g or null",
          "currency": "BGN | EUR",
          "allergens": ["nuts", "dairy"],
          "dietaryTags": ["vegetarian", "spicy"],
          "order": 1,
          "options": [
            {
              "name": "Size / Variant",
              "type": "VARIATION",
              "choices": [
                { "name": "Small", "price": 8.99, "weight": "250g or null" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Important:** `tags` from the OCR tool are pre-split into two arrays before pushing:
- `allergens` — tags containing: `nuts`, `dairy`, `soy`, `gluten`, `peanuts`, `shellfish`, `egg`
- `dietaryTags` — everything else (e.g., `vegetarian`, `spicy`, `vegan`, `gluten-free`)

### CSV Export Format

The OCR tool exports CSV with these **exact** headers (UTF-8 BOM for Excel Cyrillic support):

```
category,item_name,description,price,weight,variants,tags,confidence
```

- `variants` format: `Small:8.99; Large:12.99` (name:price pairs, semicolon-separated)
- `tags` format: comma-separated string, e.g. `vegetarian, spicy, contains-nuts`
- `weight` format: string, e.g. `300g`, `500ml`, `300/50г` (fractional = main/garnish)
- `confidence`: float 0–1 or empty string if not available

**Note on CSV allergens:** The CSV `tags` column contains raw unsplit tags. Your CSV parser must re-split into `allergens` vs `dietaryTags` using the same rule as above (check against known allergens list).

---

## Task 1: Prisma Schema Update

Update the Prisma models to store all OCR data points. Here is what needs to change:

**On `MenuItem` model — add:**
```prisma
weight       String?
confidence   Float?
```

**On `MenuItemTag` (or inline as array field if using PostgreSQL) — separate allergens and dietary tags:**
```prisma
allergens    String[]   // PostgreSQL array
dietaryTags  String[]   // PostgreSQL array
```

**`MenuOption` model (for variants/sizes):**
```prisma
model MenuOption {
  id          String         @id @default(cuid())
  menuItemId  String
  name        String         // e.g. "Size / Variant"
  type        String         @default("VARIATION")
  menuItem    MenuItem       @relation(fields: [menuItemId], references: [id])
  choices     MenuOptionChoice[]
}

model MenuOptionChoice {
  id           String     @id @default(cuid())
  menuOptionId String
  name         String     // e.g. "Small"
  price        Float
  weight       String?
  menuOption   MenuOption @relation(fields: [menuOptionId], references: [id])
}
```

**On `Menu` or `Restaurant` model — add if not present:**
```prisma
restaurantName  String?   // extracted by OCR, may differ from db name
currency        String    @default("BGN")
importSource    String?   // e.g. "offline-ocr-import"
importedAt      DateTime?
```

**On `MenuCategory` — add:**
```prisma
sortOrder        Int     @default(0)
availabilityType String  @default("ALWAYS")
```

Run `npx prisma migrate dev --name add_ocr_fields` after changes.

---

## Task 2: API Endpoint

Create `POST /api/v1/restaurants/[id]/menu/import` as a Next.js App Router route handler.

### Authentication
Check `Authorization: Bearer <API_KEY>` header. The API key is per-restaurant — look it up in the database by `restaurantId`. Return `401` if missing or invalid.

### Request body
The exact SaaS Push Payload structure shown above. `restaurantId` in the body must match `[id]` in the URL — return `400` if they differ.

### Upsert logic (implement in this order)

1. **Find or create** the restaurant's menu for the current active period
2. **For each category** in the payload:
   - Match by `name` (case-insensitive trim) against existing categories on this menu
   - If found: update `sortOrder`, `availabilityType`
   - If not found: create new
3. **For each item** within a category:
   - Match by `name` (case-insensitive trim) against existing items in that category
   - If found: update all fields (`price`, `weight`, `description`, `allergens`, `dietaryTags`, `currency`)
   - If not found: create new
   - **Delete options and re-create** — do not try to upsert choices, just wipe and rebuild:
     ```
     await prisma.menuOption.deleteMany({ where: { menuItemId: item.id } })
     // then create new options from payload
     ```
4. **Do NOT delete** categories or items that exist in the DB but are absent from the payload — this is an additive upsert, not a full replace. (Unless you want to add a `replaceAll: true` flag to the payload for future use.)

### Response
```json
{ "success": true, "created": 3, "updated": 12, "categories": 4 }
```

Return `207` if partial failure (some items failed), `200` on full success.

---

## Task 3: File Import Service

### JSON import
1. Parse uploaded `.json` file
2. Detect schema version:
   - If `schemaVersion: "2.0"` present → full canonical format, run through `transformCanonicalToSaaSPayload()`
   - If it has `categories[].items[].allergens` directly → already SaaS push format, use as-is
3. Pass result to the same upsert logic as the API endpoint

`transformCanonicalToSaaSPayload(menu)` must:
- Split `tags[]` into `allergens[]` + `dietaryTags[]` using known allergens list: `['nuts','dairy','soy','gluten','peanuts','shellfish','egg']`
- Map `variants[]` to `options[0].choices[]` (type: `"VARIATION"`)
- Map `sort_order` → `order`
- Include `restaurant_name` and `currency` at root level

### CSV import

Parse using a streaming CSV parser (e.g., `papaparse` or `csv-parse`). Expected headers:

```
category, item_name, description, price, weight, variants, tags, confidence
```

For each row:
```typescript
const KNOWN_ALLERGENS = ['nuts','dairy','soy','gluten','peanuts','shellfish','egg'];

function parseVariants(str: string) {
  if (!str) return [];
  return str.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const parts = v.split(':');
    return {
      name: parts[0]?.trim() || '',
      price: parseFloat(parts[1]) || 0,
      weight: parts[2]?.trim() || null  // optional third segment
    };
  });
}

function splitTags(str: string) {
  const tags = str.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  return {
    allergens: tags.filter(t => KNOWN_ALLERGENS.some(a => t.includes(a))),
    dietaryTags: tags.filter(t => !KNOWN_ALLERGENS.some(a => t.includes(a)))
  };
}
```

Group rows by `category` to rebuild the categories array before passing to upsert.

Handle missing `weight` or `confidence` columns gracefully (older exports may not have them — default to `null`).

---

## Task 4: Frontend UI (Tailwind CSS / shadcn)

Build a `MenuImport` dashboard component with four sections:

### 1. API Key panel
- Display current API key (masked: `sk-••••••••••••abcd`)
- "Reveal" button (show for 5s then re-mask)
- "Regenerate" button with confirmation dialog
- Copy-to-clipboard button
- Show the exact curl example:
  ```
  POST https://yourdomain.com/api/v1/restaurants/{id}/menu/import
  Authorization: Bearer <API_KEY>
  Content-Type: application/json
  ```

### 2. File uploader
- Drag-and-drop zone accepting `.json` and `.csv` only
- On file select: auto-detect format by extension, parse client-side for preview
- Show error if headers don't match expected CSV format
- Show error if JSON missing `categories` key

### 3. Preview table
Show before user confirms import:

| Category | Item | Price | Weight | Tags |
|----------|------|-------|--------|------|
| Салати   | Шопска салата | 7.50 BGN | 250g | vegetarian |

- Paginate if >50 items
- Show counts: "X categories, Y items found"
- Highlight items with no price in yellow (price = null)
- "Cancel" and "Confirm Import" buttons

### 4. Import result
After confirm:
- Show success banner: "Imported X items across Y categories"
- Show table of any failed rows with reason
- "Download error report" button if any failures

---

## Output Requirements

Provide in this order:
1. Prisma schema diff (only the changed/added models and fields)
2. `POST /api/v1/restaurants/[id]/menu/import` route handler (TypeScript)
3. `transformCanonicalToSaaSPayload()` utility function
4. CSV parsing utility with `parseVariants()` and `splitTags()`
5. Upsert service function (reusable by both API and file import paths)
6. React `MenuImport` component

Use TypeScript throughout. Prisma Client for all DB access. No raw SQL.
