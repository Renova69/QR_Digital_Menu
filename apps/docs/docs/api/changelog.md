---
sidebar_position: 2
title: API changelog
description: Compatibility-impacting changes to the Renova HTTP API.
---

# API changelog

This log records changes that matter to API consumers. Internal refactors that
preserve the HTTP contract are not listed.

## 2026-08-29

- Published the generated OpenAPI JSON as a static documentation artifact.
- Added a CI drift gate: controller or DTO changes must update the committed
  artifact in the same pull request.
- Kept the live production Swagger UI disabled; publication does not add a new
  production backend route.

## Policy

- Prefer additive response fields and new endpoints.
- Keep old and new shapes valid across staggered frontend/backend deployments.
- Document removals or semantic changes before deployment and include a
  rollback path.
- Never use a database reset or destructive migration to implement an API
  contract change.
