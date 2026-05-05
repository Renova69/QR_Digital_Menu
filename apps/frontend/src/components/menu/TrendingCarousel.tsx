import React, { useEffect, useState } from 'react';
import { getTrendingItems } from '../../lib/api';
import { Item } from '../../types';
import { ItemWithOptions } from './ItemWithOptions';
import { useTranslation } from 'react-i18next';

interface TrendingCarouselProps {
  restaurantId: string;
  allMenuItems: Item[];
}

export const TrendingCarousel: React.FC<TrendingCarouselProps> = ({ restaurantId, allMenuItems }) => {
  const [trendingItems, setTrendingItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const items = await getTrendingItems(restaurantId);
        setTrendingItems(items || []);
      } catch (err) {
        console.error('Failed to load trending items:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, [restaurantId]);

  if (loading || trendingItems.length === 0) return null;

  return (
    <div className="mb-16">
      <div className="flex items-center justify-between mb-6 px-4">
        <h2 className="text-2xl font-serif font-black tracking-tighter flex items-center gap-2">
            <span className="text-accent animate-pulse">🔥</span> {t('publicMenu.trendingNow', 'Trending Now')}
        </h2>
      </div>
      
      <div className="flex overflow-x-auto gap-6 pb-8 px-4 hide-scrollbar snap-x">
        {trendingItems.map(item => {
            const translatedItem = {
                ...item,
                name: (i18n.language && (item as any).translations && (item as any).translations[i18n.language]?.name) || item.name,
                description: (i18n.language && (item as any).translations && (item as any).translations[i18n.language]?.description) || item.description,
            };
            const pairings = allMenuItems.filter(i => item.relatedItemIds?.includes(i.id));
            return (
                <div key={item.id} className="min-w-[280px] max-w-[300px] snap-center shrink-0">
                    <ItemWithOptions item={translatedItem} perfectPairings={pairings} />
                </div>
            );
        })}
      </div>
    </div>
  );
};
