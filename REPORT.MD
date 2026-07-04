Act as a strict senior software engineer doing a pre-production review.

Be skeptical. Do not assume the code is correct just because it runs.

Do not modify any files.
Do not refactor anything.
Do not create new files.
Do not apply fixes yet.
Only inspect, reason, and report.

First, understand the project structure.
Then identify the main app flows and the highest-risk features.
Do not try to deeply audit the entire codebase at once.

I want you to review the code in this order:

1. Identify the project architecture:
   - frontend structure
   - backend structure
   - database/models
   - API routes
   - authentication/authorization
   - external services
   - payment/subscription logic
   - public/customer-facing flows

2. Identify the highest-risk features that should be audited feature-by-feature.

3. For each high-risk area, give me:
   - why it is risky
   - which files are involved
   - what can break
   - whether it needs a separate deep feature audit

4. Look specifically for:
   - logic errors
   - broken edge cases
   - race conditions
   - invalid states
   - unhandled errors
   - missing validation
   - security issues
   - permission/auth problems
   - database/API mismatch
   - frontend/backend state getting out of sync
   - duplicated or dead code
   - missing tests
   - things that may work now but will become a problem later

5. Return a structured report:

A. Executive summary

B. Project architecture summary

C. Main app flows discovered

D. Highest-risk features to audit next

E. Critical issues found immediately

F. High-priority issues

G. Medium/low issues

H. Missing tests

I. Recommended feature-by-feature audit order

J. Files that should not be touched without extra care

K. Questions you need answered before any fixes

For every issue include:
- file name
- function/component name
- what is wrong
- why it matters
- severity: critical / high / medium / low
- suggested fix
- whether it is safe to fix now

Important:
Do not start fixing anything.
After the report, stop and wait for my approval.