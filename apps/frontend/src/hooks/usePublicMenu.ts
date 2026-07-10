import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { Category } from "../types";

const fetchPublicMenu = async (
  restaurantId: string,
  lang?: string,
): Promise<Category[]> => {
  const { data } = await api.get<Category[]>(`/menu/public/${restaurantId}`, {
    params: lang ? { lang } : undefined,
  });
  return data;
};

export const usePublicMenu = (
  restaurantId: string | undefined,
  lang?: string,
) => {
  return useQuery({
    queryKey: ["publicMenu", restaurantId, lang ?? "default"],
    queryFn: () => fetchPublicMenu(restaurantId!, lang),
    enabled: !!restaurantId,
  });
};
