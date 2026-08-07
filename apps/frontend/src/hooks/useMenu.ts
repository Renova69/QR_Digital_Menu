import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  createItem,
  updateItem,
  deleteItem,
  uploadItemImage,
} from "../services/menuService";
import { Category, Item } from "../types";
import { useCallback } from "react";

const useItemsQuery = (categoryId: string | undefined) =>
  useQuery({
    queryKey: ["items", categoryId],
    queryFn: () => getItems(categoryId!),
    enabled: !!categoryId,
    staleTime: 60_000,
  });

export const useMenu = (restaurantId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ["categories", restaurantId],
    queryFn: () => getCategories(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });

  const setCategories = useCallback(
    (updater: (old: Category[] | undefined) => Category[]) => {
      queryClient.setQueryData(["categories", restaurantId], updater);
    },
    [queryClient, restaurantId],
  );

  const createCategoryMutation = useMutation({
    mutationFn: (categoryData: { name: string; isDrinkCategory?: boolean }) =>
      createCategory(restaurantId!, categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", restaurantId] });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Partial<
      Omit<Category, "id" | "restaurantId" | "items">
    >) => updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", restaurantId] });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", restaurantId] });
    },
  });

  const setItems = useCallback(
    (categoryId: string, updater: (old: Item[] | undefined) => Item[]) => {
      queryClient.setQueryData(["items", categoryId], updater);
    },
    [queryClient],
  );

  const createItemMutation = useMutation({
    mutationFn: (
      itemData: { categoryId: string } & Omit<Item, "id" | "categoryId">,
    ) => {
      const { categoryId, ...rest } = itemData;
      return createItem(categoryId, rest);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["items", variables.categoryId],
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      categoryId: string;
      data: Partial<Omit<Item, "id" | "categoryId">>;
    }) => updateItem(vars.id, vars.data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["items", variables.categoryId],
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (vars: { id: string; categoryId: string }) =>
      deleteItem(vars.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["items", variables.categoryId],
      });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: ({ itemId, file }: { itemId: string; file: File }) =>
      uploadItemImage(itemId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  return {
    categories,
    isLoadingCategories,
    setCategories,
    createCategory: createCategoryMutation.mutateAsync,
    updateCategory: updateCategoryMutation.mutateAsync,
    deleteCategory: deleteCategoryMutation.mutateAsync,
    useItemsQuery,
    setItems,
    createItem: createItemMutation.mutateAsync,
    updateItem: updateItemMutation.mutateAsync,
    deleteItem: deleteItemMutation.mutateAsync,
    uploadImage: uploadImageMutation.mutateAsync,
  };
};
