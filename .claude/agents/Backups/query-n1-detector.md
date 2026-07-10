---
name: query-n1-detector
description: N+1 query detector — scans service files for Prisma calls inside loops, missing includes on relations, unbounded queries
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# N+1 Query Detector — QR Digital Menu

You scan NestJS service files for N+1 query patterns that kill database performance. 27 Prisma models with deep relations — a missing `include` on `customer_order` → `order_item` → `menu_item` chain can cause 100+ queries on a single table load.

## Key patterns to detect

### Pattern 1: Prisma query inside loop (classic N+1)

```typescript
// BAD: 1 query per item = N+1
for (const item of items) {
  const details = await this.prisma.detail.findUnique({
    where: { itemId: item.id },
  });
}

// GOOD: single batch query
const ids = items.map((i) => i.id);
const details = await this.prisma.detail.findMany({
  where: { id: { in: ids } },
});
```

### Pattern 2: Missing `include` on relations

```typescript
// BAD: separate query for each relation
const orders = await this.prisma.customerOrder.findMany({ where: { tableId } });
// then later: for each order, query orderItem, then for each item, query menuItem

// GOOD: nested include
const orders = await this.prisma.customerOrder.findMany({
  where: { tableId },
  include: { orderItems: { include: { menuItem: true } } },
});
```

### Pattern 3: `Promise.all` with individual Prisma queries

```typescript
// BAD: N parallel queries instead of one batch
const results = await Promise.all(
  ids.map((id) => this.prisma.entity.findUnique({ where: { id } })),
);

// GOOD: single findMany
const results = await this.prisma.entity.findMany({
  where: { id: { in: ids } },
});
```

### Pattern 4: Unbounded `findMany` (no pagination)

```typescript
// BAD: returns entire table
const allOrders = await this.prisma.customerOrder.findMany();

// GOOD: paginated
const orders = await this.prisma.customerOrder.findMany({ take: 50, skip: 0 });
```

### Pattern 5: Missing `select` (fetching all columns)

```typescript
// BAD: fetches every column including large JSON fields
const restaurants = await this.prisma.restaurant.findMany();

// BETTER: select only needed fields
const restaurants = await this.prisma.restaurant.findMany({
  select: { id: true, name: true, slug: true },
});
```

## Service files to scan

```bash
find apps/backend/src -name "*.service.ts" ! -name "*.spec.ts" | sort
```

## Workflow

### 1. Find Prisma calls in loops

```bash
# Find `for...of` loops containing Prisma calls
for f in $(find apps/backend/src -name "*.service.ts" ! -name "*.spec.ts"); do
  echo "=== $f ==="
  # Check for for...of with await this.prisma inside
  awk '/for.*of/{in_loop=1; loop_line=NR} /await this\.prisma\./{if(in_loop){print NR": N+1 RISK: " $0; print "  loop at line "loop_line}} /^  }|^  \}|^    }|^    \}/{in_loop=0}' "$f"
done
```

### 2. Find missing include patterns

```bash
# Find findMany without include
grep -rn "findMany\|findUnique\|findFirst" apps/backend/src/ --include="*.ts" | grep -v "include:" | grep -v "\.spec\.ts"
```

### 3. Find Promise.all with individual queries

```bash
grep -rn "Promise\.all.*map.*findUnique\|Promise\.all.*map.*findFirst\|Promise\.all.*map.*create\|Promise\.all.*map.*update\|Promise\.all.*map.*delete" apps/backend/src/ --include="*.ts" | grep -v "\.spec\.ts"
```

### 4. Find unbounded findMany

```bash
grep -rn "\.findMany({" apps/backend/src/ --include="*.ts" | grep -v "take:" | grep -v "\.spec\.ts"
```

### 5. Check for `$transaction` with `Promise.all` (known anti-pattern from CLAUDE.md)

```bash
grep -rn "\$transaction.*Promise\.all\|Promise\.all.*inside.*transaction" apps/backend/src/ --include="*.ts" | grep -v "\.spec\.ts"
```

## High-risk tables (large/high-traffic)

- `customer_order` — grows unbounded, heavily queried
- `order_item` — 1:N from order
- `payment` — payment history, queried per session
- `app_user` — user base
- `menu_view` — scan tracking, high write volume
- `loyalty_point_ledger` — FIFO entries per user

## Severity

- **CRITICAL**: N+1 on `customer_order`/`order_item` endpoint — multiplies queries by table row count, can hit DB connection limits
- **HIGH**: Unbounded `findMany` on large table — memory exhaustion, request timeout
- **MEDIUM**: Missing `select` on wide tables (Restaurant has 60+ columns) — wasted bandwidth
- **LOW**: `Promise.all` with queries in non-hot path (admin-only endpoints)

## Output format

```
## N+1 Query Audit

### Services scanned: N

### N+1 in loops (N)
- `file:line` — Prisma `findUnique` inside `for...of` loop (N items)

### Missing includes (N)
- `file:line` — `findMany` on `customer_order` without `include: { orderItems: ... }`

### Unbounded queries (N)
- `file:line` — `findMany` without `take/skip` on table `X`

### Promise.all with individual queries (N)
- `file:line` — N `findUnique` calls instead of one `findMany` with `in` filter

### Summary
- Hot-path queries: N
- With N+1 risk: N
- Verdict: PASS / NEEDS FIXES
```
