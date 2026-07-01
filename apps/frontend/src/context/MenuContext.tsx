import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import { useMenu } from "../hooks/useMenu";
import RestaurantContext from "./RestaurantContext";
import { Category, Item } from "../types";

interface MenuContextType {
  categories: Category[] | undefined;
  items: Item[] | undefined;
  selectedCategory: Category | null;
  isLoadingCategories: boolean;
  isLoadingItems: boolean;
  createCategory: (categoryData: {
    name: string;
    isDrinkCategory?: boolean;
  }) => Promise<Category>;
  updateCategory: (
    id: string,
    data: Partial<Omit<Category, "id" | "restaurantId" | "items">>,
  ) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
  createItem: (itemData: {
    name: string;
    description: string;
    price: number;
    currency: "EUR";
    allergens: string[];
    dietaryTags: string[];
    isFeatured?: boolean;
    costPrice?: number;
    rewardPointsPrice?: number;
    relatedItemIds?: string[];
    imageFile?: File | null;
  }) => Promise<void>;
  updateItem: (
    id: string,
    itemData: {
      name?: string;
      description?: string;
      price?: number;
      currency?: "EUR";
      allergens?: string[];
      dietaryTags?: string[];
      isFeatured?: boolean;
      isOutOfStock?: boolean;
      costPrice?: number;
      rewardPointsPrice?: number;
      relatedItemIds?: string[];
      imageFile?: File | null;
      imageRemoved?: boolean;
    },
  ) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  selectCategory: (category: Category | null) => void;
  setCategories: (updater: (old: Category[] | undefined) => Category[]) => void;
  setItems: (updater: (old: Item[] | undefined) => Item[]) => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const MenuProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const {
    categories,
    isLoadingCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getItemsQuery,
    createItem,
    updateItem,
    deleteItem,
    setCategories,
    setItems,
    uploadImage,
  } = useMenu(activeRestaurant?.id);

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );

  const { data: items, isLoading: isLoadingItems } = getItemsQuery(
    selectedCategory?.id,
  );

  useEffect(() => {
    if (categories && categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // When categories refresh (after delete/edit), update selectedCategory reference
  useEffect(() => {
    if (selectedCategory && categories) {
      const updated = categories.find((c) => c.id === selectedCategory.id);
      if (!updated) {
        // Category was deleted, select first available
        setSelectedCategory(categories.length > 0 ? categories[0] : null);
      } else if (updated.name !== selectedCategory.name) {
        // Category was renamed, update reference
        setSelectedCategory(updated);
      }
    }
  }, [categories]);

  const handleCreateItem = async (itemData: {
    name: string;
    description: string;
    price: number;
    currency: "EUR";
    allergens: string[];
    dietaryTags: string[];
    isFeatured?: boolean;
    rewardPointsPrice?: number;
    relatedItemIds?: string[];
    imageFile?: File | null;
  }) => {
    if (!selectedCategory) return;
    const { imageFile, ...rest } = itemData;
    const newItem = (await createItem({
      ...rest,
      categoryId: selectedCategory.id,
    })) as Item;

    if (imageFile && newItem) {
      try {
        await uploadImage({ itemId: newItem.id, file: imageFile });
      } catch (error) {
        throw new Error(
          "Item created but image upload failed. Please try uploading the image again in edit mode.",
        );
      }
    }
  };

  const handleUpdateItem = async (
    id: string,
    itemData: {
      name?: string;
      description?: string;
      price?: number;
      currency?: "EUR";
      allergens?: string[];
      dietaryTags?: string[];
      isFeatured?: boolean;
      isOutOfStock?: boolean;
      rewardPointsPrice?: number;
      relatedItemIds?: string[];
      imageFile?: File | null;
      imageRemoved?: boolean;
    },
  ) => {
    if (!selectedCategory) return;
    const { imageFile, imageRemoved, ...rest } = itemData;

    if (imageRemoved) {
      (rest as any).imageUrl = null;
      (rest as any).thumbnailUrl = null;
    }

    await updateItem({
      id,
      categoryId: selectedCategory.id,
      data: rest,
    });

    if (imageFile) {
      await uploadImage({ itemId: id, file: imageFile });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!selectedCategory) return;
    await deleteItem({ id, categoryId: selectedCategory.id });
  };

  const handleSetItems = (updater: (old: Item[] | undefined) => Item[]) => {
    if (!selectedCategory) return;
    setItems(selectedCategory.id, updater);
  };

  const value = {
    categories,
    items,
    selectedCategory,
    isLoadingCategories,
    isLoadingItems,
    createCategory,
    updateCategory: (id: string, data: any) =>
      updateCategory({ id, ...data }) as Promise<Category>,
    deleteCategory,
    createItem: handleCreateItem,
    updateItem: handleUpdateItem,
    deleteItem: handleDeleteItem,
    selectCategory: setSelectedCategory,
    setCategories,
    setItems: handleSetItems,
  };

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
};

export const useMenuContext = () => {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenuContext must be used within a MenuProvider");
  }
  return context;
};

export default MenuContext;
