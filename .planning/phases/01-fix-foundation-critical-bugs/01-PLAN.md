---
phase: 1
plan: 1
title: "Fix Auth Response Format & Unify Auth Implementation"
wave: 1
depends_on: []
files_modified:
  - backend/src/auth/auth.service.ts
  - backend/src/auth/auth.controller.ts
  - frontend/src/context/AuthContext.tsx
  - frontend/src/hooks/useAuth.ts
  - frontend/src/lib/api.ts
  - frontend/src/App.tsx
  - frontend/src/components/Header.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/pages/CheckoutPage.tsx
  - frontend/src/context/RestaurantContext.tsx
  - frontend/src/components/ui/LoginDialog.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/MenuEditorPage.tsx
requirements: [REQ-001]
autonomous: true
must_haves:
  - Backend login returns { token, user } instead of { access_token }
  - Backend register returns { token, user } with auto-login
  - Single auth implementation on frontend (AuthContext.tsx only)
  - useAuth hook in hooks/useAuth.ts deleted
  - All components import useAuth from context/AuthContext
  - Token stored as 'token' in localStorage consistently
---

<objective>
Fix the auth response mismatch between backend and frontend, and consolidate the two competing auth implementations (AuthContext vs useAuth hook) into a single Context-based approach.
</objective>

## Tasks

<task id="1.1">
<title>Fix backend login to return { token, user }</title>
<read_first>
- backend/src/auth/auth.service.ts
- backend/src/auth/auth.controller.ts
- frontend/src/context/AuthContext.tsx (to see what frontend expects)
</read_first>
<action>
Modify `AuthService.login()` in `backend/src/auth/auth.service.ts` to return both the token and user data:

Change the `login` method from:

```typescript
async login(user: any) {
  const payload = { email: user.email, sub: user.id };
  return {
    access_token: this.jwtService.sign(payload),
  };
}
```

To:

```typescript
async login(user: any) {
  const payload = { email: user.email, sub: user.id };
  return {
    token: this.jwtService.sign(payload),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}
```

Also modify `AuthService.register()` to auto-login after registration by returning the same `{ token, user }` format:

Change the register method's return from:

```typescript
const { password: _, ...result } = user;
return result;
```

To:

```typescript
const { password: _, ...result } = user;
const payload = { email: result.email, sub: result.id };
return {
  token: this.jwtService.sign(payload),
  user: {
    id: result.id,
    email: result.email,
    name: result.name,
    role: result.role,
  },
};
```

</action>
<acceptance_criteria>
- `backend/src/auth/auth.service.ts` login method returns object with `token` key (not `access_token`)
- `backend/src/auth/auth.service.ts` login method returns object with `user` key containing `id`, `email`, `name`, `role`
- `backend/src/auth/auth.service.ts` register method returns object with `token` and `user` keys
- grep confirms: `grep "token:" backend/src/auth/auth.service.ts` shows token in return objects
- grep confirms: `grep "access_token" backend/src/auth/auth.service.ts` returns nothing
</acceptance_criteria>
</task>

<task id="1.2">
<title>Update AuthContext to work with new backend response</title>
<read_first>
- frontend/src/context/AuthContext.tsx
- frontend/src/hooks/useAuth.ts
- frontend/src/lib/api.ts
</read_first>
<action>
Update `AuthContext.tsx` to ensure the login/register methods correctly handle the new `{ token, user }` response from the backend. The current code in AuthContext already expects `{ token, user }` which matches the new backend format, but the `api.ts` functions (`login`, `register`) need updating.

In `frontend/src/lib/api.ts`, update the `login` function — it currently returns `response.data` which will now include `{ token, user }` — no change needed there.

Update `register` function — currently returns `response.data`, now the backend returns `{ token, user }` — no change needed.

The AuthContext `login` method destructures `{ token, user }` which matches. The AuthContext `register` method destructures `{ token, user }` which matches.

Add `isError` to the AuthContext interface and value to match what components using the hook version might need:

In the `AuthContextType` interface, add:

```typescript
isError?: boolean;
```

In the `AuthProvider` component, add a state:

```typescript
const [isError, setIsError] = useState(false);
```

Include `isError` in the value object.

Wrap the login and register methods with try/catch that sets `isError`:

```typescript
const login = async (email: string, password: string) => {
  try {
    setIsError(false);
    const { token, user } = await apiLogin(email, password);
    localStorage.setItem("token", token);
    setToken(token);
    setUser(user);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    return { token, user };
  } catch (error) {
    setIsError(true);
    throw error;
  }
};
```

Do the same pattern for register.
</action>
<acceptance_criteria>

- `frontend/src/context/AuthContext.tsx` contains `isError` in AuthContextType interface
- `frontend/src/context/AuthContext.tsx` login method sets Authorization header after successful login
- `frontend/src/context/AuthContext.tsx` login method calls `apiLogin` and destructures `{ token, user }`
- `frontend/src/context/AuthContext.tsx` register method calls `apiRegister` and destructures `{ token, user }`
  </acceptance_criteria>
  </task>

<task id="1.3">
<title>Delete hooks/useAuth.ts and update all imports</title>
<read_first>
- frontend/src/hooks/useAuth.ts
- frontend/src/components/ui/LoginDialog.tsx
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/MenuEditorPage.tsx
</read_first>
<action>
Delete the file `frontend/src/hooks/useAuth.ts`.

Update all files that import from `hooks/useAuth` to import from `context/AuthContext` instead:

1. `frontend/src/components/ui/LoginDialog.tsx` line 4:
   Change: `import { useAuth } from '../../hooks/useAuth';`
   To: `import { useAuth } from '../../context/AuthContext';`

   Also update `LoginDialog` to match AuthContext API. The hook version uses `login({ email, password })` (object arg). The context version uses `login(email, password)` (positional args).

   Change line 21: `await login({ email, password });` → `await login(email, password);`
   Change line 23: `await register({ email, password });` → `await register(email, password);`

2. `frontend/src/pages/LoginPage.tsx` line 4:
   Change: `import { useAuth } from '../hooks/useAuth';`
   To: `import { useAuth } from '../context/AuthContext';`

3. `frontend/src/pages/MenuEditorPage.tsx` line 10:
   Change: `import { useAuth } from '../hooks/useAuth';`
   To: `import { useAuth } from '../context/AuthContext';`

These are the only 3 files importing from `hooks/useAuth`. The following already import from `context/AuthContext`:

- `ProtectedRoute.tsx` — no change
- `Header.tsx` — no change
- `DashboardPage.tsx` — no change
- `CheckoutPage.tsx` — no change
- `RestaurantContext.tsx` — no change
  </action>
  <acceptance_criteria>
- File `frontend/src/hooks/useAuth.ts` does not exist
- `grep -r "hooks/useAuth" frontend/src/` returns no results
- `frontend/src/components/ui/LoginDialog.tsx` imports useAuth from `../../context/AuthContext`
- `frontend/src/pages/LoginPage.tsx` imports useAuth from `../context/AuthContext`
- `frontend/src/pages/MenuEditorPage.tsx` imports useAuth from `../context/AuthContext`
- `LoginDialog.tsx` calls `login(email, password)` not `login({ email, password })`
  </acceptance_criteria>
  </task>

## Verification

```bash
# No references to deleted hook
grep -r "hooks/useAuth" frontend/src/
# Should return nothing

# All useAuth imports point to context
grep -r "useAuth" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "context/AuthContext" | grep -v "node_modules"
# Should only show the AuthContext definition itself

# Backend returns token (not access_token)
grep "access_token" backend/src/auth/auth.service.ts
# Should return nothing
```
