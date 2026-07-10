# Community 29

**Community 29** — 6 nodes

## Nodes

### colors.ts

- **ID:** `apps_frontend_src_utils_colors_ts`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/utils/colors.ts` @ L1
- **Outbound:**
  - → `hexToRgb()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getLuminance()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getContrastRatio()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `getContrastStatus()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `BrandingPreview.tsx` [_`imports_from`_ | c5]
  - ↔ `ColorSchemeEditor.tsx` [_`imports_from`_ | c5]
  - ↔ `BrandingEditor.tsx` [_`imports_from`_ | c5]
  - ↔ `PublicMenuPage.tsx` [_`imports_from`_ | c35]
  - ↔ `getReadableTextColor()` [_`contains`_ | c5]

### getContrastStatus()

- **ID:** `utils_colors_getcontraststatus`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/utils/colors.ts` @ L44
- **Cross-community:**
  - ↔ `ColorSchemeEditor.tsx` [_`imports`_ | c5]
  - ↔ `ContrastBadge()` [_`calls`_ | c5]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]
  - ↔ `paletteContrastOk()` [_`calls`_ | c5]

### getContrastRatio()

- **ID:** `utils_colors_getcontrastratio`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/utils/colors.ts` @ L29
- **Outbound:**
  - → `getContrastStatus()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `getReadableTextColor()` [_`calls`_ | c5]

### ColorSchemeEditor()

- **ID:** `branding_colorschemeeditor_colorschemeeditor`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/branding/ColorSchemeEditor.tsx` @ L109
- **Cross-community:**
  - ↔ `ColorSchemeEditor.tsx` [_`contains`_ | c5]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]
  - ↔ `getReadableTextColor()` [_`calls`_ | c5]

### getLuminance()

- **ID:** `utils_colors_getluminance`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/utils/colors.ts` @ L21
- **Outbound:**
  - → `getContrastRatio()` [_`calls`_ | EXTRACTED | score: 1.0]

### hexToRgb()

- **ID:** `utils_colors_hextorgb`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/utils/colors.ts` @ L6
- **Outbound:**
  - → `getContrastRatio()` [_`calls`_ | EXTRACTED | score: 1.0]
