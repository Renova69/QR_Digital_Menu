# Community 8

**Community 8** — 24 nodes

## Nodes

### usePos()

- **ID:** `context_poscontext_usepos`
- **Type:** code
- **Degree:** 17
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L188
- **Outbound:**
  - → `PosPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`imports`_ | c2]
  - ↔ `PosItemCard.tsx` [_`imports`_ | c2]
  - ↔ `PosOptionsDrawer.tsx` [_`imports`_ | c2]
  - ↔ `PosQRBill.tsx` [_`imports`_ | c2]
  - ↔ `PosTableModal.tsx` [_`imports`_ | c3]

### PosContext.tsx

- **ID:** `apps_frontend_src_context_poscontext_tsx`
- **Type:** code
- **Degree:** 16
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L1
- **Outbound:**
  - → `generateId()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PosCartItem` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PosSession` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PosContextType` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PosContext` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `PosProvider()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `usePos()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.tsx` [_`imports_from`_ | c22]
  - ↔ `PosCartDrawer.tsx` [_`imports_from`_ | c2]
  - ↔ `PosItemCard.tsx` [_`imports_from`_ | c2]
  - ↔ `PosOptionsDrawer.tsx` [_`imports_from`_ | c2]
  - ↔ `PosQRBill.tsx` [_`imports_from`_ | c2]

### PosSeatSelector.tsx

- **ID:** `apps_frontend_src_components_pos_posseatselector_tsx`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/components/pos/PosSeatSelector.tsx` @ L1
- **Outbound:**
  - → `PosContext.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `usePos()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `PosSeatSelector()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `SEAT_KEYS` [_`contains`_ | c2]
  - ↔ `SEAT_LABEL_KEYS` [_`contains`_ | c2]
  - ↔ `PosPage.tsx` [_`imports_from`_ | c2]

### PosPage()

- **ID:** `pos_pospage_pospage`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/pages/pos/PosPage.tsx` @ L36
- **Cross-community:**
  - ↔ `useAuth()` [_`calls`_ | c7]
  - ↔ `useFeature()` [_`calls`_ | c8]
  - ↔ `useIdleTimer()` [_`calls`_ | c2]
  - ↔ `PosPage.tsx` [_`contains`_ | c2]

### PosTopBar.tsx

- **ID:** `apps_frontend_src_components_pos_postopbar_tsx`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/pos/PosTopBar.tsx` @ L1
- **Outbound:**
  - → `PosContext.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `usePos()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `PosTopBar()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosPage.tsx` [_`imports_from`_ | c2]

### MenuOption

- **ID:** `types_index_menuoption`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/types/index.ts` @ L20
- **Cross-community:**
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]
  - ↔ `ManageOptionsModal.tsx` [_`imports`_ | c57]
  - ↔ `index.ts` [_`contains`_ | c49]

### PosProvider()

- **ID:** `context_poscontext_posprovider`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L66
- **Cross-community:**
  - ↔ `App.tsx` [_`imports`_ | c22]

### PosCartDrawer()

- **ID:** `pos_poscartdrawer_poscartdrawer`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosCartDrawer.tsx` @ L22
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`contains`_ | c2]

### PosItemCard()

- **ID:** `pos_positemcard_positemcard`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosItemCard.tsx` @ L21
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosItemCard.tsx` [_`contains`_ | c2]

### PosOptionsDrawer()

- **ID:** `pos_posoptionsdrawer_posoptionsdrawer`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosOptionsDrawer.tsx` @ L21
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosOptionsDrawer.tsx` [_`contains`_ | c2]

### PosQRBill()

- **ID:** `pos_posqrbill_posqrbill`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosQRBill.tsx` @ L4
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `PosQRBill.tsx` [_`contains`_ | c2]

### PosSeatSelector()

- **ID:** `pos_posseatselector_posseatselector`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosSeatSelector.tsx` @ L13
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]

### PosTopBar()

- **ID:** `pos_postopbar_postopbar`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/pos/PosTopBar.tsx` @ L5
- **Outbound:**
  - → `usePos()` [_`calls`_ | EXTRACTED | score: 1.0]

### generateId()

- **ID:** `context_poscontext_generateid`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L9

### PosCartItem

- **ID:** `context_poscontext_poscartitem`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L20

### PosContext

- **ID:** `context_poscontext_poscontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L64

### PosContextType

- **ID:** `context_poscontext_poscontexttype`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L44

### PosSession

- **ID:** `context_poscontext_possession`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/PosContext.tsx` @ L37

### PosCategoryFilter()

- **ID:** `pos_poscategoryfilter_poscategoryfilter`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosCategoryFilter.tsx` @ L14
- **Cross-community:**
  - ↔ `PosCategoryFilter.tsx` [_`contains`_ | c2]

### PosItemCardProps

- **ID:** `pos_positemcard_positemcardprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosItemCard.tsx` @ L12
- **Cross-community:**
  - ↔ `PosItemCard.tsx` [_`contains`_ | c2]

### PosItemGrid()

- **ID:** `pos_positemgrid_positemgrid`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosItemGrid.tsx` @ L25
- **Cross-community:**
  - ↔ `PosItemGrid.tsx` [_`contains`_ | c2]

### PosItemGridProps

- **ID:** `pos_positemgrid_positemgridprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosItemGrid.tsx` @ L19
- **Cross-community:**
  - ↔ `PosItemGrid.tsx` [_`contains`_ | c2]

### MenuItem

- **ID:** `pos_pospage_menuitem`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/pos/PosPage.tsx` @ L17
- **Cross-community:**
  - ↔ `PosPage.tsx` [_`contains`_ | c2]
