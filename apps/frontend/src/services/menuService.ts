import api from "../lib/api";
import { Category, Item } from "../types";

// Category Functions
export const createCategory = async (
  restaurantId: string,
  categoryData: { name: string },
): Promise<Category> => {
  try {
    const response = await api.post<Category>(
      `/restaurants/${restaurantId}/categories`,
      categoryData,
    );
    return response.data;
  } catch (error) {
    console.error("Error creating category:", error);
    throw error;
  }
};

export const getCategories = async (
  restaurantId: string,
): Promise<Category[]> => {
  try {
    const response = await api.get<Category[]>(
      `/restaurants/${restaurantId}/categories`,
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw error;
  }
};

export const updateCategory = async (
  id: string,
  categoryData: Partial<Category>,
): Promise<Category> => {
  try {
    const response = await api.patch<Category>(
      `/categories/${id}`,
      categoryData,
    );
    return response.data;
  } catch (error) {
    console.error("Error updating category:", error);
    throw error;
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    await api.delete(`/categories/${id}`);
  } catch (error) {
    console.error("Error deleting category:", error);
    throw error;
  }
};

export const updateCategoryOrder = async (
  restaurantId: string,
  orderedIds: string[],
): Promise<void> => {
  try {
    await api.put(`/restaurants/${restaurantId}/categories/order`, {
      orderedIds,
    });
  } catch (error) {
    console.error("Error updating category order:", error);
    throw error;
  }
};

// Item Functions
export const createItem = async (
  categoryId: string,
  itemData: Omit<Item, "id" | "categoryId">,
): Promise<Item> => {
  try {
    const response = await api.post<Item>(
      `/categories/${categoryId}/items`,
      itemData,
    );
    return response.data;
  } catch (error) {
    console.error("Error creating item:", error);
    throw error;
  }
};

export const updateItem = async (
  id: string,
  itemData: Partial<Omit<Item, "id" | "categoryId">>,
): Promise<Item> => {
  try {
    const response = await api.patch<Item>(`/items/${id}`, itemData);
    return response.data;
  } catch (error) {
    console.error("Error updating item:", error);
    throw error;
  }
};

export const deleteItem = async (id: string): Promise<void> => {
  try {
    await api.delete(`/items/${id}`);
  } catch (error) {
    console.error("Error deleting item:", error);
    throw error;
  }
};

export const getItems = async (categoryId: string): Promise<Item[]> => {
  try {
    const response = await api.get<Item[]>(`/categories/${categoryId}/items`);
    return response.data;
  } catch (error) {
    console.error("Error fetching items:", error);
    throw error;
  }
};

export const updateItemOrder = async (
  categoryId: string,
  orderedIds: string[],
): Promise<void> => {
  try {
    await api.put(`/categories/${categoryId}/items/order`, { orderedIds });
  } catch (error) {
    console.error("Error updating item order:", error);
    throw error;
  }
};

export const uploadItemImage = async (
  itemId: string,
  file: File,
): Promise<{ logoUrl?: string; imageUrl?: string }> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/items/${itemId}/image`, formData);
    return response.data;
  } catch (error) {
    console.error("Error uploading item image:", error);
    throw error;
  }
};

export const uploadCategoryImage = async (
  categoryId: string,
  file: File,
): Promise<{ imageUrl?: string }> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(
      `/categories/${categoryId}/image`,
      formData,
    );
    return response.data;
  } catch (error) {
    console.error("Error uploading category image:", error);
    throw error;
  }
};
