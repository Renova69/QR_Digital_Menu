---
phase: 2
plan: 1
title: "Fix Google OAuth Callback & Auth Interceptor"
wave: 1
depends_on: []
files_modified:
  - backend/src/auth/auth.controller.ts
  - frontend/src/lib/api.ts
  - frontend/src/App.tsx
  - frontend/src/pages/OAuthCallbackPage.tsx
requirements: [REQ-001]
autonomous: true
must_haves:
  - Google OAuth callback redirects to frontend with token in URL query param
  - Frontend OAuthCallbackPage reads token from URL and stores in localStorage
  - Axios request interceptor adds Authorization header from localStorage on every request
  - 401 response interceptor clears token and redirects to login
  - OAuth callback route registered in App.tsx
---

<objective>
Fix the Google OAuth callback to redirect to frontend (browser can't receive JSON from a redirect), add a frontend callback page to handle token extraction, and add proper Axios interceptors for auth headers and 401 handling.
</objective>

## Tasks

<task id="1.1">
<title>Fix Google OAuth callback to redirect to frontend</title>
<read_first>
- backend/src/auth/auth.controller.ts
- backend/src/auth/auth.service.ts
- backend/src/main.ts (for FRONTEND_URL env var)
</read_first>
<action>
Modify `googleAuthRedirect` in `backend/src/auth/auth.controller.ts` to redirect to the frontend with the token as a URL query parameter instead of returning JSON (browsers following a redirect can't receive JSON).

Add `Res` to the imports from `@nestjs/common` and `Response` from `express`:

```typescript
import { Controller, Get, Post, Body, Res, UsePipes, ValidationPipe, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
```

Replace the `googleAuthRedirect` method:

```typescript
@Get('google/callback')
@UseGuards(GoogleAuthGuard)
async googleAuthRedirect(@Request() req, @Res() res: Response) {
  const { token } = await this.authService.login(req.user);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
}
```

Remove unused imports: `Patch`, `Param`, `Delete` from `@nestjs/common`, and `UpdateAuthDto`.
</action>
<acceptance_criteria>
- `backend/src/auth/auth.controller.ts` contains `res.redirect` in googleAuthRedirect
- `backend/src/auth/auth.controller.ts` imports `Res` from `@nestjs/common`
- `backend/src/auth/auth.controller.ts` imports `Response` from `express`
- `backend/src/auth/auth.controller.ts` redirects to `${frontendUrl}/auth/callback?token=${token}`
- `backend/src/auth/auth.controller.ts` does NOT import `UpdateAuthDto`
</acceptance_criteria>
</task>

<task id="1.2">
<title>Create OAuthCallbackPage on frontend</title>
<read_first>
- frontend/src/App.tsx (for routing structure)
- frontend/src/context/AuthContext.tsx (for auth state management)
</read_first>
<action>
Create `frontend/src/pages/OAuthCallbackPage.tsx`:

```typescript
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Completing sign-in...</p>
    </div>
  );
};

export default OAuthCallbackPage;
```

Add route in `frontend/src/App.tsx`:
- Import `OAuthCallbackPage` at top
- Add route: `<Route path="/auth/callback" element={<OAuthCallbackPage />} />`
  after the `/login` route
</action>
<acceptance_criteria>
- File `frontend/src/pages/OAuthCallbackPage.tsx` exists
- `OAuthCallbackPage.tsx` reads `token` from `searchParams`
- `OAuthCallbackPage.tsx` stores token in localStorage
- `OAuthCallbackPage.tsx` navigates to `/dashboard` on success
- `frontend/src/App.tsx` imports `OAuthCallbackPage`
- `frontend/src/App.tsx` has route for `/auth/callback`
</acceptance_criteria>
</task>

<task id="1.3">
<title>Add Axios request and response interceptors</title>
<read_first>
- frontend/src/lib/api.ts
</read_first>
<action>
Replace the existing response interceptor at the bottom of `frontend/src/lib/api.ts` with both a request interceptor (adds Authorization header from localStorage on every request) and a response interceptor (handles 401s):

Remove the existing response interceptor (lines 63-72) and replace with:

```typescript
// Request interceptor — attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      // Only redirect if not already on login or public pages
      const publicPaths = ['/login', '/auth/callback', '/menu/public'];
      const currentPath = window.location.pathname;
      if (!publicPaths.some(p => currentPath.startsWith(p))) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

This replaces the manual `api.defaults.headers.common['Authorization']` approach — the request interceptor automatically adds the header from localStorage on every request, so AuthContext no longer needs to manage it.
</action>
<acceptance_criteria>
- `frontend/src/lib/api.ts` contains `api.interceptors.request.use`
- `frontend/src/lib/api.ts` request interceptor reads token from `localStorage.getItem('token')`
- `frontend/src/lib/api.ts` response interceptor checks `error.response?.status === 401`
- `frontend/src/lib/api.ts` response interceptor calls `localStorage.removeItem('token')`
- `frontend/src/lib/api.ts` response interceptor checks `publicPaths` before redirecting
</acceptance_criteria>
</task>

## Verification
```bash
# Google callback redirects instead of returning JSON
grep "res.redirect" backend/src/auth/auth.controller.ts

# OAuth page exists
test -f frontend/src/pages/OAuthCallbackPage.tsx

# Both interceptors present
grep "interceptors.request.use" frontend/src/lib/api.ts
grep "interceptors.response.use" frontend/src/lib/api.ts

# Route registered
grep "auth/callback" frontend/src/App.tsx
```
