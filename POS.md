Read the `MAIN_FEATURES.md` file in the root directory to understand the full system architecture, database schema, and existing React contexts.

Act as a Senior Full-Stack Developer specializing in NestJS and React. We are implementing a new "Mobile Waiter POS" interface within the existing React SPA (apps/frontend). This is a Progressive Web App (PWA) route meant for staff to take tableside orders rapidly. 

Execute this build using a spec-driven, step-by-step methodology. Do not write all the code at once. Plan the routing and components first, ask for my approval, and then build them sequentially.

### 1. Architectural Guidelines
* **Routing:** Create a new root route `/staff/pos`. Secure it with a new `StaffRoute` guard (verifying `user.role === 'STAFF' || user.role === 'OWNER'`).
* **Layout:** Create a `PosLayout.tsx` that replaces the standard dashboard chrome. It must have zero padding, safe-area insets for mobile, a sticky top filter bar, and a persistent bottom action bar for the cart.
* **State:** Reuse the existing `CartContext`, `OrderContext`, and `SocketContext`. Do not reinvent order submission logic.
* **Styling:** Use Tailwind CSS 4 and existing Radix UI primitives. The UI must be high-contrast, dark-mode compatible, and stripped of unnecessary animations for maximum performance.

### 2. Feature Specification to Implement

**Phase A: Speed & Navigation (UI/UX)**
* **Category Quick-Filter:** A sticky, horizontally scrollable row of category pills.
* **Item Grid:** A dense, 2-column mobile grid of items. Omit `imageUrl` entirely to save screen space. Display only name and price.
* **Interactions:** 1-tap on an item adds it to the cart instantly. Implement a search bar at the top to filter items by name.

**Phase B: Order & Table Management**
* **Table Selector:** A modal leveraging the existing `getTablesWithStatus` API to show all tables. Waiters must select a table to open a session before adding items.
* **Session Overrides:** Add buttons in the active table view to "Force Open Session" and "Force Close (No Payment)". 
* **Seat-Level Ordering:** Extend the local cart state to allow grouping items by "Seat Number" (Seat 1, Seat 2).

**Phase C: Kitchen Communication**
* **Rapid Modifiers:** If an item has `MenuOption` arrays (like Doneness), trigger a fast Radix UI bottom sheet (Drawer) immediately upon tapping the item.
* **Custom Notes:** Add a text input button on cart items to attach a string to `specialRequests`.
* **Course Firing:** Add a local state toggle to items in the cart (e.g., "Hold" vs "Fire Now").

**Phase D: Checkout & Payment Handling**
* **Split Bill Calculator:** A UI tool in the cart drawer to divide the `totalPrice` evenly by an integer input, ensuring the split output always matches the strict formatting of X.XX € (e.g., 25.00 € / 2 = 12.50 €).
* **Custom Discount:** An input to apply a manual discount deduction before submitting the order.
* **QR Bill Generation:** A button that takes the current `TableSession` token and renders a large QR code on the waiter's screen using the existing `qrcode.react` component, pointing to the public bill URL.

### Execution Instructions
1. Analyze the database schema in `MAIN_FEATURES.md` and confirm if any Prisma schema changes are required to support Seat-Level Ordering or Course Firing.
2. Provide a brief Markdown outline of the new React components you will create in `apps/frontend/src/components/pos/`.
3. Wait for my confirmation before generating the code for Phase A.