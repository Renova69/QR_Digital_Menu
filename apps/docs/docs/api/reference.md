---
sidebar_position: 1
title: API contract
description: Versioned static OpenAPI contract for Renova integrations.
---

# API contract

The backend publishes a build-time OpenAPI contract as
[`openapi.json`](https://qr-digital-menu-ivory.vercel.app/docs/api/openapi.json).
It describes the same controllers, URI versioning, `/api` prefix, request DTOs,
and response metadata used by the application build.

The live production backend intentionally does **not** expose Swagger UI. Use
the static artifact for client generation, integration review, and security
testing without exposing an endpoint-discovery console on the API service.

## Base path and authentication

- Versioned API routes use `/api/v1`.
- Browser sessions use the secure HTTP-only authentication cookie and CSRF
  token flow described by the authentication endpoints.
- Bearer authentication is retained in the contract for supported non-browser
  environments; production browser clients must not store JWTs themselves.
- Public endpoints and provider webhooks declare their own authentication and
  verification requirements in the generated operation metadata.

## Compatibility

Additive fields and endpoints are preferred. Renames, removals, or behavior
changes must be recorded in the [API changelog](./changelog.md) and use a
forward-compatible rollout when old and new clients can overlap.
