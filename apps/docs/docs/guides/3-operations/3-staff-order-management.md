---
id: staff-order-management
title: Staff Order Management
sidebar_position: 3
---

# Staff Order Management

The **Orders** view in the dashboard is the nerve center for your front-of-house staff. It is designed to handle high volumes of incoming orders smoothly.

## Real-Time Notifications
The platform uses WebSockets to deliver updates instantly. When a customer places a new order, the dashboard emits an audio alert (a clear notification chime) and updates the order list immediately—no manual page refreshing required.

## The Order Workflow

Orders move through a strict workflow to ensure nothing is missed:

1. **NEW**: Orders just placed by customers. Staff should acknowledge these by clicking the primary action button to move them to "In Progress".
2. **IN PROGRESS**: Orders currently being prepared by the kitchen or bar.
3. **SERVED**: Orders that have been delivered to the customer's table.
4. **CANCELED**: Orders that were voided or canceled.

This status is synchronized with the customer's phone, so they always know the exact state of their order.

## Order Cards
Each order appears as a card containing crucial information:
- **Table Badge**: Prominently displays the table number so staff know exactly where the food is going.
- **Order ID & Timestamp**: For tracking and accounting.
- **Items & Options**: A clear list of what the customer ordered, including their specific choices (e.g., "Burger - Medium Rare").
- **Special Requests**: Any special instructions left by the customer are highlighted in red to ensure they are not missed by the staff.
- **Customer Phone**: Displayed if the customer provided it during checkout.

## Seamless Synchronization
If an order's status is changed (e.g., from NEW to IN PROGRESS), that change is broadcasted not just to the customer, but also to every other staff member viewing the dashboard or the Kitchen Display System (KDS), ensuring the whole team is always perfectly in sync.
