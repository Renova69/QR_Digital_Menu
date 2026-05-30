# Community 0

**Community 0** — 92 nodes

## Nodes

### cn()
- **ID:** `lib_utils_cn`
- **Type:** code
- **Degree:** 25
- **Source:** `apps/frontend/src/lib/utils.ts` @ L4
- **Cross-community:**
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]
  - ↔ `BillingView.tsx` [_`imports`_ | c16]
  - ↔ `SummaryCard()` [_`calls`_ | c0]
  - ↔ `TableCard.tsx` [_`imports`_ | c0]
  - ↔ `TableCard()` [_`calls`_ | c0]

### button.tsx
- **ID:** `apps_frontend_src_components_ui_button_tsx`
- **Type:** code
- **Degree:** 24
- **Source:** `apps/frontend/src/components/ui/button.tsx` @ L1
- **Outbound:**
  - → `utils.ts` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `cn()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `buttonVariants` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `ButtonProps` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Button` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `HomePage.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`imports_from`_ | c23]
  - ↔ `CategoryList.tsx` [_`imports_from`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports_from`_ | c40]

### Button
- **ID:** `ui_button_button`
- **Type:** code
- **Degree:** 20
- **Source:** `apps/frontend/src/components/ui/button.tsx` @ L39
- **Outbound:**
  - → `HomePage.tsx` [_`imports`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`imports`_ | c23]
  - ↔ `CategoryList.tsx` [_`imports`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]

### utils.ts
- **ID:** `apps_frontend_src_lib_utils_ts`
- **Type:** code
- **Degree:** 16
- **Source:** `apps/frontend/src/lib/utils.ts` @ L1
- **Outbound:**
  - → `cn()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `ItemWithOptions.tsx` [_`imports_from`_ | c21]
  - ↔ `BillingView.tsx` [_`imports_from`_ | c16]
  - ↔ `TableCard.tsx` [_`imports_from`_ | c0]
  - ↔ `TableDetailModal.tsx` [_`imports_from`_ | c0]
  - ↔ `TableView.tsx` [_`imports_from`_ | c27]

### ItemList.tsx
- **ID:** `apps_frontend_src_components_menu_itemlist_tsx`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/frontend/src/components/menu/ItemList.tsx` @ L1
- **Outbound:**
  - → `useMenuContext()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `SortableItem()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `button.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `Button` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `ManageOptionsModal()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `Item` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `ItemList()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `ItemRow()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `EditItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `MenuContext.tsx` [_`imports_from`_ | c45]
  - ↔ `SortableItem.tsx` [_`imports_from`_ | c50]
  - ↔ `ManageOptionsModal.tsx` [_`imports_from`_ | c57]
  - ↔ `index.ts` [_`imports_from`_ | c49]

### useCart()
- **ID:** `context_cartcontext_usecart`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/frontend/src/context/CartContext.tsx` @ L181
- **Outbound:**
  - → `CheckoutPage()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `PublicMenuPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.test.tsx` [_`imports`_ | c10]
  - ↔ `CartConsumer()` [_`calls`_ | c10]
  - ↔ `CartIcon.tsx` [_`imports`_ | c63]
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]
  - ↔ `CartContext.tsx` [_`contains`_ | c63]

### useMenuContext()
- **ID:** `context_menucontext_usemenucontext`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/frontend/src/context/MenuContext.tsx` @ L204
- **Outbound:**
  - → `MenuEditorPage()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CategoryList.tsx` [_`imports`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports`_ | c57]
  - ↔ `CreateCategoryForm()` [_`calls`_ | c50]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]

### HomePage.tsx
- **ID:** `apps_frontend_src_pages_homepage_tsx`
- **Type:** code
- **Degree:** 14
- **Source:** `apps/frontend/src/pages/HomePage.tsx` @ L1
- **Outbound:**
  - → `HomePage()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.tsx` [_`imports_from`_ | c22]
  - ↔ `TierKey` [_`contains`_ | c23]
  - ↔ `Plan` [_`contains`_ | c23]
  - ↔ `FeatureRow` [_`contains`_ | c23]
  - ↔ `featureCards` [_`contains`_ | c23]

### input.tsx
- **ID:** `apps_frontend_src_components_ui_input_tsx`
- **Type:** code
- **Degree:** 12
- **Source:** `apps/frontend/src/components/ui/input.tsx` @ L1
- **Outbound:**
  - → `utils.ts` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `cn()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `InputProps` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Input` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`imports_from`_ | c23]
  - ↔ `CategoryList.tsx` [_`imports_from`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports_from`_ | c40]

### CartDrawer.tsx
- **ID:** `apps_frontend_src_components_cart_cartdrawer_tsx`
- **Type:** code
- **Degree:** 11
- **Source:** `apps/frontend/src/components/cart/CartDrawer.tsx` @ L1
- **Outbound:**
  - → `useCart()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `button.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `Button` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `resolveItemName()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `CartDrawer()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`imports_from`_ | c63]
  - ↔ `index.ts` [_`imports_from`_ | c49]
  - ↔ `Category` [_`imports`_ | c45]
  - ↔ `currency.ts` [_`imports_from`_ | c21]
  - ↔ `formatInlineDual()` [_`imports`_ | c21]

### modal.tsx
- **ID:** `apps_frontend_src_components_ui_modal_tsx`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/components/ui/modal.tsx` @ L1
- **Outbound:**
  - → `ModalProps` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Modal()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `ManageOptionsModal.tsx` [_`imports_from`_ | c57]

### ItemWithOptions()
- **ID:** `menu_itemwithoptions_itemwithoptions`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/components/menu/ItemWithOptions.tsx` @ L19
- **Outbound:**
  - → `useCart()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.createPortal()` [_`calls`_ | c78]
  - ↔ `ItemWithOptions.tsx` [_`contains`_ | c21]
  - ↔ `TrendingCarousel.tsx` [_`imports`_ | c21]
  - ↔ `PublicMenuPage.tsx` [_`imports`_ | c35]
  - ↔ `getTranslatedField()` [_`calls`_ | c21]

### Item
- **ID:** `types_index_item`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/types/index.ts` @ L29
- **Cross-community:**
  - ↔ `EditItemForm.tsx` [_`imports`_ | c40]
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]
  - ↔ `ManageOptionsModal.tsx` [_`imports`_ | c57]
  - ↔ `TrendingCarousel.tsx` [_`imports`_ | c21]
  - ↔ `MenuContext.tsx` [_`imports`_ | c45]

### Input
- **ID:** `ui_input_input`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/components/ui/input.tsx` @ L7
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`imports`_ | c23]
  - ↔ `CategoryList.tsx` [_`imports`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]

### useToast()
- **ID:** `ui_toast_usetoast`
- **Type:** code
- **Degree:** 9
- **Source:** `apps/frontend/src/components/ui/toast.tsx` @ L61
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports`_ | c40]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]

### textarea.tsx
- **ID:** `apps_frontend_src_components_ui_textarea_tsx`
- **Type:** code
- **Degree:** 8
- **Source:** `apps/frontend/src/components/ui/textarea.tsx` @ L1
- **Outbound:**
  - → `utils.ts` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `cn()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `TextareaProps` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Textarea` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CreateItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `CheckoutPage.tsx` [_`imports_from`_ | c117]
  - ↔ `FeedbackPage.tsx` [_`imports_from`_ | c23]

### Modal()
- **ID:** `ui_modal_modal`
- **Type:** code
- **Degree:** 8
- **Source:** `apps/frontend/src/components/ui/modal.tsx` @ L14
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateCategoryForm.tsx` [_`imports`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports`_ | c40]
  - ↔ `ManageOptionsModal.tsx` [_`imports`_ | c57]

### toast.tsx
- **ID:** `apps_frontend_src_components_ui_toast_tsx`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/frontend/src/components/ui/toast.tsx` @ L1
- **Outbound:**
  - → `ToastProps` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `Toast()` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `useToast()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports_from`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports_from`_ | c40]
  - ↔ `BrandingEditor.tsx` [_`imports_from`_ | c5]

### PublicMenuPage()
- **ID:** `pages_publicmenupage_publicmenupage`
- **Type:** code
- **Degree:** 7
- **Source:** `apps/frontend/src/pages/PublicMenuPage.tsx` @ L89
- **Cross-community:**
  - ↔ `useAuth()` [_`calls`_ | c7]
  - ↔ `hasTierFeature()` [_`calls`_ | c35]
  - ↔ `PublicMenuPage.tsx` [_`contains`_ | c35]
  - ↔ `resolvePublicPalette()` [_`calls`_ | c35]
  - ↔ `hexToRgba()` [_`calls`_ | c35]

### index.tsx
- **ID:** `apps_frontend_src_index_tsx`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/index.tsx` @ L1
- **Outbound:**
  - → `queryClient` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `container` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `root` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.tsx` [_`imports_from`_ | c22]
  - ↔ `reportWebVitals.js` [_`imports_from`_ | c116]

### CheckoutPage()
- **ID:** `pages_checkoutpage_checkoutpage`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/pages/CheckoutPage.tsx` @ L64
- **Cross-community:**
  - ↔ `useAuth()` [_`calls`_ | c7]
  - ↔ `hasTierFeature()` [_`calls`_ | c35]
  - ↔ `formatEuro()` [_`calls`_ | c21]
  - ↔ `formatBgn()` [_`calls`_ | c21]
  - ↔ `CheckoutPage.tsx` [_`contains`_ | c117]

### TableView()
- **ID:** `tables_tableview_tableview`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/frontend/src/components/tables/TableView.tsx` @ L60
- **Outbound:**
  - → `cn()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `getQrCodeUrl()` [_`calls`_ | c27]
  - ↔ `TableView.tsx` [_`contains`_ | c27]
  - ↔ `normalizeTableName()` [_`calls`_ | c27]
  - ↔ `useTier()` [_`calls`_ | c8]
  - ↔ `useAuth()` [_`calls`_ | c7]

### Cart.tsx
- **ID:** `apps_frontend_src_components_menu_cart_tsx`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/menu/Cart.tsx` @ L1
- **Outbound:**
  - → `useCart()` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `button.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]
  - → `Button` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `Cart()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`imports_from`_ | c63]

### CustomerLoginModal()
- **ID:** `auth_customerloginmodal_customerloginmodal`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/auth/CustomerLoginModal.tsx` @ L31
- **Cross-community:**
  - ↔ `.createPortal()` [_`calls`_ | c78]
  - ↔ `CustomerLoginModal.tsx` [_`contains`_ | c23]
  - ↔ `CheckoutPage.tsx` [_`imports`_ | c117]
  - ↔ `PublicMenuPage.tsx` [_`imports`_ | c35]
  - ↔ `useAuth()` [_`calls`_ | c7]

### CategorySettingsModal()
- **ID:** `menu_categorysettingsmodal_categorysettingsmodal`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/menu/CategorySettingsModal.tsx` @ L21
- **Outbound:**
  - → `useMenuContext()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `useToast()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CategoryList.tsx` [_`imports`_ | c50]
  - ↔ `CategorySettingsModal.tsx` [_`contains`_ | c57]
  - ↔ `useFeature()` [_`calls`_ | c8]

### BrandingEditor()
- **ID:** `ui_brandingeditor_brandingeditor`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/ui/BrandingEditor.tsx` @ L111
- **Outbound:**
  - → `useToast()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `BrandingEditor.tsx` [_`contains`_ | c5]
  - ↔ `paletteEqual()` [_`calls`_ | c5]
  - ↔ `paletteContrastOk()` [_`calls`_ | c5]
  - ↔ `SettingsView.tsx` [_`imports`_ | c8]

### ImageUploadInput()
- **ID:** `ui_imageuploadinput_imageuploadinput`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/ui/ImageUploadInput.tsx` @ L28
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports`_ | c40]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]
  - ↔ `ImageUploadInput.tsx` [_`contains`_ | c40]

### Textarea
- **ID:** `ui_textarea_textarea`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/frontend/src/components/ui/textarea.tsx` @ L7
- **Cross-community:**
  - ↔ `CreateItemForm.tsx` [_`imports`_ | c40]
  - ↔ `EditItemForm.tsx` [_`imports`_ | c40]
  - ↔ `CheckoutPage.tsx` [_`imports`_ | c117]
  - ↔ `FeedbackPage.tsx` [_`imports`_ | c23]

### CartDrawer()
- **ID:** `cart_cartdrawer_cartdrawer`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/cart/CartDrawer.tsx` @ L29
- **Outbound:**
  - → `useCart()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `.createPortal()` [_`calls`_ | c78]
  - ↔ `formatInlineDual()` [_`calls`_ | c21]

### CreateItemForm()
- **ID:** `menu_createitemform_createitemform`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/menu/CreateItemForm.tsx` @ L11
- **Outbound:**
  - → `useMenuContext()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `useToast()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CreateItemForm.tsx` [_`contains`_ | c40]
  - ↔ `MenuEditorPage.tsx` [_`imports`_ | c50]

### EditItemForm()
- **ID:** `menu_edititemform_edititemform`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/frontend/src/components/menu/EditItemForm.tsx` @ L16
- **Outbound:**
  - → `ItemList.tsx` [_`imports`_ | EXTRACTED | score: 1.0]
  - → `useMenuContext()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `useToast()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `EditItemForm.tsx` [_`contains`_ | c40]

### BrandingPreview()
- **ID:** `branding_brandingpreview_brandingpreview`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/branding/BrandingPreview.tsx` @ L26
- **Cross-community:**
  - ↔ `BrandingPreview.tsx` [_`contains`_ | c5]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]
  - ↔ `getReadableTextColor()` [_`calls`_ | c5]

### MenuProvider()
- **ID:** `context_menucontext_menuprovider`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/context/MenuContext.tsx` @ L63
- **Outbound:**
  - → `useMenu()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `App.tsx` [_`imports`_ | c22]
  - ↔ `MenuContext.tsx` [_`contains`_ | c45]

### useMenu()
- **ID:** `hooks_usemenu_usemenu`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/hooks/useMenu.ts` @ L15
- **Cross-community:**
  - ↔ `MenuContext.tsx` [_`imports`_ | c45]
  - ↔ `useMenu.ts` [_`contains`_ | c45]

### CategoryList()
- **ID:** `menu_categorylist_categorylist`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/menu/CategoryList.tsx` @ L13
- **Outbound:**
  - → `useMenuContext()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CategoryList.tsx` [_`contains`_ | c50]
  - ↔ `MenuEditorPage.tsx` [_`imports`_ | c50]

### ImageLightbox()
- **ID:** `menu_imagelightbox_imagelightbox`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/menu/ImageLightbox.tsx` @ L10
- **Cross-community:**
  - ↔ `.createPortal()` [_`calls`_ | c78]
  - ↔ `ImageLightbox.tsx` [_`contains`_ | c78]
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]

### ItemList()
- **ID:** `menu_itemlist_itemlist`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/menu/ItemList.tsx` @ L12
- **Outbound:**
  - → `useMenuContext()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `MenuEditorPage.tsx` [_`imports`_ | c50]

### MenuEditorPage()
- **ID:** `pages_menueditorpage_menueditorpage`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/pages/MenuEditorPage.tsx` @ L27
- **Cross-community:**
  - ↔ `useAuth()` [_`calls`_ | c7]
  - ↔ `MenuEditorPage.tsx` [_`contains`_ | c50]

### PrintableQRCodes()
- **ID:** `tables_printableqrcodes_printableqrcodes`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/tables/PrintableQRCodes.tsx` @ L162
- **Cross-community:**
  - ↔ `.createPortal()` [_`calls`_ | c78]
  - ↔ `PrintableQRCodes.tsx` [_`contains`_ | c27]
  - ↔ `resolveLogoUrl()` [_`calls`_ | c27]

### SortableItem()
- **ID:** `ui_sortableitem_sortableitem`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/frontend/src/components/ui/SortableItem.tsx` @ L11
- **Cross-community:**
  - ↔ `CategoryList.tsx` [_`imports`_ | c50]
  - ↔ `SortableItem.tsx` [_`contains`_ | c50]

### i18n.ts
- **ID:** `apps_frontend_src_i18n_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/i18n.ts` @ L1
- **Outbound:**
  - → `resources` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `index.tsx` [_`imports_from`_ | EXTRACTED | score: 1.0]

### FontPicker()
- **ID:** `branding_fontpicker_fontpicker`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/branding/FontPicker.tsx` @ L33
- **Cross-community:**
  - ↔ `FontPicker.tsx` [_`contains`_ | c5]
  - ↔ `BrandingEditor.tsx` [_`imports`_ | c5]

### CartIcon()
- **ID:** `cart_carticon_carticon`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/cart/CartIcon.tsx` @ L14
- **Outbound:**
  - → `useCart()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `CartIcon.tsx` [_`contains`_ | c63]

### Cart()
- **ID:** `menu_cart_cart`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/menu/Cart.tsx` @ L5
- **Outbound:**
  - → `useCart()` [_`calls`_ | EXTRACTED | score: 1.0]

### ManageOptionsModal()
- **ID:** `menu_manageoptionsmodal_manageoptionsmodal`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/menu/ManageOptionsModal.tsx` @ L52
- **Cross-community:**
  - ↔ `ManageOptionsModal.tsx` [_`contains`_ | c57]

### TrendingCarousel()
- **ID:** `menu_trendingcarousel_trendingcarousel`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/components/menu/TrendingCarousel.tsx` @ L13
- **Cross-community:**
  - ↔ `TrendingCarousel.tsx` [_`contains`_ | c21]
  - ↔ `PublicMenuPage.tsx` [_`imports`_ | c35]

### CustomerProfilePage()
- **ID:** `pages_customerprofilepage_customerprofilepage`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/pages/CustomerProfilePage.tsx` @ L9
- **Cross-community:**
  - ↔ `useAuth()` [_`calls`_ | c7]
  - ↔ `CustomerProfilePage.tsx` [_`contains`_ | c7]

### createCategory()
- **ID:** `services_menuservice_createcategory`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/services/menuService.ts` @ L5
- **Cross-community:**
  - ↔ `useMenu.ts` [_`imports`_ | c45]
  - ↔ `menuService.ts` [_`contains`_ | c45]

### AvailabilityType
- **ID:** `types_index_availabilitytype`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/types/index.ts` @ L47
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`imports`_ | c57]
  - ↔ `index.ts` [_`contains`_ | c49]

### OptionChoice
- **ID:** `types_index_optionchoice`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/types/index.ts` @ L15
- **Cross-community:**
  - ↔ `ItemWithOptions.tsx` [_`imports`_ | c21]
  - ↔ `index.ts` [_`contains`_ | c49]

### Channel
- **ID:** `auth_customerloginmodal_channel`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/auth/CustomerLoginModal.tsx` @ L16
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`contains`_ | c23]

### COUNTRIES
- **ID:** `auth_customerloginmodal_countries`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/auth/CustomerLoginModal.tsx` @ L18
- **Cross-community:**
  - ↔ `CustomerLoginModal.tsx` [_`contains`_ | c23]

### BrandingPreviewProps
- **ID:** `branding_brandingpreview_brandingpreviewprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/branding/BrandingPreview.tsx` @ L7
- **Cross-community:**
  - ↔ `BrandingPreview.tsx` [_`contains`_ | c5]

### FontPickerProps
- **ID:** `branding_fontpicker_fontpickerprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/branding/FontPicker.tsx` @ L25
- **Cross-community:**
  - ↔ `FontPicker.tsx` [_`contains`_ | c5]

### FONTS
- **ID:** `branding_fontpicker_fonts`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/branding/FontPicker.tsx` @ L5
- **Cross-community:**
  - ↔ `FontPicker.tsx` [_`contains`_ | c5]

### resolveItemName()
- **ID:** `cart_cartdrawer_resolveitemname`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/cart/CartDrawer.tsx` @ L11

### CartIconProps
- **ID:** `cart_carticon_carticonprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/cart/CartIcon.tsx` @ L7
- **Cross-community:**
  - ↔ `CartIcon.tsx` [_`contains`_ | c63]

### CartContext
- **ID:** `context_cartcontext_cartcontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/CartContext.tsx` @ L35
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`contains`_ | c63]

### CartItem
- **ID:** `context_cartcontext_cartitem`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/CartContext.tsx` @ L11
- **Cross-community:**
  - ↔ `CartContext.tsx` [_`contains`_ | c63]

### MenuContext
- **ID:** `context_menucontext_menucontext`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/MenuContext.tsx` @ L61
- **Cross-community:**
  - ↔ `MenuContext.tsx` [_`contains`_ | c45]

### MenuContextType
- **ID:** `context_menucontext_menucontexttype`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/context/MenuContext.tsx` @ L12
- **Cross-community:**
  - ↔ `MenuContext.tsx` [_`contains`_ | c45]

### fetchPublicMenu()
- **ID:** `hooks_usepublicmenu_fetchpublicmenu`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/hooks/usePublicMenu.ts` @ L5
- **Cross-community:**
  - ↔ `usePublicMenu.ts` [_`contains`_ | c49]

### usePublicMenu()
- **ID:** `hooks_usepublicmenu_usepublicmenu`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/hooks/usePublicMenu.ts` @ L10
- **Cross-community:**
  - ↔ `usePublicMenu.ts` [_`contains`_ | c49]

### getMenu()
- **ID:** `lib_api_getmenu`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/lib/api.ts` @ L24
- **Cross-community:**
  - ↔ `api.ts` [_`contains`_ | c3]

### CategoryRow()
- **ID:** `menu_categorylist_categoryrow`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/CategoryList.tsx` @ L134
- **Cross-community:**
  - ↔ `CategoryList.tsx` [_`contains`_ | c50]

### DAYS
- **ID:** `menu_categorysettingsmodal_days`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/CategorySettingsModal.tsx` @ L19
- **Cross-community:**
  - ↔ `CategorySettingsModal.tsx` [_`contains`_ | c57]

### EditItemFormProps
- **ID:** `menu_edititemform_edititemformprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/EditItemForm.tsx` @ L11
- **Cross-community:**
  - ↔ `EditItemForm.tsx` [_`contains`_ | c40]

### ItemRow()
- **ID:** `menu_itemlist_itemrow`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/ItemList.tsx` @ L91

### ItemWithOptionsProps
- **ID:** `menu_itemwithoptions_itemwithoptionsprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/ItemWithOptions.tsx` @ L13
- **Cross-community:**
  - ↔ `ItemWithOptions.tsx` [_`contains`_ | c21]

### ChoiceInput
- **ID:** `menu_manageoptionsmodal_choiceinput`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/ManageOptionsModal.tsx` @ L16
- **Cross-community:**
  - ↔ `ManageOptionsModal.tsx` [_`contains`_ | c57]

### PRESETS
- **ID:** `menu_manageoptionsmodal_presets`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/menu/ManageOptionsModal.tsx` @ L21
- **Cross-community:**
  - ↔ `ManageOptionsModal.tsx` [_`contains`_ | c57]

### HomePage()
- **ID:** `pages_homepage_homepage`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/HomePage.tsx` @ L547

### ConfirmAction
- **ID:** `pos_poscartdrawer_confirmaction`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosCartDrawer.tsx` @ L15
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`contains`_ | c2]

### PosCartDrawerProps
- **ID:** `pos_poscartdrawer_poscartdrawerprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosCartDrawer.tsx` @ L10
- **Cross-community:**
  - ↔ `PosCartDrawer.tsx` [_`contains`_ | c2]

### Category
- **ID:** `pos_pospage_category`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/pages/pos/PosPage.tsx` @ L31
- **Cross-community:**
  - ↔ `PosPage.tsx` [_`contains`_ | c2]

### PosSplitBill()
- **ID:** `pos_possplitbill_possplitbill`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosSplitBill.tsx` @ L7
- **Cross-community:**
  - ↔ `PosSplitBill.tsx` [_`contains`_ | c2]

### PosSplitBillProps
- **ID:** `pos_possplitbill_possplitbillprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/pos/PosSplitBill.tsx` @ L3
- **Cross-community:**
  - ↔ `PosSplitBill.tsx` [_`contains`_ | c2]

### resources
- **ID:** `src_i18n_resources`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/i18n.ts` @ L9

### container
- **ID:** `src_index_container`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/index.tsx` @ L12

### queryClient
- **ID:** `src_index_queryclient`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/index.tsx` @ L11

### root
- **ID:** `src_index_root`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/index.tsx` @ L15

### reportWebVitals()
- **ID:** `src_reportwebvitals_reportwebvitals`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/reportWebVitals.js` @ L1
- **Cross-community:**
  - ↔ `reportWebVitals.js` [_`contains`_ | c116]

### ButtonProps
- **ID:** `ui_button_buttonprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/button.tsx` @ L33

### buttonVariants
- **ID:** `ui_button_buttonvariants`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/button.tsx` @ L7

### ASPECT_CLASSES
- **ID:** `ui_imageuploadinput_aspect_classes`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/ImageUploadInput.tsx` @ L20
- **Cross-community:**
  - ↔ `ImageUploadInput.tsx` [_`contains`_ | c40]

### InputProps
- **ID:** `ui_input_inputprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/input.tsx` @ L5

### ModalProps
- **ID:** `ui_modal_modalprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/modal.tsx` @ L5

### SortableItemProps
- **ID:** `ui_sortableitem_sortableitemprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/SortableItem.tsx` @ L5
- **Cross-community:**
  - ↔ `SortableItem.tsx` [_`contains`_ | c50]

### TextareaProps
- **ID:** `ui_textarea_textareaprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/textarea.tsx` @ L5

### Toast()
- **ID:** `ui_toast_toast`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/toast.tsx` @ L11

### ToastProps
- **ID:** `ui_toast_toastprops`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/frontend/src/components/ui/toast.tsx` @ L4
