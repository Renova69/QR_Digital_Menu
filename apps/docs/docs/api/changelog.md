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
- Added a contract-quality gate that rejects empty DTO schemas; inherited and
  nested DTO properties are generated through Nest's compile-time Swagger
  metadata.
- Kept the live production Swagger UI disabled; publication does not add a new
  production backend route.
- Added optional `pinLoginStartTime` and `pinLoginEndTime` restaurant settings.
  `null`/`null` preserves unrestricted PIN login; configured windows use the
  restaurant's IANA timezone and may cross midnight.
- Sensitive super-admin, staff-PIN and device-enrolment mutations may now return
  `403 STEP_UP_REQUIRED` unless the caller has signed in with a strong credential
  within five minutes.
- PIN login outside a configured local window returns
  `403 PIN_LOGIN_OUTSIDE_HOURS` before device or PIN verification.

## Policy

- Prefer additive response fields and new endpoints.
- Keep old and new shapes valid across staggered frontend/backend deployments.
- Document removals or semantic changes before deployment and include a
  rollback path.
- Never use a database reset or destructive migration to implement an API
  contract change.
