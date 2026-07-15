# QR Digital Menu Domain

This glossary distinguishes device-local staff work from authoritative restaurant records, and keeps customer-facing menu classification separate from recommendation signals.

## Staff Ordering

**POS Draft**:
An editable cart for one selected table that exists only on the staff device and has not been submitted.
_Avoid_: Offline order, pending order

**Queued POS Order**:
An immutable staff submission stored on the device until the backend acknowledges it for the same client-generated identifier.
_Avoid_: Draft, server order

**Server Order**:
The authoritative order persisted by the backend and eligible for kitchen events, printing, billing, and analytics.
_Avoid_: Synced draft

**Table Session**:
The backend-owned open bill for a restaurant table to which one or more server orders belong.
_Avoid_: POS session, cart session

**Table Session Expectation**:
The Table Session identity, or explicit empty-table state, observed when a Queued POS Order is submitted locally. Automatic sync is allowed only while the server still matches that expectation.
_Avoid_: Cached session, target session

**Sync Conflict**:
A Queued POS Order whose table, menu, pricing, or authorization preconditions no longer match authoritative server state and therefore requires explicit staff resolution.
_Avoid_: Failed order, retryable network error

## Upselling

**Dietary Tag**:
A customer-facing menu classification such as vegan or gluten-free.
_Avoid_: Upsell tag, context tag

**Upsell Context**:
The restaurant-local conditions used to rank eligible suggestions, such as daypart, weekday, and a coarse weather state.
_Avoid_: Trending mode, dietary tag

**Upsell Tag**:
A staff-managed menu-item classification used only by recommendation scoring, such as morning, hot drink, or cold drink.
_Avoid_: Dietary tag
