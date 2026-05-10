# Waiter POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/staff/pos` route with isolated PosContext, table session management, rapid item grid, seat-level ordering, and cart submission — zero impact on existing customer routes.

**Architecture:** New `PosLayout` (third layout alongside `AppLayout`/`PublicLayout`) wraps `PosContext`-scoped components. One new backend endpoint (`force-open`) on `PaymentController`. All existing contexts (`AuthContext`, `RestaurantContext`, `SocketContext`) remain accessible inside POS. Order submission reuses existing `POST /orders`.

**Tech Stack:** React 18, Tailwind CSS 4, Radix UI (Sheet, Dialog), TanStack Query, Socket.IO client, NestJS (backend), Prisma, `qrcode.react` (if installed).

---

## File Structure

```
Create:
  apps/frontend/src/components/StaffRoute.tsx
  apps/frontend/src/context/PosContext.tsx
  apps/frontend/src/pages/pos/PosLayout.tsx
  apps/frontend/src/pages/pos/PosPage.tsx
  apps/frontend/src/components/pos/PosTopBar.tsx
  apps/frontend/src/components/pos/PosCategoryFilter.tsx
  apps/frontend/src/components/pos/PosItemGrid.tsx
  apps/frontend/src/components/pos/PosItemCard.tsx
  apps/frontend/src/components/pos/PosOptionsDrawer.tsx
  apps/frontend/src/components/pos/PosCartDrawer.tsx
  apps/frontend/src/components/pos/PosSeatSelector.tsx
  apps/frontend/src/components/pos/PosTableModal.tsx
  apps/frontend/src/components/pos/PosSplitBill.tsx
  apps/frontend/src/components/pos/PosQRBill.tsx

Modify:
  apps/frontend/src/App.tsx
  apps/frontend/src/lib/api.ts
  apps/backend/src/payment/payment.controller.ts
  apps/backend/src/payment/payment.service.ts
```

---

### Task 1: Backend — force-open session endpoint

**Files:**
- Modify: `apps/backend/src/payment/payment.service.ts`
- Modify: `apps/backend/src/payment/payment.controller.ts`

- [ ] **Step 1: Add `forceOpenSession()` method to PaymentService**

In `apps/backend/src/payment/payment.service.ts`, add after `closeSession()` (after line 243):

```typescript
async forceOpenSession(
  tableId: string,
  restaurantId: string,
): Promise<{ session: any; token: string }> {
  const table = await this.prisma.restaurantTable.findFirst({
    where: { id: tableId, restaurantId },
  });
  if (!table) throw new NotFoundException('Table not found for this restaurant');

  const session = await this.prisma.$transaction(async (tx) => {
    const existing = await tx.tableSession.findFirst({
      where: { tableId, restaurantId, status: 'OPEN' },
    });
    if (existing) {
      await tx.tableSession.update({
        where: { id: existing.id },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      this.events.emitTableStatusChanged(restaurantId, existing.tableId, existing.id);
    }
    return tx.tableSession.create({
      data: { tableId, restaurantId },
    });
  });

  this.events.emitTableStatusChanged(restaurantId, tableId, session.id);
  return { session, token: session.token };
}
```

- [ ] **Step 2: Add `force-open` endpoint to PaymentController**

In `apps/backend/src/payment/payment.controller.ts`, add after the `getOrCreateSession` method (after line 31):

```typescript
@Post('session/force-open')
@HttpCode(HttpStatus.OK)
@UseGuards(JwtAuthGuard)
forceOpenSession(
  @Body() body: { tableId: string; restaurantId: string },
) {
  return this.paymentService.forceOpenSession(body.tableId, body.restaurantId);
}
```

- [ ] **Step 3: Add `forceOpenSession` to frontend API layer**

In `apps/frontend/src/lib/api.ts`, add after the `getOrCreateSession` function (after line 182):

```typescript
export const forceOpenSession = async (tableId: string, restaurantId: string) => {
  const response = await api.post('/payments/session/force-open', { tableId, restaurantId });
  return response.data as { session: any; token: string };
};
```

- [ ] **Step 4: Verify backend compiles**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/payment/payment.service.ts apps/backend/src/payment/payment.controller.ts apps/frontend/src/lib/api.ts
git commit -m "feat: add force-open session endpoint for POS"
```

---

### Task 2: StaffRoute auth guard

**Files:**
- Create: `apps/frontend/src/components/StaffRoute.tsx`

- [ ] **Step 1: Create StaffRoute component**

```tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ALLOWED_ROLES = ["OWNER", "STAFF"];

export default function StaffRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/StaffRoute.tsx
git commit -m "feat: add StaffRoute auth guard for STAFF/OWNER roles"
```

---

### Task 3: PosContext — isolated cart state

**Files:**
- Create: `apps/frontend/src/context/PosContext.tsx`

- [ ] **Step 1: Create PosContext with full implementation**

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface PosCartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: Array<{
    optionId: string;
    optionName: string;
    choiceName: string;
    priceModifier: number;
  }>;
  seatNumber: string;
  itemNote: string;
}

interface PosSession {
  tableId: string;
  tableName: string;
  sessionToken: string | null;
  sessionId: string | null;
}

interface PosContextType {
  items: PosCartItem[];
  addItem: (item: Omit<PosCartItem, "cartId">) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  updateNote: (cartId: string, note: string) => void;
  clearCart: () => void;
  session: PosSession | null;
  setSession: (s: PosSession) => void;
  clearSession: () => void;
  getTotal: () => number;
  activeSeat: string;
  setActiveSeat: (seat: string) => void;
  buildSpecialRequests: () => string;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [session, setSessionState] = useState<PosSession | null>(null);
  const [activeSeat, setActiveSeat] = useState("Seat 1");

  const addItem = useCallback((item: Omit<PosCartItem, "cartId">) => {
    const cartId = crypto.randomUUID();
    setItems((prev) => [...prev, { ...item, cartId }]);
  }, []);

  const removeItem = useCallback((cartId: string) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  }, []);

  const updateQuantity = useCallback((cartId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.cartId !== cartId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, quantity: qty } : i))
    );
  }, []);

  const updateNote = useCallback((cartId: string, note: string) => {
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, itemNote: note } : i))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const setSession = useCallback((s: PosSession) => {
    setSessionState(s);
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    setItems([]);
    setActiveSeat("Seat 1");
  }, []);

  const getTotal = useCallback(() => {
    return items.reduce((sum, item) => {
      const optionsTotal = item.selectedOptions.reduce(
        (optSum, opt) => optSum + opt.priceModifier,
        0
      );
      return sum + (item.price + optionsTotal) * item.quantity;
    }, 0);
  }, [items]);

  const buildSpecialRequests = useCallback(() => {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
      const seat = item.seatNumber || "Shared";
      if (!grouped.has(seat)) grouped.set(seat, []);
      let entry = item.name;
      if (item.itemNote) entry += `: ${item.itemNote}`;
      if (item.quantity > 1) entry += ` x${item.quantity}`;
      grouped.get(seat)!.push(entry);
    }
    return Array.from(grouped.entries())
      .map(([seat, entries]) => `[${seat}] ${entries.join(", ")}`)
      .join(" | ");
  }, [items]);

  const value: PosContextType = {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    session,
    setSession,
    clearSession,
    getTotal,
    activeSeat,
    setActiveSeat,
    buildSpecialRequests,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const context = useContext(PosContext);
  if (context === undefined) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/context/PosContext.tsx
git commit -m "feat: add PosContext with in-memory cart, session, and seat state"
```

---

### Task 4: PosLayout — full-viewport shell

**Files:**
- Create: `apps/frontend/src/pages/pos/PosLayout.tsx`

- [ ] **Step 1: Create PosLayout**

```tsx
import { Outlet } from "react-router-dom";

export default function PosLayout() {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/pos/PosLayout.tsx
git commit -m "feat: add PosLayout — full-viewport shell for POS"
```

---

### Task 5: PosPage — component composition

**Files:**
- Create: `apps/frontend/src/pages/pos/PosPage.tsx`

- [ ] **Step 1: Create PosPage shell**

```tsx
import { usePos } from "../../context/PosContext";
import PosTopBar from "../../components/pos/PosTopBar";
import PosCategoryFilter from "../../components/pos/PosCategoryFilter";
import PosItemGrid from "../../components/pos/PosItemGrid";
import PosTableModal from "../../components/pos/PosTableModal";
import PosOptionsDrawer from "../../components/pos/PosOptionsDrawer";
import PosSeatSelector from "../../components/pos/PosSeatSelector";
import PosCartDrawer from "../../components/pos/PosCartDrawer";

export default function PosPage() {
  const { session, items, getTotal } = usePos();

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = getTotal();

  return (
    <>
      {/* Sticky top — hidden until table selected */}
      {session && (
        <div className="sticky top-0 z-10 bg-background pt-safe">
          <PosTopBar />
          <PosCategoryFilter />
        </div>
      )}

      {/* Scrollable content */}
      {session ? (
        <div className="flex-1 overflow-y-auto">
          <PosItemGrid />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Fixed bottom bar — hidden until table selected */}
      {session && (
        <div className="sticky bottom-0 z-10 bg-background border-t border-border pb-safe">
          <PosSeatSelector />
          <PosCartDrawer itemCount={itemCount} total={total} />
        </div>
      )}

      {/* Modals — always mounted */}
      <PosTableModal />
      <PosOptionsDrawer />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/pos/PosPage.tsx
git commit -m "feat: create PosPage shell composing POS components"
```

---

### Task 6: PosTableModal — table selection

**Files:**
- Create: `apps/frontend/src/components/pos/PosTableModal.tsx`

- [ ] **Step 1: Create PosTableModal component**

```tsx
import { useState, useEffect, useContext } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getTableStatuses, getOrCreateSession, forceOpenSession } from "../../lib/api";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";

interface TableStatus {
  id: string;
  name: string;
  status: "empty" | "occupied" | "paid" | "waiting";
  sessionId: string | null;
  orderCount: number;
  totalAmount: number;
  customerNames: string[];
  sessionStatus: string | null;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  empty: "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400",
  occupied: "bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400",
  paid: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400",
  waiting: "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-400",
};

export default function PosTableModal() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const { session, setSession } = usePos();

  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Auto-open when no session (fresh POS entry)
  useEffect(() => {
    if (!session) {
      setOpen(true);
    }
  }, [session]);

  // Listen for external open requests (e.g. from PosTopBar)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("pos:open-table-modal", handler);
    return () => window.removeEventListener("pos:open-table-modal", handler);
  }, []);

  useEffect(() => {
    if (open && activeRestaurant) {
      setLoading(true);
      getTableStatuses(activeRestaurant.id)
        .then(setTables)
        .finally(() => setLoading(false));
    }
  }, [open, activeRestaurant]);

  const handleSelect = async (table: TableStatus) => {
    if (!activeRestaurant) return;
    try {
      const result = await getOrCreateSession(table.id, activeRestaurant.id);
      setSession({
        tableId: table.id,
        tableName: table.name,
        sessionToken: result.token,
        sessionId: result.session.id,
      });
      setOpen(false);
    } catch (err) {
      console.error("Failed to open session:", err);
    }
  };

  const handleForceOpen = async (table: TableStatus) => {
    if (!activeRestaurant) return;
    try {
      const result = await forceOpenSession(table.id, activeRestaurant.id);
      setSession({
        tableId: table.id,
        tableName: table.name,
        sessionToken: result.token,
        sessionId: result.session.id,
      });
      setOpen(false);
    } catch (err) {
      console.error("Failed to force open session:", err);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    // Only allow closing if session is active (user selected a table)
    if (session && !isOpen) return;
    setOpen(isOpen);
  };

  if (!activeRestaurant) {
    return (
      <div className="flex items-center justify-center h-dvh text-muted-foreground">
        No restaurant selected.
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl bg-background p-6 pt-safe md:inset-auto md:top-1/2 md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:bottom-auto">
          <Dialog.Title className="text-lg font-semibold mb-1">
            Select Table
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Choose a table to start taking orders.
          </Dialog.Description>

          {session && (
            <button
              type="button"
              className="w-full mb-4 py-2 px-4 rounded-lg bg-accent text-accent-foreground font-medium"
              onClick={() => setOpen(false)}
            >
              Back to POS — {session.tableName}
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => handleSelect(table)}
                  className={`relative flex flex-col items-center justify-center p-4 rounded-lg border-2 min-h-[80px] transition-none ${STATUS_COLORS[table.status]}`}
                >
                  <span className="text-lg font-bold">{table.name}</span>
                  <span className="text-xs capitalize">{table.status}</span>
                  {table.sessionStatus === "OPEN" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleForceOpen(table);
                      }}
                      className="mt-2 text-xs underline opacity-70 hover:opacity-100"
                    >
                      Force Open
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}

          {!loading && tables.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No tables found. Create tables in the dashboard first.
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosTableModal.tsx
git commit -m "feat: add PosTableModal — table grid with status, force-open support"
```

---

### Task 7: PosTopBar — search + active table

**Files:**
- Create: `apps/frontend/src/components/pos/PosTopBar.tsx`

- [ ] **Step 1: Create PosTopBar component**

```tsx
import { useState, useContext } from "react";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";

export default function PosTopBar() {
  const { session } = usePos();
  const restaurantCtx = useContext(RestaurantContext);
  const [search, setSearch] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    window.dispatchEvent(
      new CustomEvent("pos:search", { detail: e.target.value })
    );
  };

  const handleOpenTableModal = () => {
    window.dispatchEvent(new CustomEvent("pos:open-table-modal"));
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <button
        type="button"
        onClick={handleOpenTableModal}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent text-accent text-sm font-medium shrink-0 min-h-[44px]"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        {session?.tableName ?? "Select Table"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosTopBar.tsx
git commit -m "feat: add PosTopBar with search input and active table chip"
```

---

### Task 8: PosCategoryFilter — sticky category pills

**Files:**
- Create: `apps/frontend/src/components/pos/PosCategoryFilter.tsx`

- [ ] **Step 1: Create PosCategoryFilter component**

```tsx
import { useState, useEffect, useContext } from "react";
import api from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";

interface Category {
  id: string;
  name: string;
}

export default function PosCategoryFilter() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRestaurant) return;
    api
      .get(`/menu/public/${activeRestaurant.id}`)
      .then((res) => {
        setCategories(res.data.categories ?? []);
      })
      .catch(() => {});
  }, [activeRestaurant]);

  const handleSelect = (categoryId: string | null) => {
    setActiveCategory(categoryId);
    window.dispatchEvent(
      new CustomEvent("pos:category-filter", { detail: categoryId })
    );
  };

  return (
    <div className="overflow-x-auto scrollbar-hide px-4 pb-3 flex gap-2">
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
          activeCategory === null
            ? "bg-accent/10 border border-accent text-accent"
            : "bg-card border border-border text-foreground"
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => handleSelect(cat.id)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
            activeCategory === cat.id
              ? "bg-accent/10 border border-accent text-accent"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosCategoryFilter.tsx
git commit -m "feat: add PosCategoryFilter — horizontally scrollable category pills"
```

---

### Task 9: PosItemCard — single item card

**Files:**
- Create: `apps/frontend/src/components/pos/PosItemCard.tsx`

- [ ] **Step 1: Create PosItemCard component**

```tsx
import { usePos } from "../../context/PosContext";

interface MenuOption {
  id: string;
  name: string;
  type: "VARIATION" | "ADDON";
  required: boolean;
  choices: Array<{ name: string; priceModifier: number }>;
}

interface PosItemCardProps {
  item: {
    id: string;
    name: string;
    price: number;
    options?: MenuOption[];
  };
}

export default function PosItemCard({ item }: PosItemCardProps) {
  const { addItem, activeSeat } = usePos();
  const hasOptions = item.options && item.options.length > 0;

  const handleTap = () => {
    if (hasOptions) {
      window.dispatchEvent(
        new CustomEvent("pos:open-options", { detail: item })
      );
    } else {
      addItem({
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        selectedOptions: [],
        seatNumber: activeSeat,
        itemNote: "",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      className="h-20 w-full flex flex-col justify-center px-3 py-2 rounded-lg bg-card border border-border text-left transition-none active:bg-accent/10 min-h-[44px]"
    >
      <span className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
        {item.name}
      </span>
      <span className="text-sm font-semibold text-accent mt-1">
        €{item.price.toFixed(2)}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosItemCard.tsx
git commit -m "feat: add PosItemCard — tap to add, triggers options drawer if needed"
```

---

### Task 10: PosItemGrid — 2-column item grid

**Files:**
- Create: `apps/frontend/src/components/pos/PosItemGrid.tsx`

- [ ] **Step 1: Create PosItemGrid component**

```tsx
import { useState, useEffect, useContext } from "react";
import api from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";
import PosItemCard from "./PosItemCard";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  options?: Array<{
    id: string;
    name: string;
    type: "VARIATION" | "ADDON";
    required: boolean;
    choices: Array<{ name: string; priceModifier: number }>;
  }>;
}

export default function PosItemGrid() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const [items, setItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeRestaurant) return;
    setLoading(true);
    api
      .get(`/menu/public/${activeRestaurant.id}`)
      .then((res) => {
        const allItems: MenuItem[] = [];
        const cats = res.data.categories ?? [];
        for (const cat of cats) {
          for (const item of cat.items ?? []) {
            allItems.push({ ...item, categoryId: cat.id });
          }
        }
        setItems(allItems);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeRestaurant]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail ?? "");
    };
    const onCategory = (e: Event) => {
      setCategoryFilter((e as CustomEvent).detail ?? null);
    };
    window.addEventListener("pos:search", onSearch);
    window.addEventListener("pos:category-filter", onCategory);
    return () => {
      window.removeEventListener("pos:search", onSearch);
      window.removeEventListener("pos:category-filter", onCategory);
    };
  }, []);

  const filtered = items.filter((item) => {
    if (categoryFilter && item.categoryId !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
        <p className="text-sm">No items found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4 pb-4">
      {filtered.map((item) => (
        <PosItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosItemGrid.tsx
git commit -m "feat: add PosItemGrid — 2-column grid with search/category filtering"
```

---

### Task 11: PosOptionsDrawer — modifier selection sheet

**Files:**
- Create: `apps/frontend/src/components/pos/PosOptionsDrawer.tsx`

- [ ] **Step 1: Create PosOptionsDrawer component**

```tsx
import { useState, useEffect } from "react";
import * as Sheet from "@radix-ui/react-dialog";
import { usePos } from "../../context/PosContext";

interface MenuOption {
  id: string;
  name: string;
  type: "VARIATION" | "ADDON";
  required: boolean;
  choices: Array<{ name: string; priceModifier: number }>;
}

interface ItemWithOptions {
  id: string;
  name: string;
  price: number;
  options?: MenuOption[];
}

export default function PosOptionsDrawer() {
  const { addItem, activeSeat } = usePos();
  const [item, setItem] = useState<ItemWithOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState<
    Record<string, { choiceName: string; priceModifier: number }>
  >({});
  const [itemNote, setItemNote] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ItemWithOptions;
      setItem(detail);
      setOpen(true);
      // Default select first choice for required VARIATION options
      const defaults: Record<string, { choiceName: string; priceModifier: number }> = {};
      for (const opt of detail.options ?? []) {
        if (opt.required && opt.choices.length > 0) {
          defaults[opt.id] = {
            choiceName: opt.choices[0].name,
            priceModifier: opt.choices[0].priceModifier,
          };
        }
      }
      setSelections(defaults);
      setItemNote("");
    };
    window.addEventListener("pos:open-options", handler);
    return () => window.removeEventListener("pos:open-options", handler);
  }, []);

  const handleChoice = (
    optionId: string,
    optionName: string,
    choiceName: string,
    priceModifier: number
  ) => {
    setSelections((prev) => ({
      ...prev,
      [optionId]: { choiceName, priceModifier },
    }));
  };

  const handleAddToCart = () => {
    if (!item) return;

    const selectedOptions = Object.entries(selections).map(
      ([optionId, sel]) => {
        const opt = item.options?.find((o) => o.id === optionId);
        return {
          optionId,
          optionName: opt?.name ?? "",
          choiceName: sel.choiceName,
          priceModifier: sel.priceModifier,
        };
      }
    );

    addItem({
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      selectedOptions,
      seatNumber: activeSeat,
      itemNote,
    });

    setOpen(false);
    setItem(null);
  };

  if (!item) return null;

  return (
    <Sheet.Root open={open} onOpenChange={setOpen}>
      <Sheet.Portal>
        <Sheet.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Sheet.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-xl bg-background p-6 pb-safe">
          <Sheet.Title className="text-lg font-semibold mb-1">
            {item.name}
          </Sheet.Title>
          <Sheet.Description className="text-sm text-muted-foreground mb-4">
            €{item.price.toFixed(2)}
          </Sheet.Description>

          {item.options?.map((opt) => (
            <div key={opt.id} className="mb-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                {opt.name}
                {opt.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </label>
              {opt.type === "VARIATION" ? (
                <div className="flex flex-wrap gap-2">
                  {opt.choices.map((choice) => {
                    const isSelected =
                      selections[opt.id]?.choiceName === choice.name;
                    return (
                      <button
                        key={choice.name}
                        type="button"
                        onClick={() =>
                          handleChoice(
                            opt.id,
                            opt.name,
                            choice.name,
                            choice.priceModifier
                          )
                        }
                        className={`px-3 py-2 rounded-lg text-sm min-h-[44px] transition-none ${
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "bg-card border border-border text-foreground"
                        }`}
                      >
                        {choice.name}
                        {choice.priceModifier > 0 &&
                          ` +€${choice.priceModifier.toFixed(2)}`}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {opt.choices.map((choice) => {
                    const isSelected =
                      selections[opt.id]?.choiceName === choice.name;
                    return (
                      <button
                        key={choice.name}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelections((prev) => {
                              const next = { ...prev };
                              delete next[opt.id];
                              return next;
                            });
                          } else {
                            setSelections((prev) => ({
                              ...prev,
                              [opt.id]: {
                                choiceName: choice.name,
                                priceModifier: choice.priceModifier,
                              },
                            }));
                          }
                        }}
                        className={`px-3 py-2 rounded-lg text-sm min-h-[44px] transition-none ${
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "bg-card border border-border text-foreground"
                        }`}
                      >
                        {choice.name}
                        {choice.priceModifier > 0 &&
                          ` +€${choice.priceModifier.toFixed(2)}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="mb-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Item Note
            </label>
            <input
              type="text"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="e.g. no salt, extra sauce..."
              className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className="w-full py-3 rounded-lg bg-accent text-accent-foreground font-semibold text-sm min-h-[44px]"
          >
            Add to Cart — €
            {(
              item.price +
              Object.values(selections).reduce(
                (sum, s) => sum + (s.priceModifier || 0),
                0
              )
            ).toFixed(2)}
          </button>
        </Sheet.Content>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosOptionsDrawer.tsx
git commit -m "feat: add PosOptionsDrawer — Radix Sheet for modifier/note selection"
```

---

### Task 12: PosSeatSelector — seat pill row

**Files:**
- Create: `apps/frontend/src/components/pos/PosSeatSelector.tsx`

- [ ] **Step 1: Create PosSeatSelector component**

```tsx
import { usePos } from "../../context/PosContext";

const SEATS = ["Seat 1", "Seat 2", "Seat 3", "Shared"];

export default function PosSeatSelector() {
  const { activeSeat, setActiveSeat } = usePos();

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
      {SEATS.map((seat) => (
        <button
          key={seat}
          type="button"
          onClick={() => setActiveSeat(seat)}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold min-h-[44px] transition-none ${
            activeSeat === seat
              ? "bg-accent text-accent-foreground"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {seat}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosSeatSelector.tsx
git commit -m "feat: add PosSeatSelector — seat pill row for grouping items"
```

---

### Task 13: PosCartDrawer — cart panel + submit

**Files:**
- Create: `apps/frontend/src/components/pos/PosCartDrawer.tsx`

- [ ] **Step 1: Create PosCartDrawer component**

```tsx
import { useState, useContext } from "react";
import { usePos } from "../../context/PosContext";
import { createOrder } from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";

interface PosCartDrawerProps {
  itemCount: number;
  total: number;
}

export default function PosCartDrawer({ itemCount, total }: PosCartDrawerProps) {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const {
    items,
    session,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    buildSpecialRequests,
  } = usePos();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (items.length === 0 || !session || !activeRestaurant) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const specialRequests = buildSpecialRequests();
      await createOrder({
        customerName: "Staff",
        tableId: session.tableId,
        restaurantId: activeRestaurant.id,
        specialRequests,
        tableSessionId: session.sessionId,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
        })),
      });
      clearCart();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? "Failed to submit order. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const itemsBySeat = items.reduce<Record<string, typeof items>>((acc, item) => {
    const seat = item.seatNumber || "Shared";
    if (!acc[seat]) acc[seat] = [];
    acc[seat].push(item);
    return acc;
  }, {});

  return (
    <div className="px-4 py-3">
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-3 px-4 rounded-lg bg-accent text-accent-foreground font-semibold min-h-[44px]"
      >
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"} · €{total.toFixed(2)}
        </span>
        <span>{expanded ? "Close" : "View Cart"}</span>
      </button>

      {/* Expanded cart */}
      {expanded && (
        <div className="mt-3 border border-border rounded-lg bg-card max-h-[40dvh] overflow-y-auto">
          {Object.entries(itemsBySeat).map(([seat, seatItems]) => (
            <div key={seat} className="px-4 py-2 border-b border-border last:border-b-0">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                [{seat}]
              </div>
              {seatItems.map((item) => (
                <div
                  key={item.cartId}
                  className="flex items-center gap-2 py-2 border-b border-border last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.name}
                    </div>
                    {item.selectedOptions.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {item.selectedOptions
                          .map((o) => o.choiceName)
                          .join(", ")}
                      </div>
                    )}
                    {item.itemNote && (
                      <div className="text-xs text-accent italic mt-0.5">
                        Note: {item.itemNote}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.cartId, item.quantity - 1)
                      }
                      className="h-8 w-8 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-sm"
                    >
                      −
                    </button>
                    <span className="text-sm w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.cartId, item.quantity + 1)
                      }
                      className="h-8 w-8 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-sm"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.cartId)}
                      className="h-8 w-8 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center text-sm ml-2"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {submitError && (
            <div className="px-4 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400">
              {submitError}
            </div>
          )}

          <div className="p-4">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Submitting..." : `Submit Order · €${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosCartDrawer.tsx
git commit -m "feat: add PosCartDrawer — expandable cart with seat groups, qty controls, submit"
```

---

### Task 14: Wire App.tsx — add POS route

**Files:**
- Modify: `apps/frontend/src/App.tsx`

- [ ] **Step 1: Add imports and POS route to App.tsx**

Add these imports at the top of `App.tsx` (after line 21):

```tsx
import PosLayout from "./pages/pos/PosLayout";
import PosPage from "./pages/pos/PosPage";
import StaffRoute from "./components/StaffRoute";
import { PosProvider } from "./context/PosContext";
```

Add this route block after the `</Route>` closing `AppLayout` routes and before the `{/* Customer-facing routes */}` comment (after line 80):

```tsx
{/* Staff POS — no chrome, full viewport */}
<Route element={<PosLayout />}>
  <Route
    path="/staff/pos"
    element={
      <StaffRoute>
        <PosProvider>
          <PosPage />
        </PosProvider>
      </StaffRoute>
    }
  />
</Route>
```

The final route structure of `App.tsx` should be:

```tsx
<Routes>
  {/* App shell — header + container */}
  <Route element={<AppLayout />}>
    {/* ... existing routes unchanged ... */}
  </Route>

  {/* Staff POS — no chrome, full viewport */}
  <Route element={<PosLayout />}>
    <Route
      path="/staff/pos"
      element={
        <StaffRoute>
          <PosProvider>
            <PosPage />
          </PosProvider>
        </StaffRoute>
      }
    />
  </Route>

  {/* Customer-facing routes — no header, full viewport */}
  <Route element={<PublicLayout />}>
    {/* ... existing routes unchanged ... */}
  </Route>
</Routes>
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors. If errors, fix before committing.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/App.tsx
git commit -m "feat: wire /staff/pos route with PosLayout, StaffRoute, PosProvider"
```

---

### Task 15: PosSplitBill — split bill calculator

**Files:**
- Create: `apps/frontend/src/components/pos/PosSplitBill.tsx`

- [ ] **Step 1: Create PosSplitBill component**

```tsx
import { useState } from "react";

interface PosSplitBillProps {
  total: number;
}

export default function PosSplitBill({ total }: PosSplitBillProps) {
  const [splitCount, setSplitCount] = useState(1);

  const perPerson =
    splitCount > 0 ? total / splitCount : total;

  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Split:</span>
        <button
          type="button"
          onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
          className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-sm min-h-[44px] min-w-[44px]"
        >
          −
        </button>
        <span className="text-lg font-bold text-foreground w-8 text-center">
          {splitCount}
        </span>
        <button
          type="button"
          onClick={() => setSplitCount(splitCount + 1)}
          className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-sm min-h-[44px] min-w-[44px]"
        >
          +
        </button>
        <span className="ml-auto text-lg font-bold text-accent">
          €{perPerson.toFixed(2)} / person
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosSplitBill.tsx
git commit -m "feat: add PosSplitBill — integer split calculator, per-person display"
```

---

### Task 16: PosQRBill — QR code for session bill

**Files:**
- Create: `apps/frontend/src/components/pos/PosQRBill.tsx`

- [ ] **Step 1: Check qrcode.react availability**

Run: `cd apps/frontend && cat package.json | grep qrcode`
If not installed: `npm install qrcode.react`

- [ ] **Step 2: Create PosQRBill component**

```tsx
import { QRCodeSVG } from "qrcode.react";
import { usePos } from "../../context/PosContext";

export default function PosQRBill() {
  const { session } = usePos();

  if (!session?.sessionToken) {
    return null;
  }

  const billUrl = `${window.location.origin}/checkout?session=${session.sessionToken}`;

  return (
    <div className="flex flex-col items-center p-4 border-t border-border">
      <p className="text-sm font-medium text-foreground mb-3">
        Payment QR — {session.tableName}
      </p>
      <div className="bg-white p-3 rounded-lg">
        <QRCodeSVG value={billUrl} size={200} />
      </div>
      <p className="text-xs text-muted-foreground mt-2 break-all text-center">
        {billUrl}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/pos/PosQRBill.tsx
git commit -m "feat: add PosQRBill — QR code pointing to session bill URL"
```

---

### Task 17: Integration — wire Phase D components into PosCartDrawer

**Files:**
- Modify: `apps/frontend/src/components/pos/PosCartDrawer.tsx`

- [ ] **Step 1: Add PosSplitBill and PosQRBill to the expanded cart view**

Import at top:

```tsx
import PosSplitBill from "./PosSplitBill";
import PosQRBill from "./PosQRBill";
```

Add before the submit button section in the expanded cart (before `<div className="p-4">` with the submit button):

```tsx
<PosSplitBill total={total} />
<PosQRBill />
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/pos/PosCartDrawer.tsx
git commit -m "feat: integrate split bill and QR bill into cart drawer"
```

---

### Task 18: Final verification — full build + POS smoke test

- [ ] **Step 1: Verify backend compiles and tests pass**

```bash
cd apps/backend && npx tsc --noEmit && npm test -- --passWithNoTests
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd apps/frontend && npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Manual smoke test checklist**
  - Navigate to `/staff/pos` — verify redirect to `/login` if unauthenticated
  - Login as OWNER or STAFF — verify POS loads with table modal
  - Select table — verify categories and items load
  - Tap item without options — verify immediate add to cart
  - Tap item with options — verify options drawer opens
  - Switch seats — verify items group correctly
  - Submit order — verify success + cart cleared
  - Force open on occupied table — verify new session created

- [ ] **Step 4: Commit final fixes if any**

```bash
git add -A
git commit -m "chore: final POS integration fixes from smoke test"
```

---

## Implementation Order

```
Task 1  (Backend force-open)
  ↓
Task 2  (StaffRoute)
  ↓
Task 3  (PosContext)
  ↓
Task 4  (PosLayout)
  ↓
Task 5  (PosPage shell)
  ↓
Task 6  (PosTableModal)
  ↓
Task 7  (PosTopBar)
  ↓
Task 8  (PosCategoryFilter)
  ↓
Task 9  (PosItemCard)
  ↓
Task 10 (PosItemGrid)
  ↓
Task 11 (PosOptionsDrawer)
  ↓
Task 12 (PosSeatSelector)
  ↓
Task 13 (PosCartDrawer)
  ↓
Task 14 (App.tsx wiring)
  ↓
Task 15 (PosSplitBill)
  ↓
Task 16 (PosQRBill)
  ↓
Task 17 (Phase D integration)
  ↓
Task 18 (Verification)
```

Tasks 7-13 are frontend leaf components that depend on PosContext (Task 3). They can be built in parallel once Task 3 is done, but sequential build avoids import errors with missing files.

---

## Post-Implementation Deviations (2026-05-10)

During code review and bug fixing, the implementation diverged from this plan in 12 areas. All deviations are **improvements** — the plan code had 3 critical bugs and 4 important functional gaps. This section documents the actual patterns so future maintainers are not misled by the original plan snippets.

### Critical Fixes (plan code was broken)

**1. Radix Dialog overlay pattern** (Tasks 11, 6)

Plan used `if (!item) return null` which unmounts `Dialog.Root` before Radix cleans up its Portal. The `fixed inset-0 z-50` overlay stays in `document.body`, invisible but blocking all clicks after first drawer interaction.

Actual pattern — always mount Root, conditionally render Portal content:
```tsx
<Dialog.Root open={open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    {item && (
      <>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content>...</Dialog.Content>
      </>
    )}
  </Dialog.Portal>
</Dialog.Root>
```

Also: uses `Dialog` import (not `Sheet`) for consistency with PosTableModal. Both import from `@radix-ui/react-dialog`.

**2. UUID generation** (Task 3)

Plan used `crypto.randomUUID()` directly. This throws `TypeError` in non-secure contexts (HTTP without localhost, some WebViews). Every tap on a non-option item → silent crash in click handler.

Actual: `generateId()` wrapper with `Math.random()` fallback:
```typescript
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

**3. createOrder payload** (Task 13)

Plan sent `tableId: session.tableId` (UUID) and `tableSessionId: session.sessionId` (field doesn't exist in DTO). Backend `OrdersService.create()` line 107 explicitly states: `"Frontend sends table name (e.g. '1'), not cuid — resolve to real id"`. Plan payload would cause every order to fail with `NotFoundException('Table not found')`.

Actual payload:
```typescript
await createOrder({
  customerName: "Staff",
  tableId: session.tableName,         // human-readable name, not UUID
  restaurantId: activeRestaurant.id,
  specialRequests,
  sessionToken: session.sessionToken,  // matches CreateOrderDto field
  items: items.map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    selectedOptions: item.selectedOptions,
  })),
});
```

### Important Gaps (plan missing required behavior)

**4. Centralized menu fetch** (Tasks 8, 10)

Plan had PosItemGrid and PosCategoryFilter each independently call `api.get(/menu/public/${activeRestaurant.id})`. This meant 2 requests for the same data, no request cancellation on unmount, and race conditions on restaurant switch.

Actual: PosPage fetches menu once with `AbortController`, passes `items`/`categories`/`loading`/`error` as props to child components. Both PosItemGrid and PosCategoryFilter are now pure presentational components that receive data via props.

**5. Inline note editing** (Task 13)

Plan had no note editing in the cart drawer (notes only settable at item-add time in the options drawer). Actual adds inline text input with `autoFocus`, Enter to save, Escape to cancel — replacing the even-worse `window.prompt()` from the initial implementation.

**6. Force Close session button** (Task 13)

Plan missed the Force Close requirement from the spec. Actual adds a "Force Close · No Payment" button in PosCartDrawer calling `closeSession(session.sessionToken, activeRestaurant.id)`.

**7. User-facing error states** (Task 6)

Plan used `console.error("Failed to open session:", err)` — silent failure with no user feedback. Actual adds `actionError` state with red error banner, plus a Retry button for table-load failures.

### Minor Improvements

**8. Case-insensitive role check** (Task 2)

Plan: `!ALLOWED_ROLES.includes(user.role)`. Actual: `!ALLOWED_ROLES.includes(user.role?.toUpperCase())`. Prisma enum is uppercase (`OWNER`/`STAFF`/`CUSTOMER`) so both work, but the defensive `toUpperCase()` adds zero-cost safety against future changes.

**9. Split bill cap at 20** (Task 15)

Plan: unbounded `setSplitCount(splitCount + 1)`. Actual: `setSplitCount(Math.min(20, splitCount + 1))`. No restaurant splits a bill 37 ways. Cap prevents nonsense values.

**10. Dead code removal** (Task 7)

Plan imported `useContext(RestaurantContext)` in PosTopBar but never used it. Actual removes the dead import.

**11. Visual feedback on item add** (Task 9)

Plan: no feedback. Actual: `added` state triggers `scale-[0.96]` + `bg-accent/20` animation for 200ms when item added to cart.

**12. Filter clearing on restaurant switch** (Tasks 8, 10)

Plan had no handling for restaurant change. Active category pills and search queries would stay stale. Actual: `useEffect` on data change resets filters.

**13. QR code size** (Task 16)

Plan: `size={200}`. Actual: `size={256}` — marginally better scan reliability.

### Files Modified Beyond Plan Scope

| File | Extra Changes |
|------|--------------|
| `PosContext.tsx` | Added `generateId()`, `clearSession` resets `activeSeat` |
| `PosItemGrid.tsx` | Props-based data, `error` state display, filter clearing |
| `PosCategoryFilter.tsx` | Props-based data, `menuError` display, filter clearing |
| `PosItemCard.tsx` | `added` animation state |
| `PosTableModal.tsx` | `actionError`, `error` with retry, `handleOpenChange` blocks dismiss when no session |
| `PosCartDrawer.tsx` | Inline note editing, Force Close button, correct `createOrder` payload |
| `PosOptionsDrawer.tsx` | Always-mounted Dialog.Root, conditional Portal content |
| `PosTopBar.tsx` | Removed dead `RestaurantContext` import |
| `PosSplitBill.tsx` | Split count capped at 20 |
| `PosQRBill.tsx` | Size 256px |
| `StaffRoute.tsx` | `toUpperCase()` defensive role check |
| `PosPage.tsx` | Centralized menu fetch with `AbortController` |
