# Help Center CMS — Super Admin Content Management

## Goal

Move all Help/FAQ content from hardcoded i18n JSON files into a database-driven CMS accessible via the super-admin page. Admins can add, edit, delete, and reorder FAQ items and help categories without code redeployment.

## Scope

- Landing page FAQ (8 items in `LandingFAQ.tsx`)
- Dashboard help (7 categories in `HelpView.tsx`)
- Both support tri-lingual editing (EN, BG, RO)
- Admins can add/remove categories and items dynamically

**Out of scope:** All other `t()` calls in the app remain i18next-driven. Only help/FAQ content moves to DB.

## Architecture

### Data Model

New Prisma model `HelpContent`:

```prisma
model HelpContent {
  id          String   @id @default(uuid())
  section     String   // 'landing' | 'dashboard'
  categoryKey String   // e.g. 'getting-started', 'menu', 'general'
  itemKey     String   // unique key per item within its section+category
  sortOrder   Int      @default(0)
  locale      String   // 'en' | 'bg' | 'ro'
  title       String   // FAQ question or help section title
  body        String   // FAQ answer or help content (plain text or Markdown)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([section, categoryKey, itemKey, locale])
  @@map("help_content")
}
```

### API Endpoints

**Super-admin CRUD** (behind `JwtAuthGuard + SuperAdminGuard`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/super-admin/help-content?section=landing\|dashboard` | List all items for a section |
| `POST` | `/super-admin/help-content` | Create item |
| `PATCH` | `/super-admin/help-content/:id` | Update item |
| `DELETE` | `/super-admin/help-content/:id` | Delete item |
| `PATCH` | `/super-admin/help-content/reorder` | Bulk reorder (array of `{id, sortOrder}`) |

**Public read** (no auth):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/help-content/landing` | Landing FAQ consumer |
| `GET` | `/help-content/dashboard` | Dashboard HelpView consumer (JWT optional, operators need it) |

### Backend Files

- **Create:** `apps/backend/src/help-content/help-content.module.ts`
- **Create:** `apps/backend/src/help-content/help-content.service.ts`
- **Create:** `apps/backend/src/help-content/help-content.controller.ts`
- **Create:** `apps/backend/src/help-content/dto/create-help-content.dto.ts`
- **Create:** `apps/backend/src/help-content/dto/update-help-content.dto.ts`
- **Create:** `apps/backend/src/help-content/dto/reorder-help-content.dto.ts`
- **Modify:** `apps/backend/src/app.module.ts` — register `HelpContentModule`
- **Create:** `apps/backend/prisma/migrations/*_help_content.sql` — new migration
- **Create:** `apps/backend/prisma/seed-help-content.ts` — seed script

### Frontend Files

- **Create:** `apps/frontend/src/pages/super-admin/HelpCenterPage.tsx` — CMS UI
- **Modify:** `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx` — add sidebar nav + route
- **Modify:** `apps/frontend/src/App.tsx` — add `/super-admin/help` route
- **Modify:** `apps/frontend/src/components/landing/LandingFAQ.tsx` — fetch from API
- **Modify:** `apps/frontend/src/pages/Dashboard/HelpView.tsx` — fetch from API
- **Modify:** `apps/frontend/src/lib/api.ts` — add `getHelpContent`, admin CRUD functions

## Component Design

### HelpCenterPage.tsx

Main CMS page with two sub-tabs:

**Landing FAQ tab:**
- Flat list of FAQ items sorted by `sortOrder`
- Each item shows: question preview, active toggle, locale badges (EN/BG/RO)
- Edit opens a Dialog with `LocaleTextEditor`-style tabs for title + body per locale
- "+ Add FAQ Item" creates new item with empty locales, assigns next `sortOrder`
- Delete with confirmation

**Dashboard Help tab:**
- Accordion list of categories
- Expanded category shows its items
- Each category: edit name, delete (with all items), add items within
- Each item: edit title + body per locale
- "+ Add Category" creates new `categoryKey`
- Reorder via up/down arrows or drag handles

Both tabs reuse `SectionCard`, `LocaleTextEditor`, and `ToggleRow` patterns from `LegalSettingsPage.tsx`.

### SuperAdminLayout.tsx changes

Add one entry to `NAV_ITEMS`:

```ts
{ to: "/super-admin/help", icon: MessageCircleQuestion, label: "Help Center" },
```

### LandingFAQ.tsx changes

Replace all `t('landing.faq.*')` calls with `useQuery` fetching `/help-content/landing`. Group items by `itemKey`, render each locale's title/body using the user's current language (falling back to EN). Accordion animation stays identical.

### HelpView.tsx changes

Replace all `t('dashboard.help.*')` calls with `useQuery` fetching `/help-content/dashboard`. Group items by `categoryKey`, render accordion categories. Search/filter stays JavaScript-side over the fetched data.

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│  Super Admin                                        │
│  HelpCenterPage.tsx  ──CRUD──▶  /super-admin/help-*│
│                                    │                │
│                                    ▼                │
│                              HelpContentService      │
│                                    │                │
│                                    ▼                │
│                              PostgreSQL              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Public / Operator                                  │
│  LandingFAQ.tsx      ──GET──▶  /help-content/landing│
│  HelpView.tsx        ──GET──▶  /help-content/dash..│
│                                    │                │
│                                    ▼                │
│                              HelpContentService      │
└─────────────────────────────────────────────────────┘
```

## Migration Strategy

1. New migration creates `help_content` table
2. Seed script (`prisma/seed-help-content.ts`) contains current i18n values inlined as constants (one-time migration, known data)
3. Creates `HelpContent` rows for each FAQ item (8) and help category item across 3 locales
4. After deploy + seed, `LandingFAQ.tsx` and `HelpView.tsx` switch from i18n to API
5. Old i18n keys can be removed from locale JSON in a follow-up cleanup

## Error Handling

- API returns empty array on first run (no content seeded yet) — consumers render nothing gracefully
- Edit dialog validates: title required, at least one locale must have content
- Delete shows confirmation dialog for categories with items (cascade delete)
- Public endpoints cache 5 minutes (`staleTime`) to avoid per-visitor DB hits

## Testing

- Unit: `HelpContentService` CRUD operations
- Integration: super-admin API endpoints with SuperAdminGuard
- E2E: HelpCenterPage — create FAQ item, edit locale, delete, reorder
- Visual regression: LandingFAQ with DB content vs current i18n content
