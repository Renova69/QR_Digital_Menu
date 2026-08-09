---
id: public-menu-checkout
title: Public Menu & Checkout
sidebar_position: 2
---

# Public Menu & Checkout

The public menu is the customer-facing side of the platform, optimized for mobile devices and designed to drive sales with zero friction. It does not require customers to download an app or register an account.

## The Browsing Experience

When a customer scans a table's QR code, they are taken directly to the digital menu.

### Navigation & Search
- **Category Pills**: A horizontal scroll bar of categories allows customers to quickly jump to different sections of the menu.
- **Search & Filters**: Customers can use the top search bar to find specific items, or use the slide-down filter panel to filter by dietary preferences (Vegan, Spicy) or exclude allergens (e.g., hiding all items containing nuts).

### Item Display
- Items are displayed in clean horizontal cards. 
- **Dual Currency**: Prices are displayed in the primary currency (e.g., EUR) with a secondary currency equivalent (e.g., BGN) displayed beneath it, automatically calculated using official fixed exchange rates.
- **Images**: Customers can tap on item images to open a full-screen lightbox with pinch-to-zoom capabilities.

## The Checkout Flow

Once a customer adds items to their cart, they proceed to checkout. 

### Server-Side Validation
To ensure complete security, the prices of the items and the chosen options (like "Large" or "Extra Cheese") are validated against the database on the server. Customers cannot manipulate prices in their browser.

### Loyalty Integration
During checkout, logged-in customers will see their current loyalty tier, any active happy hour multipliers, and the points they will earn for the order. They can also seamlessly redeem points to get specific items for free or apply a cash discount to the total bill.

### Order Confirmation & Tracking
After placing the order, the customer lands on the **Order Confirmation** page. Here, a live progress stepper tracks the order through three stages: Placed, In Kitchen, and Served. The status updates in real-time without the customer needing to refresh the page.
