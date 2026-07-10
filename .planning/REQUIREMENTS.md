# Requirements

## REQ-001: User Authentication

Restaurant owners can register and log in with email/password or Google OAuth. JWT tokens issued on login. Protected routes require valid JWT.

## REQ-002: Restaurant Management

Authenticated owners can create, list, update, and delete restaurants. Each restaurant belongs to one owner. Owners can manage multiple restaurants.

## REQ-003: Menu Categories

Owners can create, edit, delete, and reorder menu categories within a restaurant. Categories have a display order.

## REQ-004: Menu Items

Owners can create, edit, delete, and reorder menu items within categories. Items have name, description, price (EUR/BGN), allergens, dietary tags, image, and out-of-stock toggle.

## REQ-005: Menu Item Options

Owners can add variations (e.g., Small/Large) and add-ons (e.g., Extra Cheese) to menu items with price modifiers.

## REQ-006: Image Upload

Owners can upload images for menu items. Images stored locally (with future S3 migration path).

## REQ-007: Table Management

Owners can create and manage tables within a restaurant. Each table has a unique identifier and generates a unique QR code URL.

## REQ-008: QR Code Generation

System generates unique QR codes per restaurant/table. QR codes link to the public menu page with table context.

## REQ-009: Public Menu Display

Customers can view the restaurant menu via QR code link without authentication. Menu shows categories, items with images, options, and prices. Out-of-stock items are hidden.

## REQ-010: Shopping Cart

Customers can add items to a cart, select options/variations, adjust quantities, and view total price (including option price modifiers).

## REQ-011: Order Placement

Customers can submit orders with their name and optional phone number. Orders are tied to a restaurant and table. Orders persist in the database.

## REQ-012: Order Management Dashboard

Restaurant staff can view incoming orders, see order details, and update order status (New → In Progress → Served → Canceled).

## REQ-013: Dashboard Statistics

Restaurant dashboard shows today's order count, total revenue, and recent orders.

## REQ-014: Restaurant Branding

Restaurant owners can upload a logo and set an accent color. Public menu displays restaurant branding.

## REQ-015: Responsive Design

All pages work on mobile and desktop. Public menu optimized for mobile (primary QR scan device).
