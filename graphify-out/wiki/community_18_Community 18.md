# Community 18

**Community 18** — 12 nodes

## Nodes

### 3-step state machine modal Р Р†Р вЂљРІР‚Сњ entry (Google + email + phone inputs) -> OTP (6-digit code with 60s resend countdown) -> welcome card for new customers

- **ID:** `CustomerLoginModal_Detail`
- **Type:** code
- **Degree:** 1
- **Source:** `30.04.26_cursor_markdown_file_issue_outline.md`

### Email OTP authentication system Р Р†Р вЂљРІР‚Сњ VerificationToken model (id, email, bcrypt-hashed 6-digit code, 10-min expiry, 60s rate-limit), Resend REST API for production, devCode fallback for local dev

- **ID:** `CustomerOTP_Detail`
- **Type:** code
- **Degree:** 1
- **Source:** `30.04.26_cursor_markdown_file_issue_outline.md`
- **Outbound:**
  - → `3-step state machine modal Р Р†Р вЂљРІР‚Сњ entry (Google + email + phone inputs) -> OTP (6-digit code with 60s resend countdown) -> welcome card for new customers` [_`powers`_ | EXTRACTED | score: 1.0]

### RestaurantContext missing fetchRestaurants export Р Р†Р вЂљРІР‚Сњ caused silent crash after settings save, no error feedback to user

- **ID:** `RestaurantContextBug`
- **Type:** code
- **Degree:** 0
- **Source:** `30.04.26_cursor_markdown_file_issue_outline.md`
