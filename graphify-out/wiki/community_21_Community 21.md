# Community 21

**Community 21** — 9 nodes

## Nodes

### card.tsx
- **ID:** `apps_frontend_src_components_ui_card_tsx`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L1
- **Outbound:**
  - → `Card` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CardHeader` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CardTitle` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CardDescription` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CardContent` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CardFooter` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`imports_from`_ | c0]
  - ↔ `utils.ts` [_`imports_from`_ | c40]
  - ↔ `cn()` [_`imports`_ | c0]

### Card
- **ID:** `ui_card_card`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L4
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`imports`_ | c0]

### CardContent
- **ID:** `ui_card_cardcontent`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L28
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`imports`_ | c0]

### CardHeader
- **ID:** `ui_card_cardheader`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L13
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`imports`_ | c0]

### CardTitle
- **ID:** `ui_card_cardtitle`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L18
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`imports`_ | c0]

### SummaryCard()
- **ID:** `dashboard_summarycard_summarycard`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/SummaryCard.tsx` @ L10
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`contains`_ | c0]

### SummaryCardProps
- **ID:** `dashboard_summarycard_summarycardprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/dashboard/SummaryCard.tsx` @ L4
- **Cross-community:**
  - ↔ `SummaryCard.tsx` [_`contains`_ | c0]

### CardDescription
- **ID:** `ui_card_carddescription`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L23

### CardFooter
- **ID:** `ui_card_cardfooter`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/card.tsx` @ L33
