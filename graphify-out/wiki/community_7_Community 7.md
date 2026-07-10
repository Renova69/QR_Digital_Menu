# Community 7

**Community 7** — 29 nodes

## Nodes

### MenuCrudService

- **ID:** `menu_menu_crud_service_menucrudservice`
- **Type:** code
- **Degree:** 30
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L21
- **Outbound:**
  - → `.checkRestaurantOwnership()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.findAllCategories()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.removeCategory()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.updateCategoryImage()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.findAllItemsInCategory()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.updateItemImage()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.removeItem()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.removeMenuOption()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `public-menu.controller.ts` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `category.controller.ts` [_`imports`_ | c61]
  - ↔ `item.controller.ts` [_`imports`_ | c73]
  - ↔ `menu-crud.service.spec.ts` [_`imports`_ | c72]
  - ↔ `menu-crud.service.ts` [_`contains`_ | c73]
  - ↔ `.constructor()` [_`method`_ | c26]

### .checkRestaurantOwnership()

- **ID:** `menu_menu_crud_service_menucrudservice_checkrestaurantownership`
- **Type:** code
- **Degree:** 16
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L318
- **Outbound:**
  - → `.findAllCategories()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.removeCategory()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.updateCategoryImage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.findAllItemsInCategory()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.updateItemImage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.removeItem()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.removeMenuOption()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.createCategory()` [_`calls`_ | c26]
  - ↔ `.updateCategory()` [_`calls`_ | c26]
  - ↔ `.updateCategoryOrder()` [_`calls`_ | c26]
  - ↔ `.createItem()` [_`calls`_ | c26]
  - ↔ `.updateItem()` [_`calls`_ | c26]

### useMenu.ts

- **ID:** `apps_frontend_src_hooks_usemenu_ts`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/frontend/src/hooks/useMenu.ts` @ L1
- **Outbound:**
  - → `getCategories()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `updateCategory()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `deleteCategory()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `getItems()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `createItem()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `updateItem()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `deleteItem()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `uploadItemImage()` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `MenuContext.tsx` [_`imports_from`_ | c45]
  - ↔ `menuService.ts` [_`imports_from`_ | c45]
  - ↔ `createCategory()` [_`imports`_ | c45]
  - ↔ `index.ts` [_`imports_from`_ | c49]
  - ↔ `Category` [_`imports`_ | c45]

### public-menu.controller.ts

- **ID:** `apps_backend_src_menu_public_menu_controller_ts`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/menu/public-menu.controller.ts` @ L1
- **Cross-community:**
  - ↔ `jwt-auth.guard.ts` [_`imports_from`_ | c38]
  - ↔ `JwtAuthGuard` [_`imports`_ | c38]
  - ↔ `menu-crud.service.ts` [_`imports_from`_ | c73]
  - ↔ `menu.module.ts` [_`imports_from`_ | c37]
  - ↔ `PublicMenuController` [_`contains`_ | c114]

### CreateMenuOptionDto

- **ID:** `dto_create_menu_option_dto_createmenuoptiondto`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/menu/dto/create-menu-option.dto.ts` @ L4
- **Cross-community:**
  - ↔ `menu-crud.service.ts` [_`imports`_ | c73]
  - ↔ `menu-option.controller.ts` [_`imports`_ | c73]
  - ↔ `create-menu-option.dto.ts` [_`contains`_ | c73]
  - ↔ `update-menu-option.dto.ts` [_`imports`_ | c73]

### UpdateMenuOptionDto

- **ID:** `dto_update_menu_option_dto_updatemenuoptiondto`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/menu/dto/update-menu-option.dto.ts` @ L4
- **Cross-community:**
  - ↔ `menu-crud.service.ts` [_`imports`_ | c73]
  - ↔ `menu-option.controller.ts` [_`imports`_ | c73]
  - ↔ `update-menu-option.dto.ts` [_`contains`_ | c73]

### getTrendingItems()

- **ID:** `lib_api_gettrendingitems`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L41
- **Cross-community:**
  - ↔ `TrendingCarousel.tsx` [_`imports`_ | c21]
  - ↔ `api.ts` [_`contains`_ | c3]

### .findAllCategories()

- **ID:** `menu_menu_crud_service_menucrudservice_findallcategories`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L382

### .findAllItemsInCategory()

- **ID:** `menu_menu_crud_service_menucrudservice_findallitemsincategory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L561

### .removeCategory()

- **ID:** `menu_menu_crud_service_menucrudservice_removecategory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L458

### .removeItem()

- **ID:** `menu_menu_crud_service_menucrudservice_removeitem`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L678

### .removeMenuOption()

- **ID:** `menu_menu_crud_service_menucrudservice_removemenuoption`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L859

### .updateCategoryImage()

- **ID:** `menu_menu_crud_service_menucrudservice_updatecategoryimage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L471

### .updateItemImage()

- **ID:** `menu_menu_crud_service_menucrudservice_updateitemimage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/menu/menu-crud.service.ts` @ L642

### createItem()

- **ID:** `services_menuservice_createitem`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L54
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### deleteCategory()

- **ID:** `services_menuservice_deletecategory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L35
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### deleteItem()

- **ID:** `services_menuservice_deleteitem`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L74
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### getCategories()

- **ID:** `services_menuservice_getcategories`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L15
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### getItems()

- **ID:** `services_menuservice_getitems`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L83
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### updateCategory()

- **ID:** `services_menuservice_updatecategory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L25
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### updateItem()

- **ID:** `services_menuservice_updateitem`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L64
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### updateItemOrder()

- **ID:** `services_menuservice_updateitemorder`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L93
- **Cross-community:**
  - ↔ `MenuEditorPage.tsx` [_`imports`_ | c50]
  - ↔ `menuService.ts` [_`contains`_ | c45]

### uploadCategoryImage()

- **ID:** `services_menuservice_uploadcategoryimage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L114
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `menuService.ts` [_`contains`_ | c45]

### uploadItemImage()

- **ID:** `services_menuservice_uploaditemimage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L102
- **Cross-community:**
  - ↔ `menuService.ts` [_`contains`_ | c45]

### Currency

- **ID:** `dto_create_item_dto_currency`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/dto/create-item.dto.ts` @ L12
- **Cross-community:**
  - ↔ `create-item.dto.ts` [_`contains`_ | c73]

### .getAllMenuData()

- **ID:** `menu_public_menu_controller_publicmenucontroller_getallmenudata`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/public-menu.controller.ts` @ L12
- **Cross-community:**
  - ↔ `PublicMenuController` [_`method`_ | c114]

### .testRoute()

- **ID:** `menu_public_menu_controller_publicmenucontroller_testroute`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/menu/public-menu.controller.ts` @ L53
- **Cross-community:**
  - ↔ `PublicMenuController` [_`method`_ | c114]
