import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useMenu } from "../hooks/useMenu";
import RestaurantContext from "./RestaurantContext";
import { Category, Item, RewardPointsMode } from "../types";
import { UpsellContext } from "../lib/upsellContexts";

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
    weight?: string;
    currency: "EUR";
    allergens: string[];
    dietaryTags: string[];
    upsellContexts?: UpsellContext[];
    isFeatured?: boolean;
    costPrice?: number;
    rewardPointsMode?: RewardPointsMode;
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
      weight?: string | null;
      currency?: "EUR";
      allergens?: string[];
      dietaryTags?: string[];
      upsellContexts?: UpsellContext[];
      isFeatured?: boolean;
      isOutOfStock?: boolean;
      costPrice?: number;
      rewardPointsMode?: RewardPointsMode;
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

  const handleCreateItem = useCallback(
    async (itemData: {
      name: string;
      description: string;
      price: number;
      weight?: string;
      currency: "EUR";
      allergens: string[];
      dietaryTags: string[];
      upsellContexts?: UpsellContext[];
      isFeatured?: boolean;
      costPrice?: number;
      rewardPointsMode?: RewardPointsMode;
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
        } catch {
          throw new Error(
            "Item created but image upload failed. Please try uploading the image again in edit mode.",
          );
        }
      }
    },
    [createItem, selectedCategory, uploadImage],
  );

  const handleUpdateItem = useCallback(
    async (
      id: string,
      itemData: {
        name?: string;
        description?: string;
        price?: number;
        weight?: string | null;
        currency?: "EUR";
        allergens?: string[];
        dietaryTags?: string[];
        upsellContexts?: UpsellContext[];
        isFeatured?: boolean;
        isOutOfStock?: boolean;
        costPrice?: number;
        rewardPointsMode?: RewardPointsMode;
        rewardPointsPrice?: number;
        relatedItemIds?: string[];
        imageFile?: File | null;
        imageRemoved?: boolean;
      },
    ) => {
      if (!selectedCategory) return;
      const { imageFile, imageRemoved, ...rest } = itemData;
      const data: Partial<Omit<Item, "id" | "categoryId">> = { ...rest };

      if (imageRemoved) {
        data.imageUrl = null;
        data.thumbnailUrl = null;
      }

      await updateItem({
        id,
        categoryId: selectedCategory.id,
        data,
      });

      if (imageFile) {
        await uploadImage({ itemId: id, file: imageFile });
      }
    },
    [selectedCategory, updateItem, uploadImage],
  );

  const handleDeleteItem = useCallback(
    async (id: string) => {
      if (!selectedCategory) return;
      await deleteItem({ id, categoryId: selectedCategory.id });
    },
    [deleteItem, selectedCategory],
  );

  const handleSetItems = useCallback(
    (updater: (old: Item[] | undefined) => Item[]) => {
      if (!selectedCategory) return;
      setItems(selectedCategory.id, updater);
    },
    [selectedCategory, setItems],
  );

  const handleUpdateCategory = useCallback(
    (
      id: string,
      data: Partial<Omit<Category, "id" | "restaurantId" | "items">>,
    ) => updateCategory({ id, ...data }) as Promise<Category>,
    [updateCategory],
  );

  const value = useMemo(
    () => ({
      categories,
      items,
      selectedCategory,
      isLoadingCategories,
      isLoadingItems,
      createCategory,
      updateCategory: handleUpdateCategory,
      deleteCategory,
      createItem: handleCreateItem,
      updateItem: handleUpdateItem,
      deleteItem: handleDeleteItem,
      selectCategory: setSelectedCategory,
      setCategories,
      setItems: handleSetItems,
    }),
    [
      categories,
      createCategory,
      deleteCategory,
      handleCreateItem,
      handleDeleteItem,
      handleSetItems,
      handleUpdateCategory,
      handleUpdateItem,
      isLoadingCategories,
      isLoadingItems,
      items,
      selectedCategory,
      setCategories,
    ],
  );

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
