# Gap Closure: UAT Fixes

We identified three problems during UAT tests 4 and 5:

1. **Broken Image Uploads (Menu Items & Branding)**: The frontend Axios HTTP client is failing to transmit image files properly because manually overriding `'Content-Type': 'multipart/form-data'` strips the required multi-part boundary string that the backend Multer parser depends on.
2. **Missing Logo Upload API**: The branding editor form was attempting to target a non-existent `/menu/upload` endpoint instead of a dedicated Restaurant Logo handler.
3. **Missing Public Menu Button**: The dashboard lacks a direct hyperlink to preview the live Public QR Menu.

## Proposed Changes

### Backend

#### [MODIFY] `backend/src/restaurants/restaurants.controller.ts`

- Add `@UseInterceptors(FileInterceptor('file'))` endpoint at `@Post(':id/logo')` to handle saving Restaurant Logos securely into the `uploads/` volume exactly like menu items.
- Update `RestaurantsService.updateLogo()` method.

#### [MODIFY] `backend/src/restaurants/restaurants.service.ts`

- Add `updateLogo(id, logoUrl)` utilizing Prisma to update the restaurant row safely.

### Frontend

#### [MODIFY] `frontend/src/services/menuService.ts`

- Remove the literal `{ headers: { 'Content-Type': 'multipart/form-data' } }` configuration during item image uploads so Axios naturally attaches the binary boundaries.

#### [MODIFY] `frontend/src/components/ui/BrandingEditor.tsx`

- Remove the strict `multipart/form-data` header constraint.
- Change the target URL from `/menu/upload` to the new correct `/restaurants/${restaurant.id}/logo`.
- Render the current active logo image elegantly.

#### [MODIFY] `frontend/src/pages/DashboardPage.tsx`

- Add a new "View Public Menu" button near the active Navigation bar or Summary area that bounds directly to `/menu/${activeRestaurant.id}` opening safely in a new tab.

## Verification Plan

1. Rebuild frontend/backend.
2. Click "View Public Menu" directly from the Dashboard.
3. Upload an Image successfully inside the Branding Editor without server 500s.
4. Upload an Item Photo and verify that Multer successfully accepts it.
