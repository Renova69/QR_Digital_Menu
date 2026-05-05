---
phase: 3
plan: 3
title: "Implement Item Image Upload UI"
wave: 2
depends_on: ["01", "02"]
files_modified:
  - frontend/src/services/menuService.ts
  - frontend/src/hooks/useMenu.ts
  - frontend/src/context/MenuContext.tsx
  - frontend/src/components/menu/CreateItemForm.tsx
requirements: [REQ-003, REQ-004]
autonomous: true
must_haves:
  - API service function for image upload
  - useMenu hook has a React Query mutation for image uploads
  - CreateItemForm allows file selection
  - CreateItemForm uploads file immediately after item is successfully created
---

<objective>
Update the menu service and UI components to allow a user to attach an image to a menu item when creating it. The image upload API will be invoked automatically after the item creation succeeds.
</objective>

## Tasks

<task id="3.1">
<title>Add upload API service function</title>
<read_first>
- frontend/src/services/menuService.ts
</read_first>
<action>
In `frontend/src/services/menuService.ts`, add the `uploadItemImage` function logic:
```typescript
export const uploadItemImage = async (itemId: string, file: File): Promise<void> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/items/${itemId}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  } catch (error) {
    console.error('Error uploading item image:', error);
    throw error;
  }
};
```
</action>
<acceptance_criteria>
- `uploadItemImage` uses `FormData` and posts to `/items/:id/image`.
- The 'Content-Type': 'multipart/form-data' header is included.
</acceptance_criteria>
</task>

<task id="3.2">
<title>Add mutation to useMenu hook</title>
<read_first>
- frontend/src/hooks/useMenu.ts
</read_first>
<action>
In `frontend/src/hooks/useMenu.ts`, import `uploadItemImage` from `menuService`.

Add the mutation block:
```typescript
const uploadImageMutation = useMutation({
  mutationFn: ({ itemId, file }: { itemId: string; file: File }) => uploadItemImage(itemId, file),
  onSuccess: () => {
    // We could pass categoryId to invalidate exactly, or just invalidate all items
    queryClient.invalidateQueries({ queryKey: ['items'] });
  },
});
```

Export `uploadImage: uploadImageMutation.mutateAsync` in the hook's return object.
</action>
<acceptance_criteria>
- `useMenu.ts` exports `uploadImage`.
- It invalidates `['items']` on success.
</acceptance_criteria>
</task>

<task id="3.3">
<title>Expose uploadImage in MenuContext</title>
<read_first>
- frontend/src/context/MenuContext.tsx
</read_first>
<action>
In MenuContext, we don't strictly need to expose it if we adjust `handleCreateItem` instead, but for consistency we can pass the function. Alternatively, let's keep it simple: alter `MenuContextType` to optionally accept an `imageFile` during creation.

Update `MenuContextType` inside `frontend/src/context/MenuContext.tsx`:
```typescript
createItem: (itemData: { name: string; description: string; price: number; imageFile?: File | null }) => Promise<void>;
```

Extract `uploadImage` from `useMenu` inside `MenuProvider`:
```typescript
const { categories, isLoadingCategories, createCategory, getItemsQuery, createItem, setCategories, setItems, uploadImage } = useMenu(activeRestaurant?.id);
```

Update `handleCreateItem`:
```typescript
const handleCreateItem = async (itemData: { name: string; description: string; price: number; imageFile?: File | null }) => {
  if (!selectedCategory) return;
  const { imageFile, ...rest } = itemData;
  const newItem = await createItem({ ...rest, categoryId: selectedCategory.id, currency: 'EUR', allergens: [], dietaryTags: [] });
  if (imageFile && newItem) {
    await uploadImage({ itemId: newItem.id, file: imageFile });
  }
};
```
</action>
<acceptance_criteria>
- `MenuContextType.createItem` takes an optional `imageFile`.
- `handleCreateItem` invokes `uploadImage` if an `imageFile` was provided.
</acceptance_criteria>
</task>

<task id="3.4">
<title>Add file input to CreateItemForm</title>
<read_first>
- frontend/src/components/menu/CreateItemForm.tsx
</read_first>
<action>
In `frontend/src/components/menu/CreateItemForm.tsx`:
1. Add state variable: `const [imageFile, setImageFile] = useState<File | null>(null);`
2. Update `handleSubmit` to pass `imageFile`:
   `await createItem({ name, description, price: parseFloat(price), imageFile });`
3. Clear it on success: `setImageFile(null);`
4. Add a file input field to the form:
```tsx
<div className="space-y-1">
  <label className="text-sm text-gray-600 block">Item Image (optional)</label>
  <Input
    type="file"
    accept="image/*"
    onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)}
  />
</div>
```
</action>
<acceptance_criteria>
- `CreateItemForm` has an `<Input type="file">`.
- `imageFile` is passed down to `createItem` context method.
</acceptance_criteria>
</task>
