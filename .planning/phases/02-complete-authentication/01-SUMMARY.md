---
phase: 2
plan: 1
title: "Fix Google OAuth Callback & Auth Interceptor"
completed: 2026-04-09
key-files:
  created:
    - frontend/src/pages/OAuthCallbackPage.tsx
  modified:
    - backend/src/auth/auth.controller.ts
    - frontend/src/lib/api.ts
    - frontend/src/App.tsx
key-decisions:
  - "Google OAuth callback redirects to frontend with token in URL rather than returning JSON"
  - "Axios request interceptor auto-attaches token on every request from localStorage"
  - "401 response interceptor clears auth state and redirects, except on public paths"
requirements-completed: [REQ-001]
---

# Phase 2 Plan 1: Fix Google OAuth Callback & Auth Interceptor Summary

Google OAuth callback now redirects to `${FRONTEND_URL}/auth/callback?token=${jwt}` instead of returning JSON (which browsers can't receive on redirect). New `OAuthCallbackPage` extracts the token from URL params, stores in localStorage, sets Authorization header, and navigates to dashboard. Axios request interceptor auto-attaches token on every request. Response interceptor handles 401s by clearing auth state and redirecting to login (skipping public paths to avoid redirect loops).

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1.1 | Fix Google OAuth callback to redirect to frontend | ✓ |
| 1.2 | Create OAuthCallbackPage on frontend | ✓ |
| 1.3 | Add Axios request and response interceptors | ✓ |

## Deviations from Plan

- **[Rule 1 - Bug] Google OAuth URL**: LoginDialog's Google login URL was hardcoded to `http://localhost:3000/auth/google` without the `/api` prefix. Fixed to use `VITE_API_URL` env var with fallback. This was auto-fixed during Task 2.2 since it was in the same file.

## Issues Encountered

None.
