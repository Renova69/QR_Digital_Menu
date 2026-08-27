# Isolated Supabase staging

Staging is a release gate, not a copy of production. It uses a separate
Supabase project, a separate Redis deployment, Stripe test-mode credentials,
and a separate frontend origin. Production customer data must never be copied
into it; use synthetic test records only.

## Required Google Secret Manager entries

- `STAGING_DATABASE_URL` — Supabase transaction pooler, port 6543, with
  `pgbouncer=true`
- `STAGING_DIRECT_URL` — the same staging project through the session pooler,
  port 5432
- `STAGING_JWT_SECRET` — unique, at least 32 characters
- `STAGING_REDIS_URL` — a host not used by production
- `STAGING_STRIPE_SECRET_KEY` — Stripe test-mode secret key
- `STAGING_STRIPE_WEBHOOK_SECRET` — test endpoint signing secret
- `STAGING_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` — test subscription endpoint
  signing secret
- `STAGING_FRONTEND_URL` — separate HTTPS origin
- `STAGING_SENTRY_DSN` — Sentry DSN; events are tagged with environment
  `staging`

Do not bind production Resend, Twilio, R2, DeepL, Google OAuth, VAPID, or
payment-provider credentials to the staging Cloud Run service. The deploy
script uses an exact secret list so old or accidental bindings are removed.

## Release order

1. Merge and wait for the `verify` check on `main`.
2. From a clean, current `main`, run:

   ```powershell
   .\ops\staging\deploy-staging.ps1
   ```

3. The script validates that staging credentials differ from production,
   builds the exact commit, applies only forward migrations, verifies schema
   and invariants, deploys with no traffic, smoke-tests the tagged revision,
   then moves staging traffic.
4. Run staging release checks using synthetic data.
5. Run `./deploy.ps1`. Production refuses to build, back up, migrate, or deploy
   unless the serving staging revision proves the same full commit, migration
   digest, and immutable image digest.

There is intentionally no reset or restore command in this workflow. A staging
database replacement is a separately reviewed operation; production recovery
remains outside these scripts and requires explicit authorization.
