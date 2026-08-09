---
id: waiter-pos
title: Waiter POS (Point of Sale)
sidebar_position: 5
---

# Waiter POS (Point of Sale)

The Waiter Point of Sale (POS) is a fast, mobile-first interface designed for your staff to take tableside orders rapidly. It operates completely independently of the customer-facing QR menu to ensure staff workflows never interfere with customer sessions.

## Mobile-First Design
The POS layout strips away the standard dashboard navigation to provide a full-viewport experience on mobile devices and tablets. It uses a dense, 2-column grid layout for menu items (displaying just names and prices, without images) to maximize speed and efficiency on mid-range Android or iOS devices.

## Taking Orders

### Table Selection
Waiters start by selecting a table from a color-coded grid. If a table is already occupied (e.g., customers ordered via QR code), the waiter can open that table's session. The POS will load the table's full order history as read-only items, and any new items the waiter adds will be tracked separately as "pending".

### Seat Assignment & Notes
To facilitate split bills and accurate delivery, waiters can assign items to specific seats (e.g., Seat 1, Seat 2, or Shared). 

When tapping a menu item, if it has variations or add-ons, a drawer opens allowing the waiter to select those options and optionally add a custom text note for the kitchen (e.g., "no salt", "extra lemon").

### Submitting to the Kitchen
When the waiter taps "Submit Order", only the *new, pending* items are sent to the kitchen. The active session remains open. The kitchen receives the order perfectly formatted, grouping the items by the assigned seats.

## Closing Sessions
When it's time to settle the bill, the waiter has three options to end the session:
1. **Submit Order**: Keep the session open for more orders.
2. **Paid by Card**: Marks the session as fully paid using an integrated POS terminal (e.g., MyPOS), clearing the table for the next customer.
3. **Force Close**: Manually closes the session without processing a payment (useful for cash payments or fixing errors).

Waiters can also generate a QR Bill to show the customer, allowing the customer to pay from their own phone via Stripe if preferred.
