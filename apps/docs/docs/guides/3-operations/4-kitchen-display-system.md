---
id: kitchen-display-system
title: Kitchen Display System (KDS)
sidebar_position: 4
---

# Kitchen Display System (KDS)

The Kitchen Display System (KDS) is a dedicated interface designed specifically for back-of-house staff. It replaces traditional paper tickets with a real-time, digital Kanban board.

## The Interface
The KDS is accessed at `/staff/kitchen` and features a dark-mode, high-contrast UI (using a dark slate background and monospace fonts) optimized to reduce glare in brightly lit kitchen environments and maximize readability from a distance.

### The Kanban Workflow
Orders flow automatically through three columns:
1. **New (Blue)**: Incoming orders. The system plays an audio alert when a new order arrives.
2. **In Progress (Amber)**: Orders actively being prepared by the chefs.
3. **Ready (Green)**: Orders that are prepared and ready for a waiter to pick up and serve.

Kitchen staff simply tap an order card to advance it to the next column. When an order is tapped in the "Ready" column, it is marked as Completed and moved to the history view.

## Time Tracking & Urgency
To help kitchens manage prep times, every order features an elapsed time counter that updates every 10 seconds. 

If an order has been pending for more than 15 minutes, it is automatically flagged with a red urgency styling, drawing the staff's attention to delayed tickets.

## History Panel
If a mistake is made or the kitchen needs to review a past order, a toggle reveals the History Panel. This shows a grid of all completed orders from the last 24 hours, ensuring complete traceability.
