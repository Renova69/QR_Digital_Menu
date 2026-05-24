import React, { useEffect, useState } from 'react';
import { getTrendingItems } from '../../lib/api';
import { Item } from '../../types';
import { ItemWithOptions } from './ItemWithOptions';
import { useTranslation } from 'react-i18next';
import { getTranslatedField } from '../../lib/translation';

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

  if (loading) {
    return (
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="h-6 w-32 bg-secondary rounded-lg animate-pulse" />
        </div>
        <div className="flex overflow-hidden gap-4 px-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-w-[320px] max-w-[380px] shrink-0">
              <div className="glass-panel p-3 rounded-[1.75rem] border-white/5 h-[120px] flex gap-3 animate-pulse">
                <div className="w-[30%] rounded-2xl bg-secondary flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 bg-secondary rounded-lg" />
                  <div className="h-3 w-1/2 bg-secondary rounded-lg" />
                  <div className="h-3 w-full bg-secondary rounded-lg mt-auto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (trendingItems.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-6 px-4">
        <h2 className="text-2xl font-display font-black tracking-tighter flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent animate-pulse align-middle mr-1" aria-hidden="true" /> {t('publicMenu.trendingNow', 'Trending Now')}
        </h2>
      </div>
      
      <div className="flex overflow-x-auto gap-4 pb-4 px-4 hide-scrollbar snap-x">
        {trendingItems.map(item => {
            const translatedItem = {
                ...item,
                name: getTranslatedField(item, i18n.language, 'name') || item.name,
                description: getTranslatedField(item, i18n.language, 'description') || item.description,
            };
            const pairings = allMenuItems.filter(i => item.relatedItemIds?.includes(i.id));
            return (
                <div key={item.id} className="min-w-[320px] max-w-[380px] snap-center shrink-0">
                    <ItemWithOptions item={translatedItem} perfectPairings={pairings} />
                </div>
            );
        })}
      </div>
    </div>
  );
};
