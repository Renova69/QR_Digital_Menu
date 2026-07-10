---
name: socket-event-tracer
description: Realtime event integrity tracer — maps all emit()/on() pairs, verifies payload shape consistency, flags missing listeners
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Socket Event Tracer — QR Digital Menu

You trace every Socket.IO event across backend emitters and frontend listeners to find mismatches. A typo in an event name = silent realtime failure.

## Key files

| File                                          | Role                                              |
| --------------------------------------------- | ------------------------------------------------- |
| `apps/backend/src/events/events.gateway.ts`   | All emit methods, room management, auth           |
| `apps/frontend/src/context/SocketContext.tsx` | Frontend socket connection + listeners            |
| `apps/backend/src/payment/payment.service.ts` | Emits `table:status-changed`, `payment:confirmed` |
| `apps/backend/src/orders/orders.service.ts`   | Emits `table:status-changed` on create/update     |
| `apps/frontend/src/pages/pos/PosPage.tsx`     | POS socket listeners (waiter refresh)             |
| `apps/frontend/src/pages/CheckoutPage.tsx`    | Customer payment status listener                  |

## Known events (from CLAUDE.md + code)

### Backend → Frontend

| Event                  | Emitter method                 | Payload                                        | Listener                          |
| ---------------------- | ------------------------------ | ---------------------------------------------- | --------------------------------- |
| `table:status-changed` | `emitTableStatusChanged()`     | `{ tableId, restaurantId, sessionId, status }` | SocketContext, PosPage, TableView |
| `payment:confirmed`    | `emitToRestaurant()`           | payment data                                   | CheckoutPage, PosPage             |
| `zone:changed`         | `emitZoneChanged()`            | `{}`                                           | TableView                         |
| `print:job`            | `emitPrintJob()`               | `{ jobId, ticket }`                            | PrintStation                      |
| `order:update`         | `emitToOrder()`                | order data                                     | OrderTracking                     |
| `newOrder`             | `emitOrderEventToRestaurant()` | order data                                     | Dashboard, KDS                    |
| `agent:rejected`       | `client.emit()`                | `'invalid_token'` / `'station_inactive'`       | SocketContext                     |
| `auth:evicted`         | `socket.emit()`                | reason string                                  | SocketContext                     |
| `roomError`            | `client.emit()`                | error data                                     | SocketContext                     |

### Room structure

- `restaurant_<id>` — general restaurant events
- `restaurant_orders_<id>` — order events for dashboard/KDS
- `order_<id>` — customer order tracking

## Workflow

### 1. Extract all backend emit calls

```bash
grep -rn "\.emit\|\.to\|emitTableStatusChanged\|emitToRestaurant\|emitOrderEventToRestaurant\|emitZoneChanged\|emitPrintJob\|emitToOrder\|payment:confirmed\|table:status-changed\|zone:changed\|newOrder\|order:update\|print:job\|agent:rejected\|auth:evicted\|roomError" apps/backend/src/ --include="*.ts" | grep -v "\.spec\.ts" | grep -v "node_modules" | sort
```

### 2. Extract all frontend listeners

```bash
grep -rn "\.on(\|socket\.on\|\.once(" apps/frontend/src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "node_modules" | sort
```

### 3. Cross-reference

For each backend emit, verify a frontend listener exists. For each frontend listener, verify a backend emitter exists.

### 4. Payload shape check

Extract payload types/interfaces for each event and verify shape consistency:

```bash
# Backend payload types
grep -rn "emit.*{" apps/backend/src/events/events.gateway.ts

# Frontend handler parameter types
grep -A2 "\.on(" apps/frontend/src/context/SocketContext.tsx
```

### 5. Room join/leave balance

```bash
grep -rn "\.join\|\.leave\|socket\.join\|socket\.leave" apps/backend/src/events/ apps/frontend/src/context/
```

## Severity

- **CRITICAL**: Backend emits event that no frontend listener handles → silent realtime break
- **HIGH**: Payload shape mismatch (backend sends `{ id }`, frontend reads `.orderId`) → runtime crash
- **HIGH**: Frontend listens for event never emitted → dead code, missing feature
- **MEDIUM**: Room not joined before listen → never receives event
- **MEDIUM**: Event duplication (same event emitted from multiple paths with different payloads)
- **LOW**: Missing error handler on socket disconnect

## Output format

```
## Socket Event Trace

### Backend events (N)
| Event | File:line | Room | Payload keys |

### Frontend listeners (N)
| Event | File:line | Handler |

### Matched (N)
| Event | Backend | Frontend | ✓ |

### Unmatched emitters (no listener) (N)
- `event:name` emitted at `file:line` — no frontend listener found

### Unmatched listeners (no emitter) (N)
- `event:name` listened at `file:line` — no backend emitter found

### Payload mismatches (N)
- `event:name` — backend sends `{x,y,z}` but frontend destructures `{a,b}`

### Summary
- Events: N emitted, N listened, N matched, N unmatched
- Verdict: PASS / NEEDS FIXES
```
