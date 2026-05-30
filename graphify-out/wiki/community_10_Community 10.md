# Community 10

**Community 10** — 21 nodes

## Nodes

### MenuImportService
- **ID:** `menu_import_menu_import_service_menuimportservice`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L10
- **Outbound:**
  - → `.checkOwnership()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.upsertMenu()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getOrCreateApiKey()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.revealApiKey()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.regenerateApiKey()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.generateKey()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.maskKey()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `menu-import.module.ts` [_`imports`_ | c15]
  - ↔ `menu-import.service.spec.ts` [_`imports`_ | c9]
  - ↔ `menu-import.service.ts` [_`contains`_ | c9]
  - ↔ `.constructor()` [_`method`_ | c9]
  - ↔ `.exportMenu()` [_`method`_ | c9]

### menu-import.controller.ts
- **ID:** `apps_backend_src_menu_import_menu_import_controller_ts`
- **Type:** code
- **Degree:** 10
- **Source:** `apps/backend/src/menu-import/menu-import.controller.ts` @ L1
- **Outbound:**
  - → `MenuImportService` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `ImportMenuDto` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `ApiKeyGuard` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `JwtAuthGuard` [_`imports`_ | c38]
  - ↔ `menu-import.service.ts` [_`imports_from`_ | c9]
  - ↔ `import-menu.dto.ts` [_`imports_from`_ | c9]
  - ↔ `api-key.guard.ts` [_`imports_from`_ | c9]

### ApiKeyGuard
- **ID:** `guards_api_key_guard_apikeyguard`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu-import/guards/api-key.guard.ts` @ L5
- **Outbound:**
  - → `.canActivate()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `menu-import.module.ts` [_`imports`_ | c15]
  - ↔ `api-key.guard.spec.ts` [_`imports`_ | c9]
  - ↔ `api-key.guard.ts` [_`contains`_ | c9]
  - ↔ `.constructor()` [_`method`_ | c9]

### ImportMenuDto
- **ID:** `dto_import_menu_dto_importmenudto`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/menu-import/dto/import-menu.dto.ts` @ L115
- **Cross-community:**
  - ↔ `menu-import.service.ts` [_`imports`_ | c9]
  - ↔ `import-menu.dto.ts` [_`contains`_ | c9]
  - ↔ `super-admin.controller.ts` [_`imports`_ | c113]
  - ↔ `super-admin.service.ts` [_`imports`_ | c9]

### .checkOwnership()
- **ID:** `menu_import_menu_import_service_menuimportservice_checkownership`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L15
- **Outbound:**
  - → `.getOrCreateApiKey()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.revealApiKey()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.regenerateApiKey()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.exportMenu()` [_`calls`_ | c9]

### .generateKey()
- **ID:** `menu_import_menu_import_service_menuimportservice_generatekey`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L250

### .getOrCreateApiKey()
- **ID:** `menu_import_menu_import_service_menuimportservice_getorcreateapikey`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L206
- **Outbound:**
  - → `.maskKey()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.generateKey()` [_`calls`_ | EXTRACTED | score: 1.0]

### MenuImportModule
- **ID:** `menu_import_menu_import_module_menuimportmodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/menu-import/menu-import.module.ts` @ L13
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `menu-import.module.ts` [_`contains`_ | c15]
  - ↔ `super-admin.module.ts` [_`imports`_ | c15]

### .regenerateApiKey()
- **ID:** `menu_import_menu_import_service_menuimportservice_regenerateapikey`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L240
- **Outbound:**
  - → `.generateKey()` [_`calls`_ | EXTRACTED | score: 1.0]

### .revealApiKey()
- **ID:** `menu_import_menu_import_service_menuimportservice_revealapikey`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L223
- **Outbound:**
  - → `.generateKey()` [_`calls`_ | EXTRACTED | score: 1.0]

### .maskKey()
- **ID:** `menu_import_menu_import_service_menuimportservice_maskkey`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L254

### ImportCategoryDto
- **ID:** `dto_import_menu_dto_importcategorydto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/dto/import-menu.dto.ts` @ L85
- **Cross-community:**
  - ↔ `import-menu.dto.ts` [_`contains`_ | c9]

### ImportChoiceDto
- **ID:** `dto_import_menu_dto_importchoicedto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/dto/import-menu.dto.ts` @ L4
- **Cross-community:**
  - ↔ `import-menu.dto.ts` [_`contains`_ | c9]

### ImportItemDto
- **ID:** `dto_import_menu_dto_importitemdto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/dto/import-menu.dto.ts` @ L32
- **Cross-community:**
  - ↔ `import-menu.dto.ts` [_`contains`_ | c9]

### ImportOptionDto
- **ID:** `dto_import_menu_dto_importoptiondto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/dto/import-menu.dto.ts` @ L17
- **Cross-community:**
  - ↔ `import-menu.dto.ts` [_`contains`_ | c9]

### .canActivate()
- **ID:** `guards_api_key_guard_apikeyguard_canactivate`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/guards/api-key.guard.ts` @ L8

### .getApiKey()
- **ID:** `menu_import_menu_import_controller_menuimportcontroller_getapikey`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/menu-import.controller.ts` @ L57
- **Cross-community:**
  - ↔ `MenuImportController` [_`method`_ | c111]

### .importConfirm()
- **ID:** `menu_import_menu_import_controller_menuimportcontroller_importconfirm`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/menu-import.controller.ts` @ L41
- **Cross-community:**
  - ↔ `MenuImportController` [_`method`_ | c111]

### .importFromOcr()
- **ID:** `menu_import_menu_import_controller_menuimportcontroller_importfromocr`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/menu-import.controller.ts` @ L28
- **Cross-community:**
  - ↔ `MenuImportController` [_`method`_ | c111]

### .upsertMenu()
- **ID:** `menu_import_menu_import_service_menuimportservice_upsertmenu`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L25

### VALID_AVAILABILITY
- **ID:** `menu_import_menu_import_service_valid_availability`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu-import/menu-import.service.ts` @ L7
- **Cross-community:**
  - ↔ `menu-import.service.ts` [_`contains`_ | c9]
