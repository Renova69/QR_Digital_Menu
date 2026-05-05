# Concerns

## 🔴 Critical Issues

### 1. Stub Services — Orders & Assistance Not Implemented
**Files:** `backend/src/orders/orders.service.ts`, `backend/src/assistance/assistance.service.ts`

Both services return hardcoded strings instead of actual database operations:
```typescript
// backend/src/orders/orders.service.ts
create(createOrderDto: CreateOrderDto) {
  return 'This action adds a new order';  // Not wired to database!
}
```
The frontend has full order and assistance UI (`CheckoutPage`, `OrdersView`, `AssistanceView`) that calls these endpoints. **Users will get string responses instead of real data.**

### 2. Frontend Dockerfile Build Order Bug
**File:** `frontend/Dockerfile`

```dockerfile
COPY package*.json ./
RUN npm install
RUN npm run build    # ❌ Build BEFORE copying source code
COPY . .             # Source code copied AFTER build attempt
```
`npm run build` will fail because source files haven't been copied yet. Fix: move `COPY . .` before `RUN npm run build`.

### 3. Auth Response Mismatch
**Backend** (`auth.controller.ts` → `auth.service.ts`) returns `{ access_token }`:
```typescript
async login(user: any) {
  return { access_token: this.jwtService.sign(payload) };
}
```
**Frontend** (`AuthContext.tsx`) expects `{ token, user }`:
```typescript
const { token, user } = await apiLogin(email, password);
localStorage.setItem('token', token);
```
Meanwhile, the `useAuth.ts` hook correctly expects `{ access_token }`. This creates **two competing auth implementations** with different expectations.

### 4. JWT Token Stored in localStorage
**File:** `frontend/src/context/AuthContext.tsx`

JWT stored in `localStorage` is vulnerable to XSS attacks. The `README.md` mentions "HTTP-only cookies or local storage" but only localStorage is implemented. Consider using HTTP-only cookies for production.

## 🟡 Significant Issues

### 5. Duplicate Auth Implementation
There are **two parallel auth systems** in the frontend:
1. `frontend/src/context/AuthContext.tsx` — Context-based with useState
2. `frontend/src/hooks/useAuth.ts` — TanStack Query-based with useQuery/useMutation

They manage tokens differently, fetch user data differently, and can conflict. The codebase should pick one approach.

### 6. Missing Input Validation for Public Endpoints
**Files:** `backend/src/menu/public-menu.controller.ts`, `backend/src/orders/orders.controller.ts`

Public endpoints lack validation:
- No rate limiting on order creation or assistance requests
- No input sanitization on customer name/phone fields
- No validation that `restaurantId` exists before querying

### 7. No Authorization on Order/Assistance Endpoints
The frontend calls `/orders` and `/assistance-requests` endpoints, but it's unclear if these have proper auth guards or if they're fully public (which they shouldn't be for listing all orders).

### 8. Relaxed TypeScript Configuration
**File:** `backend/tsconfig.json`

```json
"strictNullChecks": false,
"noImplicitAny": false,
"forceConsistentCasingInFileNames": false
```
This allows null reference bugs and untyped code to slip through. Consider enabling strict mode incrementally.

### 9. No Image Upload Implementation
The menu system has `imageUrl` field on `MenuItem`, but there's no file upload endpoint. The upload route is mentioned in the roadmap but not implemented. The `updateItemImage` service method exists but takes a raw URL string.

## 🟢 Minor Issues / Tech Debt

### 10. Stale/Broken Tests
**Files:** `backend/src/app.controller.spec.ts`, `backend/test/app.e2e-spec.ts`

- Unit test checks for `getHello()` which no longer exists on `AppController`
- E2E test expects `GET /` to return "Hello World!" but root now redirects to `/api`
- Dashboard E2E test may miss `/api` global prefix

### 11. Hardcoded Secrets in docker-compose.yml
**File:** `docker-compose.yml`

```yaml
JWT_SECRET=super-secret-key-for-development
GOOGLE_CLIENT_ID=dev-client-id
```
While these are development values, the pattern encourages committing secrets. Consider using `.env` files with `env_file:` in docker-compose.

### 12. Missing Error Boundary
No React Error Boundary component. Unhandled errors will crash the entire app with a white screen.

### 13. No Loading/Error States in Some Components
The `HomePage` is a minimal 203-byte placeholder. Some pages lack proper loading spinners or error states for failed API calls.

### 14. Cart Doesn't Account for Menu Options in Price
**File:** `frontend/src/context/CartContext.tsx`

```typescript
const getTotal = () => {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};
```
`selectedOptions` are stored but their `priceModifier` is not included in the total calculation.

### 15. Missing `dev` Script in Frontend
**File:** `frontend/package.json`

No `dev` script defined. Scripts available are `start` (serve built files), `build`, `preview`, and `test`. Running Vite dev server requires manually calling `npx vite`.

### 16. Unused `frontend/backend/` Directory
There's a `frontend/backend/` directory that appears empty or unused — likely an artifact from early development.

### 17. No Cascade Deletes Configured
**File:** `backend/prisma/schema.prisma`

Deleting a restaurant won't cascade to its categories, items, orders, etc. This will cause foreign key constraint violations. Prisma requires explicit `onDelete: Cascade` or manual deletion.

### 18. `any` Types in Frontend
Several places use untyped `any`:
- `CartContext.tsx`: `selectedOptions: any[]`
- `AuthContext.tsx`: `login returns Promise<any>`
- `api.ts`: `createOrder(orderData: any)`

## Performance Considerations

### Database
- No database indexes beyond primary keys and unique constraints
- Dashboard `getSummary()` runs 4 separate queries per request — could be optimized
- No connection pooling configuration beyond Prisma defaults

### Frontend
- All contexts wrap the entire app — any context change re-renders all consumers
- Cart uses `localStorage` sync on every state change
- No code splitting or lazy loading of routes

### API
- No pagination on list endpoints
- No caching headers
- No response compression
- Public menu loads all categories + items + options in one query (could be large)

## Security Summary

| Risk | Status | Location |
|------|--------|----------|
| XSS via localStorage JWT | ⚠️ Vulnerable | `AuthContext.tsx` |
| SQL Injection | ✅ Mitigated | Prisma parameterized queries |
| CSRF | ⚠️ No protection | No CSRF tokens |
| Rate Limiting | ❌ Missing | All endpoints |
| Input Validation | ⚠️ Partial | Only on some DTOs |
| Secrets in Code | ⚠️ Dev secrets | `docker-compose.yml` |
| CORS | ✅ Configured | Limited to frontend origin |
| Auth on Public Routes | ✅ Proper | Guards on protected endpoints |
