---
phase: 3
plan: 1
title: "Serve Static Assets & Fix Image Paths"
completed: 2026-04-09
key-files:
  created: []
  modified:
    - backend/src/main.ts
    - backend/src/menu/item.controller.ts
    - frontend/src/components/menu/ItemWithOptions.tsx
key-decisions:
  - "Used NestExpressApplication.useStaticAssets to correctly serve the /uploads folder in NestJS"
  - "Normalized URL paths (e.g. uploads/filename.xxx) before saving to the database rather than relying on Multer's OS-specific file.path"
  - "Configured the frontend to build the backend asset URL structurally from VITE_API_URL instead of using hardcoded localhost domains"
requirements-completed: [REQ-003, REQ-004]
---

# Phase 3 Plan 1: Serve Static Assets & Fix Image Paths Summary

Configured the backend to statically serve image assets directly from the `uploads/` directory on the server, ensuring all uploads are properly served to clients. Fixed issues where Multer was incorrectly storing the image path with `\` slashes on Windows by generating and saving `uploads/filename` with regular forward slashes. Completed the loop by wiring the `ItemWithOptions` display component to securely formulate the absolute URLs by deriving the backend host from `VITE_API_URL`.

## Tasks Completed

| #   | Task                                         | Status |
| --- | -------------------------------------------- | ------ |
| 1.1 | Ensure uploads directory exists              | ✓      |
| 1.2 | Serve static assets in NestJS main.ts        | ✓      |
| 1.3 | Fix image path storage in item.controller.ts | ✓      |
| 1.4 | Fix image rendering in ItemWithOptions.tsx   | ✓      |

## Deviations from Plan

None — plan executed smoothly.

## Issues Encountered

None.
