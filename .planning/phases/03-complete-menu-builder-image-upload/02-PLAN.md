---
phase: 3
plan: 2
title: "Fix Cart Pricing & UI Loading States"
wave: 1
depends_on: []
files_modified:
  - frontend/src/context/CartContext.tsx
  - frontend/src/pages/MenuEditorPage.tsx
requirements: [REQ-006, REQ-010]
autonomous: true
must_haves:
  - Cart calculation properly sums item price and all chosen option price modifiers
  - MenuEditorPage displays loading spinners/states when categories or items are loading
---

<objective>
Fix the cart `getTotal` function to factor in selected option price modifiers. Improve the menu editor UX by showing proper loading states.
</objective>

## Tasks

<task id="2.1">
<title>Fix Cart Total Calculation to Include Modifiers</title>
<read_first>
- frontend/src/context/CartContext.tsx
</read_first>
<action>
In `frontend/src/context/CartContext.tsx`, update the `getTotal` function so that it computes the price correctly:
For each cart item, its base price plus the sum of its `selectedOptions`'s `priceModifier`s, all multiplied by its `quantity`.

Replace:

```typescript
const getTotal = () => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};
```

With:

```typescript
const getTotal = () => {
  return items.reduce((sum, item) => {
    const optionsTotal = item.selectedOptions.reduce(
      (optSum, opt) => optSum + (opt.priceModifier || 0),
      0,
    );
    return sum + (item.price + optionsTotal) * item.quantity;
  }, 0);
};
```

</action>
<acceptance_criteria>
- `CartContext.tsx`'s `getTotal` adds `option.priceModifier` to the base price before multiplying by `quantity`.
</acceptance_criteria>
</task>

<task id="2.2">
<title>Add loading states to MenuEditorPage</title>
<read_first>
- frontend/src/pages/MenuEditorPage.tsx
</read_first>
<action>
In `frontend/src/pages/MenuEditorPage.tsx`, use the boolean states `isLoadingCategories` and `isLoadingItems` from `useMenuContext()`.

Add them to the destructuring:

```tsx
const {
  categories,
  items,
  selectedCategory,
  setCategories,
  setItems,
  isLoadingCategories,
  isLoadingItems,
} = useMenuContext();
```

Wrap `<CategoryList />` conditionally:

```tsx
{
  isLoadingCategories ? (
    <div className="flex justify-center p-4">
      <p className="text-gray-500">Loading categories...</p>
    </div>
  ) : (
    <CategoryList />
  );
}
```

Wrap `<ItemList />` conditionally:

```tsx
{
  isLoadingItems ? (
    <div className="flex justify-center p-4">
      <p className="text-gray-500">Loading items...</p>
    </div>
  ) : (
    <ItemList />
  );
}
```

</action>
<acceptance_criteria>
- `MenuEditorPage.tsx` accesses `isLoadingCategories` and `isLoadingItems`.
- UI changes dynamically to show loading text/spinners when data is strictly loading.
</acceptance_criteria>
</task>
