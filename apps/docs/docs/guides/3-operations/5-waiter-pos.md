---
id: waiter-pos
title: Waiter Tableside POS
sidebar_position: 5
---

# Waiter Tableside POS

*(Available on the Enterprise plan)*

The **Waiter Point of Sale (POS)** is a high-speed, mobile-optimized interface designed for waitstaff to take tableside orders on smartphones or tablets, assign dishes to specific seats, submit orders to the kitchen, and settle bills.

---

## What This Feature Does

- **Full-Screen Mobile Design**: Strips away standard administrative chrome to give waitstaff a dense, distraction-free grid for rapid order entry.
- **Zone-Based Table Picker**: Select tables organized by physical sections (Main Dining, Terrace, Patio, Bar).
- **Seat Assignment**: Attribute dishes and drinks to specific seats (Seat 1, Seat 2, ..., Shared) to simplify food running and bill splitting.
- **Kitchen Notes & Modifiers**: Quickly select sizes, meat doneness, and paid extras, or type custom instructions (such as "no salt", "extra lemon").
- **Multiple Settlement Paths**: Settle bills with integrated card terminals, split the check among guests, accept cash, or display a payment QR code directly on the tablet screen for the guest to scan and pay.
- **Staff Attribution**: Every order records the name of the logged-in staff member for shift auditing.

---

## Who Can Use It

- **Waitstaff**: Enter their 4-digit PIN on an enrolled tablet to open the POS (`/staff/pos`) automatically.
- **Owners and Managers**: Can open the POS at any time by clicking the **POS** button in the dashboard header.

---

## The Complete Waiter POS Workflow

### 1. Opening a Table
1. Tap **Select Table** in the top bar of the POS screen.
2. The table picker displays all venue tables grouped by **Zone**.
3. Tap the desired table card:
   - If the table is **Empty**, a fresh dining session begins.
   - If the table is **Occupied** (for example, if guests already ordered drinks via QR code), the POS loads their confirmed order history in gray and allows you to add more items.

### 2. Adding Dishes & Drinks
1. Use the category pills at the top (e.g., Appetizers, Mains, Drinks) to filter the item grid.
2. Tap any dish card to add it to the pending order.
3. If the dish has options, a drawer slides up:
   - Select required variations (e.g., "Medium Rare").
   - Select optional add-ons (e.g., "Truffle Butter").
   - *(Optional)* Type a custom note in the **Special Instructions** field.
4. Tap **Done** to add the customized dish.

### 3. Assigning Items to Seats
1. Before or after tapping dishes, select a seat from the seat selector bar (**Seat 1**, **Seat 2**, **Seat 3**, or **Shared**).
2. Items added while a seat is selected are tagged with that seat number.
3. When the order is sent to the kitchen, dishes are grouped by seat so food runners know exactly where each plate belongs.

### 4. Sending the Order to the Kitchen
1. Review the pending items in the order drawer.
2. Tap **Submit Order** (or **Send to Kitchen**).
3. Only the newly added pending items are transmitted to the Kitchen Display System (KDS) and thermal printers.
4. The table session remains active so you can return and add desserts or additional rounds of drinks later.

### 5. Settling the Bill
When the table is ready to pay, open the table's cart drawer and review the itemized bill. You have four settlement options:

- **Pay by Card**: Marks the bill as fully settled using your venue's card terminal (e.g., MyPOS) and clears the table for the next party.
- **Split Bill**: Opens the split bill drawer, allowing guests to divide the bill evenly or select individual items to pay separately. *(See [Bill Splitting](/guides/payments-integrations/split-bill))*
- **Show Payment QR**: Displays a digital payment QR code directly on your tablet screen. The guest scans it with their phone camera to pay via Apple Pay, Google Pay, or credit card.
- **Force Close**: Closes the table session without an electronic card transaction (used when guests pay in physical cash or when correcting an accidental table opening).

---

## Switching Users Between Tables

On shared floor tablets, waitstaff should lock their screen between tables:
1. Tap the **Switch User** or **Lock** button in the top right corner.
2. The screen returns to the 4-digit PIN keypad, ready for the next waiter to enter their PIN.

---

## Important Notes

- **Independent Staff Carts**: The POS operates completely independently of guest browser carts. Waitstaff actions will never overwrite or interfere with items a customer is browsing on their smartphone.
- **Live Payment Interception**: If a guest pays their bill on their own phone while a waiter has the table open on the POS, Renova alerts the waiter with an on-screen notice and automatically clears the table.

---

## If Something Goes Wrong

- **Tablet Disconnects from Wi-Fi**: If connection drops momentarily, the POS saves pending items locally and alerts you with an offline banner until connection is restored.
- **Wrong Item Sent to Kitchen**: Open the order in the dashboard under **Orders** or inform the kitchen directly; staff can void or adjust the ticket.
