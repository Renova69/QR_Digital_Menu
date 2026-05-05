import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Category } from '../types';

const fetchPublicMenu = async (restaurantId: string): Promise<Category[]> => {
  const { data } = await api.get<Category[]>(`/menu/public/${restaurantId}`);
  return data;
};

export const usePublicMenu = (restaurantId: string | undefined) => {
  return useQuery({
    queryKey: ['publicMenu', restaurantId],
    queryFn: () => fetchPublicMenu(restaurantId!),
    enabled: !!restaurantId,
  });
};
