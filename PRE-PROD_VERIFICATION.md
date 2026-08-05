You are acting as a principal software engineer, application-security reviewer, QA lead, and production-readiness auditor.

Perform a complete, evidence-based review of this repository before it is deployed to production.

## Project context

This is a multi-tenant QR digital-menu SaaS application for restaurants.

The stack includes approximately:

* React, TypeScript, and Vite frontend
* NestJS backend
* PostgreSQL
* Docker
* WebSockets/realtime functionality
* Stripe payments
* Authentication and role-based authorization
* Restaurant, staff, menu, ordering, reservation, and table-management features
* Public restaurant menus
* Dynamic menu translation using DeepL
* Static dashboard translations using i18n JSON files
* File or image uploads
* Feature flags, subscription plans, or plan-based limits
* Deployment to cloud infrastructure

Do not assume this description or any documentation is current. Verify everything against the implementation.

## Primary objective

Determine whether this application is safe and reliable enough for real restaurants and real customers.

I cannot manually smoke-test every path. Your job is to find problems that normal happy-path testing may miss, including:

* Logic errors
* Broken or incomplete user flows
* Security vulnerabilities
* Authorization and multi-tenant isolation failures
* Payment inconsistencies
* Race conditions
* Realtime synchronization failures
* Database integrity problems
* Error-handling gaps
* Deployment and configuration risks
* Missing production safeguards
* Features that appear complete in the UI but are incomplete underneath
* Code that contradicts the documentation
* Tests that pass without meaningfully testing the behavior

This is not a superficial style review.

## Non-negotiable operating rules

1. Do not modify application code during this review.
2. Do not automatically fix, refactor, format, install, upgrade, or delete anything.
3. You may create or update only the final audit/report file requested below.
4. Do not trust README files, plans, comments, previous audit reports, TODO lists, or generated documentation as proof.
5. Treat documentation only as a claim that must be verified against the code.
6. Do not report speculative issues must be verified as confirmed defects.
7. Trace important behavior end to end before reaching a conclusion.
8. Every confirmed issue must cite exact evidence from the repository.
9. If something cannot be verified, explicitly classify it as “Needs manual verification.”
10. Do not stop after finding the first major problems.
11. Do not declare the application production-ready merely because it builds and the tests pass.
12. Do not hide problems because they are difficult or time-consuming to fix.
13. Never run destructive commands or connect to real production services.
14. Do not expose secrets or print complete secret values in the report.
15. Do not make real payments, send real emails, contact real users, or mutate production data.
16. If the repository is too large for one context window, conduct the audit in phases and maintain progress in the report. Do not replace deeper inspection with sampling.
17. Inspect full implementations, not only filenames, exports, interfaces, DTOs, tests, or search results.
18. Verify shared helpers, guards, middleware, interceptors, database abstractions, and configuration before assuming their consumers are safe.
19. Distinguish clearly between:

    * Confirmed defect
    * Probable risk
    * Maintainability concern
    * Missing test
    * Needs manual verification
20. Do not inflate the report with formatting preferences or low-value style commentary.

## Phase 1 — Repository discovery

Start by reading all repository-level instructions, including files such as:

* `CLAUDE.md`
* `AGENTS.md`
* `README.md`
* Workspace/package manifests
* Docker files
* CI/CD configuration
* Environment examples
* Deployment configuration
* Database schema and migrations
* Existing documentation and audits

Then build an inventory of:

* Applications and packages
* Frontend and backend entry points
* API modules and routes
* Database models
* Background jobs and scheduled tasks
* WebSocket gateways and events
* Authentication methods
* Authorization guards and role definitions
* Public versus authenticated endpoints
* External integrations
* Payment flows and webhooks
* Upload/storage flows
* Email or notification flows
* Caching and rate-limiting mechanisms
* Translation workflows
* Feature flags
* Subscription enforcement
* Test suites
* Production deployment paths

Use this inventory as a coverage checklist. Do not audit only the most obvious files.

Before the detailed findings, show which subsystems were inspected and which could not be inspected.

## Phase 2 — Establish the automated baseline

Identify the project’s actual package manager and supported scripts. Run the safest relevant checks that already exist, such as:

* Dependency installation only if it is required, safe, and compatible with the repository instructions
* Type checking
* Linting
* Frontend tests
* Backend unit tests
* Integration tests
* End-to-end tests
* Production builds
* Database/schema validation
* Migration checks
* Test coverage
* Dependency vulnerability audit
* Dead-code or circular-dependency checks, if already configured

Do not invent commands blindly. Read the package scripts and repository instructions first.

For every command, record:

* Exact command
* Working directory
* Exit status
* Important warnings or failures
* Whether the result is trustworthy
* What the command does not prove

If a check cannot run because of missing services, environment variables, credentials, fixtures, or infrastructure, do not silently skip it. Record the blocker and determine whether a safe local substitute exists.

Watch for:

* Tests skipped with `.skip`, `xit`, disabled suites, or conditional execution
* Tests that swallow errors
* Mock-heavy tests that never exercise real authorization or persistence
* Snapshots that hide incorrect behavior
* Builds that omit important packages
* Coverage exclusions
* Warnings treated as harmless
* Flaky timing-dependent tests
* Test environments that differ materially from production

## Phase 3 — Trace critical user journeys end to end

For each critical journey, trace:

```text
UI action
→ frontend validation and state
→ API request
→ DTO/schema validation
→ authentication
→ authorization
→ tenant ownership check
→ service/business logic
→ transaction/database mutation
→ side effects
→ API response
→ frontend result
→ realtime update
→ error and retry behavior
```

Review at least these flows where present:

### Identity and account security

* Registration
* Login and logout
* Token issuance and refresh
* Session invalidation
* Password reset
* Email verification
* Account deletion
* Staff invitations
* Role changes
* Removal of staff access
* Expired, revoked, reused, or stolen tokens
* Concurrent sessions

### Tenant and restaurant isolation

* Creating and managing restaurants
* Switching between restaurants
* Access by restaurant owner, manager, staff, and customer
* IDs supplied through URL parameters, request bodies, queries, WebSocket messages, and uploads
* Attempts to access or mutate another restaurant’s resources
* Indirect relations that may bypass ownership checks
* Cached data accidentally shared between tenants
* Background tasks or events executed without tenant scope

Test the authorization model mentally and through existing safe tests for:

* IDOR/BOLA
* Privilege escalation
* Missing ownership checks
* Mass assignment
* Role confusion
* Deleted or disabled accounts retaining access
* Users belonging to several restaurants
* Guessable resource identifiers

A user being authenticated is not proof that they are authorized for a particular restaurant or resource.

### Menu management and public menu

* Categories
* Items
* Variants
* Modifiers
* Prices
* Taxes
* Currency
* Allergens
* Dietary tags
* Availability and out-of-stock status
* Visibility and publication
* Scheduling
* Images
* Draft versus published data
* Deleted or archived records
* Public caching and stale content
* Locale fallback
* Invalid restaurant slugs or identifiers

Check whether unpublished, deleted, internal, or cross-tenant data can reach public responses.

### Dynamic translation

* Source-language handling
* DeepL requests
* Translation caching
* Cache-key correctness
* Per-restaurant and per-language separation
* Updates invalidating old translations
* User-edited translations being overwritten
* Quotas and abuse controls
* Retry and timeout behavior
* Provider downtime
* Duplicate requests
* Cost-amplification attacks
* Fallback to source text
* Empty or malformed content
* Allergens and dietary-tag consistency
* Translation of single words and short menu phrases
* HTML or script content passing through translation/rendering

### Ordering

* Cart creation
* Item validation
* Server-side price calculation
* Quantity boundaries
* Variants and modifier validation
* Availability changes
* Duplicate submission
* Idempotency
* Concurrent updates
* Order state transitions
* Unauthorized state changes
* Cancellation
* Refund-related state
* Historical order integrity
* WebSocket notifications
* Reconnect and missed-event handling

Verify that the server never trusts client-submitted totals, prices, discounts, taxes, restaurant IDs, user IDs, or privileged statuses.

### Payments

Trace the full Stripe lifecycle where present:

* Checkout/payment creation
* Server-side amount calculation
* Currency handling
* Metadata
* Customer and restaurant association
* Webhook signature verification
* Idempotent webhook processing
* Duplicate and out-of-order events
* Failed and delayed payments
* Refunds
* Disputes
* Payment/order status synchronization
* Replay protection
* Test versus live environment separation
* Secret management
* Redirect URLs
* Logging of sensitive data

Search for paths where an order can be marked paid without confirmed provider evidence or where a valid webhook can update the wrong tenant/order.

### Reservations and tables

Where implemented, verify:

* Guest-count and capacity rules
* Bookability
* Time zones
* Overlapping reservations
* Race conditions
* Double booking
* Reservation state transitions
* Public abuse and rate limiting
* Table and zone ownership
* Deleted tables or zones
* Past-date handling
* Restaurant opening hours
* Notifications
* Cancellation
* Staff visibility
* Any mismatch between UI promises and database support

Do not assume a feature is complete merely because UI components exist.

### Realtime and WebSockets

Inspect:

* Connection authentication
* Token refresh and expiration
* Room membership
* Tenant-specific rooms
* Event authorization
* User-controlled room or restaurant IDs
* Connect/disconnect cleanup
* Reconnect behavior
* Duplicate listeners
* Missed events
* Event ordering
* Payload validation
* Information leakage
* Horizontal scaling/pub-sub assumptions
* Memory leaks
* Rate limiting
* Availability updates
* Order and reservation events

### Uploads and media

Check:

* MIME type versus actual file content
* File-size limits
* Filename/path safety
* Executable or SVG content
* Image decompression bombs
* Tenant ownership
* Orphan cleanup
* Replacement and deletion behavior
* Public/private URL exposure
* Storage credentials
* Signed URL expiration
* Malware-related risk
* Client-side-only validation

### Subscription plans and feature enforcement

Verify that all plan limits and premium capabilities are enforced on the server, not only hidden in the UI.

Check:

* Seat/staff limits
* Restaurant limits
* Menu/item limits
* Translation quotas
* Reservation access
* Realtime or analytics features
* Trial expiration
* Downgrades
* Grace periods
* Concurrent requests bypassing limits
* Existing data after downgrade
* Webhook-driven subscription changes
* Cache invalidation after plan changes

## Phase 4 — Security audit

Review against relevant OWASP Web Application and API risks.

Inspect specifically for:

* Broken access control
* IDOR/BOLA
* Authentication weaknesses
* Injection
* Stored and reflected XSS
* Unsafe HTML rendering
* CSRF
* CORS misconfiguration
* SSRF
* Open redirects
* Path traversal
* Prototype pollution
* Unsafe deserialization
* Command execution
* Weak or reused secrets
* Secret leakage
* Sensitive logging
* Verbose production errors
* Missing rate limiting
* Brute-force exposure
* Account enumeration
* Insecure cookies
* Token storage risks
* Weak password/reset-token handling
* Missing security headers
* Dependency vulnerabilities
* Debug endpoints
* Development bypasses
* Swagger/API documentation exposed unintentionally
* Unsafe default administrator accounts
* Environment fallbacks that silently weaken security

Search for dangerous patterns, but inspect their context before reporting them.

Examples include:

* `any`
* `as unknown as`
* `@ts-ignore`
* `@ts-expect-error`
* `eslint-disable`
* Empty `catch`
* Fire-and-forget promises
* Non-awaited database writes
* Dynamic SQL
* `dangerouslySetInnerHTML`
* `eval`
* Shell execution
* Raw redirects
* Wildcard CORS
* Hard-coded credentials
* Development authentication bypasses
* Logging tokens, passwords, payment objects, or personal information

Do not include actual secret values in the report. Mention only the filename, variable name, and remediation.

## Phase 5 — Data integrity and concurrency

Inspect the schema, migrations, constraints, indexes, and transaction boundaries.

Check for:

* Missing foreign keys
* Missing unique constraints
* Nullable fields that code treats as required
* Incorrect cascade behavior
* Orphaned records
* Tenant IDs missing from uniqueness constraints
* Incorrect money data types
* Float usage for currency
* Time-zone mistakes
* Unsafe enum migrations
* Migration order problems
* Schema drift
* Migrations that work only on empty databases
* Missing indexes on hot queries
* N+1 queries
* Unbounded queries
* Pagination mistakes
* Race conditions
* Lost updates
* Double booking
* Duplicate orders
* Duplicate webhook processing
* Partial writes
* Side effects executed before transaction commit
* Retry behavior that duplicates operations
* Soft-delete records still being selected

For each transactional workflow, identify its invariants and determine whether the database actually enforces them.

## Phase 6 — Frontend reliability

Review:

* Routing and protected routes
* Authentication state initialization
* Refresh-token behavior
* Loading and error states
* Empty states
* Form validation
* Server-error mapping
* Duplicate submission
* Optimistic updates and rollback
* Stale caches
* Query invalidation
* Race conditions when switching restaurants
* Memory leaks
* Event-listener cleanup
* WebSocket cleanup
* Accessibility of critical flows
* Responsive behavior affecting usability
* Localization fallback and missing keys
* Hard-coded user-facing strings
* Error boundaries
* Offline or poor-network behavior
* Large bundle or lazy-loading problems
* Exposure of sensitive data in browser storage
* Trust placed in route guards or hidden buttons instead of backend authorization

Prioritize functional production risks over cosmetic issues.

## Phase 7 — Backend reliability and API design

Inspect:

* DTO validation
* Transformation/coercion
* Unknown-field handling
* Validation of nested objects
* Pagination boundaries
* Filtering and sorting inputs
* Consistent HTTP status codes
* Error contracts
* Authentication and authorization order
* Tenant scoping
* Service-to-service assumptions
* Transactions
* External-call timeout and retry policies
* Circuit-breaking or degradation
* Graceful shutdown
* Background-job reliability
* Idempotency
* Logging and request correlation
* Health/readiness endpoints
* Database connection exhaustion
* Resource cleanup
* Unhandled promise rejections
* Process-crashing paths

## Phase 8 — Production configuration and deployment

Review all production-related configuration.

Check:

* Environment-variable validation
* Secure production defaults
* Docker images and stages
* Non-root execution
* Exposed ports
* Health checks
* Readiness versus liveness
* Restart behavior
* Database migration strategy
* Rollback strategy
* Persistent storage
* Horizontal scaling
* WebSocket scaling
* Reverse-proxy assumptions
* Trusted proxy configuration
* HTTPS enforcement
* CORS allowlists
* Cookie domains and flags
* Frontend/backend URL configuration
* Test/live Stripe separation
* Source maps
* Debug logging
* Secret handling
* Backup and restore readiness
* Observability
* Error reporting
* Log redaction
* Resource limits
* Rate limiting across multiple instances
* Cache/pub-sub dependencies
* CI gates
* Whether deployment can succeed while tests or migrations are failing

Search for dangerous fallback values such as localhost URLs, placeholder secrets, permissive origins, test credentials, or development mode activated when an environment variable is missing.

## Phase 9 — Documentation and implementation consistency

Compare the implementation with:

* README
* `CLAUDE.md`
* Architecture documentation
* Feature documentation
* API documentation
* Schema documentation
* Deployment guides
* Previous audit reports
* Implementation plans

Identify:

* Documented features that are incomplete
* Implemented behavior missing from documentation
* Stale architecture descriptions
* Incorrect commands
* Incorrect environment variables
* Security claims not supported by code
* Old plans incorrectly presented as current work
* Previously reported issues that remain unresolved
* Previous reports that claim a fix without sufficient code evidence

The current code is the source of truth for what exists. It is not automatically the source of truth for what is correct.

## Phase 10 — Tests and production smoke-test design

Evaluate whether the existing tests cover the highest-risk behavior.

Pay special attention to missing tests for:

* Cross-tenant access
* Role escalation
* Public endpoint data leakage
* Server-side price validation
* Duplicate order submission
* Stripe webhook replay
* Out-of-order Stripe events
* Translation cache isolation
* Reservation concurrency
* WebSocket room authorization
* Plan-limit bypass
* Token revocation
* Upload validation
* Database rollback after side-effect failure

Then create a realistic manual smoke-test checklist that can be executed before release.

For every smoke test include:

* Preconditions
* Account/role required
* Exact actions
* Expected result
* Data to verify
* Relevant logs or events to inspect
* Cleanup required
* Whether it is safe in staging only

Prioritize tests into:

* P0 release blockers
* P1 required before general availability
* P2 important regression checks

Include negative and abuse cases, not only successful flows.

## Required evidence standard

Every confirmed finding must contain:

1. Unique ID
2. Short title
3. Classification
4. Severity
5. Confidence
6. Affected user or system
7. Exact file path
8. Exact symbol, method, component, route, or schema entity
9. Line number or small line range when stable
10. Evidence from the code
11. Reproduction scenario or failure sequence
12. Why it matters in production
13. Recommended fix
14. Suggested regression tests
15. Fix risk or possible side effects
16. Related findings, if any

Use these severities:

* **Critical** — exploitable security failure, cross-tenant compromise, payment/data corruption, or issue likely to cause catastrophic production harm
* **High** — major user-flow failure, authorization weakness, serious data-integrity risk, or likely outage
* **Medium** — meaningful defect with limited scope or realistic workaround
* **Low** — minor reliability or maintainability concern
* **Informational** — useful observation that is not itself a defect

Use these classifications:

* Confirmed defect
* Probable risk
* Missing safeguard
* Missing test
* Maintainability concern
* Needs manual verification

Do not use “Critical” or “High” without a concrete failure or attack path.

## Required output

Create or replace:

```text
PRODUCTION_READINESS_AUDIT.md
```

Use this structure:

```markdown
# Production Readiness Audit

## 1. Executive verdict
- Verdict: NOT READY / CONDITIONALLY READY / READY
- Date and reviewed commit
- Overall confidence
- Main reasons
- Release recommendation

## 2. Release blockers
A concise list of all Critical and High findings that block production.

## 3. Repository and architecture inventory
Subsystems, entry points, external services, trust boundaries, and data flows.

## 4. Audit coverage
### Fully inspected
### Partially inspected
### Not inspected
### Blockers and limitations

## 5. Automated verification results
Commands, status, important output, and limitations.

## 6. Critical findings

## 7. High findings

## 8. Medium findings

## 9. Low and informational findings

## 10. Security and tenant-isolation assessment

## 11. Data-integrity and concurrency assessment

## 12. Payments assessment

## 13. Realtime/WebSocket assessment

## 14. Frontend reliability assessment

## 15. Backend and API assessment

## 16. Production configuration assessment

## 17. Test-quality and coverage gaps

## 18. Documentation drift

## 19. Manual verification required

## 20. Prioritized remediation plan
### P0 — must fix before production
### P1 — fix before general availability
### P2 — fix soon after launch

Include dependency order and identify fixes that should be handled together.

## 21. Staging smoke-test checklist

## 22. Production launch checklist

## 23. Rollback and incident-readiness checklist

## 24. Final go/no-go criteria

## Appendix A — Commands executed

## Appendix B — Files and subsystems reviewed

## Appendix C — Findings index
```

For the findings index, use a compact table containing:

| ID | Severity | Classification | Area | Title | Status |
| -- | -------- | -------------- | ---- | ----- | ------ |

## Review completion gate

Do not finish until:

* Every discovered backend module is accounted for
* Every frontend feature area is accounted for
* Every public endpoint is checked
* Every authenticated route is checked for authorization and tenant ownership
* Every WebSocket event is checked
* Every payment webhook and state transition is checked
* Every external integration is checked for failure behavior
* Database constraints and migrations are reviewed
* Existing tests and skipped tests are reviewed
* Production configuration is reviewed
* Documentation claims are compared with implementation
* Unreviewed areas are explicitly disclosed

At the end, print a short terminal summary containing only:

1. Overall verdict
2. Count by severity and classification
3. P0 release blockers
4. Automated checks that failed or could not run
5. Location of `PRODUCTION_READINESS_AUDIT.md`
6. The next recommended action

Do not implement fixes yet. After delivering the audit, stop and wait for explicit approval before modifying application code.
