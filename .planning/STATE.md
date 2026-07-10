# Project State

## Project

- **Name:** QR Menu App
- **Type:** Full-stack web application (React + NestJS)
- **Status:** In progress (resumed after ~1 year hiatus)
- **Started:** 2025-08-28

## Current Milestone

- **Version:** 1.0 — MVP
- **Goal:** Functional QR-based digital menu system for restaurants

## Phase Status

| Phase | Name                                 | Status                  |
| ----- | ------------------------------------ | ----------------------- |
| 1     | Fix Foundation & Critical Bugs       | ✓ Complete (2026-04-09) |
| 2     | Complete Authentication              | ✓ Complete (2026-04-09) |
| 3     | Complete Menu Builder & Image Upload | ✓ Complete (2026-04-09) |
| 4     | Table Management & QR Codes          | ✓ Complete (2026-04-09) |
| 5     | Complete Ordering System             | ✓ Complete (2026-04-09) |
| 6     | Dashboard & Polish                   | ✓ Complete (2026-04-09) |
| 7     | Deployment & Production Readiness    | ✓ Complete (2026-04-09) |

## Key Decisions

- Defer "Call Waiter" assistance feature to v2
- Defer multi-language support to v2
- Defer cloud scaling (AWS/GCP) — Docker Compose on VPS is sufficient for launch
- Simplify staff roles — owner-only for MVP
- No payment integration for MVP

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Query
- Backend: NestJS 11, TypeScript, Prisma 6, PostgreSQL 15
- Auth: JWT + Google OAuth via Passport.js
- Deployment: Docker Compose

## Last Activity

- **Date:** 2026-04-17
- **Action:** Phase 8 added: Design SaaS Web App UX/UI

## Accumulated Context

### Roadmap Evolution

- Phase 8 added: Design SaaS Web App UX/UI
