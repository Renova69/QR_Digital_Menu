---
id: menu-builder
title: Digital Menu Builder
sidebar_position: 1
---

# Digital Menu Builder

The **Menu Builder** is where you create, organize, and update your venue's digital menu. It provides a visual editor for categories, dishes, dish customization options, dietary labels, allergen warnings, and image uploads.

---

## What This Feature Does

- **Structured Menu Hierarchy**: Organize your dishes into clear, ordered categories (such as Appetizers, Pasta, Grill, Desserts, Cocktails).
- **Dish Details & Imagery**: Add photos, descriptions, and prices in EUR.
- **Dietary & Allergen Transparency**: Tag items with dietary labels (Vegan, Vegetarian, Spicy) and official allergen disclosures (Gluten, Dairy, Nuts, Fish). Guests can filter your menu by these tags.
- **Variations & Custom Add-Ons**: Allow guests to select dish sizes, preparation temperatures, or paid extras with automatic price adjustments.
- **Stock Availability Toggles**: Quickly mark dishes as out of stock during a shift without deleting them.
- **Menu Health Audit**: An automated assistant that scans your menu and alerts you to missing photos, missing translations, or unpriced items.

---

## Who Can Use It

- **Owners and Managers**: Have full access to create, edit, reorder, and delete categories and items.
- **Staff and Waiters**: Can view the menu in operational views, but cannot alter dish details or prices.

---

## How to Create a Menu Category

1. In the top navigation bar of your dashboard, click **Edit Menu**.
2. Make sure you are on the **Items** tab.
3. Click the **Add Category** button.
4. Fill in the category details:
   - **Category Name**: Enter the title (e.g., "Main Courses").
   - **Description** *(Optional)*: A brief introductory note for the category.
   - **Banner Image** *(Optional)*: Upload an image to serve as the category header.
   - **Drink Category Toggle**: If this category contains beverages, check **Drink category — recommend drinks at checkout**. This enables automatic drink suggestions when guests review their cart.
   - **Availability**: Choose **Always Available** (default), **Hidden** (saved for seasonal use), or **Scheduled** (to show only during breakfast, lunch, or late-night hours).
5. Click **Save Category**.

---

## How to Add a Dish or Menu Item

1. In the category list on the left side of the Menu Editor, click the category you want to add an item to.
2. Click **Add Item**.
3. In the item creation form, provide:
   - **Item Name**: The title of the dish (e.g., "Truffle Tagliatelle").
   - **Price**: Enter the base price. Renova automatically computes the secondary currency equivalent.
   - **Description**: Highlight ingredients, preparation style, or portion size.
   - **Dish Photo**: Click to upload a clear photo (JPEG, PNG, or WebP).
   - **Dietary & Allergen Tags**: Select from the tag picker (e.g., Vegetarian, Gluten, Eggs, Milk).
   - **Available Toggle**: Ensure this is checked so the item is visible to guests.
   - **Related Items (Perfect Pairings)**: Select up to 3 complementary items (such as a specific wine or side dish) to display as "Chef's Recommendations" when a guest adds this dish to their cart.
4. Click **Save Item**. Your dish is immediately published to your live digital menu.

---

## How to Configure Variations & Add-Ons

For dishes that require customer choices (like meat doneness or drink size) or offer optional extras (like extra cheese):

1. Locate the item in the Menu Editor and click **Manage Options**.
2. Click **Add Option Group**.
3. Set the group parameters:
   - **Option Name**: E.g., "Choose Size" or "Optional Extras".
   - **Option Type**:
     - **Variation**: Mutually exclusive choices where the customer must pick exactly one (e.g., Small, Medium, Large). Set **Required** to active.
     - **Add-on**: Optional extras where the customer can select none, one, or multiple items (e.g., Extra Bacon, Avocado).
4. Add individual choices to the group:
   - Enter the **Choice Name** (e.g., "Large").
   - Enter the **Price Modifier** (e.g., `+2.50` to add €2.50, or `0.00` if included in the base price).
5. Click **Save Options**. During checkout, prices are automatically calculated and strictly validated.

---

## Using the Menu Health Audit

On the right side of the Menu Editor (or below the item list on mobile screens), the **Menu Health Audit** continuously analyzes your menu:

- **Errors**: Flags critical issues, such as dishes with €0.00 price or categories without any items.
- **Warnings**: Highlights items missing descriptions or translations.
- **Suggestions**: Reminds you of dishes missing photos (menus with high-quality photos experience up to 30% higher order volume).

Click **Fix** next to any audit recommendation to navigate directly to that item or category.

---

## Managing Existing Items

- **Reorder Categories**: Click and hold the drag handle next to any category title, drag it up or down to your desired sequence, and release.
- **Edit Details**: Click the pencil icon on any category or item card to update names, prices, or descriptions.
- **Mark Out of Stock**: Toggle the green **Available** switch to off. The dish will instantly be marked unavailable on guest menus without deleting its settings or options.
- **Delete an Item**: Click the trash icon next to an item and confirm the prompt.
- **Delete a Category**: Click the trash icon on the category header. You will be prompted to confirm the deletion.

---

## Important Notes

- **Real-Time Updates**: Any changes you save in the Menu Editor take effect immediately on live guest devices upon their next screen action or refresh.
- **Choice Label Consistency**: If you offer multiple choices in a variation group, ensure the choice names are distinct (e.g., "Rare", "Medium", "Well Done").

---

## If Something Goes Wrong

- **Image Upload Fails**: Ensure your image file is in JPEG, PNG, or WebP format and is under 10 MB in file size.
- **Item Not Showing on the Mobile Menu**: Check that the item is toggled to **Available**, that its parent category is set to **Always Available** (or currently within its scheduled hours), and that your mobile browser has been refreshed.
