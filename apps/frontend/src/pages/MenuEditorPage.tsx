import React from 'react';
import { CategoryList } from '../components/menu/CategoryList';
import { ItemList } from '../components/menu/ItemList';
import { CreateCategoryForm } from '../components/menu/CreateCategoryForm';
import { CreateItemForm } from '../components/menu/CreateItemForm';
import { useMenuContext } from '../context/MenuContext';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { updateCategoryOrder, updateItemOrder } from '../services/menuService';
import { updateRestaurant } from '../services/restaurantService';
import RestaurantContext from '../context/RestaurantContext';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const MenuEditorPage: React.FC = () => {
  const { categories, items, selectedCategory, selectCategory, setCategories, setItems, isLoadingCategories, isLoadingItems } = useMenuContext();
  const restaurantContext = React.useContext(RestaurantContext);
  const activeRestaurant = restaurantContext?.activeRestaurant;
  const { t } = useTranslation();
  const location = useLocation();

  React.useEffect(() => {
    if (categories && location.state?.targetCategoryId) {
      const targetCat = categories.find(c => c.id === location.state.targetCategoryId);
      if (targetCat) {
        selectCategory(targetCat);
        // Note: Opening the item edit modal automatically would require a bit more plumbing.
        // Selecting the category is a good start.
      }
    }
  }, [categories, location.state, selectCategory]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const isCategoryDrag = categories?.some(c => c.id === active.id);

      if (isCategoryDrag && categories && activeRestaurant) {
        const oldIndex = categories.findIndex(c => c.id === active.id);
        const newIndex = categories.findIndex(c => c.id === over.id);
        const newCategories = arrayMove(categories, oldIndex, newIndex);
        setCategories(newCategories as any);
        await updateCategoryOrder(activeRestaurant.id, newCategories.map(c => c.id));
      } else if (items && selectedCategory) {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        setItems(newItems as any);
        await updateItemOrder(selectedCategory.id, newItems.map(i => i.id));
      }
    }
  }

  const handleTrendingChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (activeRestaurant) {
      try {
        await updateRestaurant(activeRestaurant.id, { trendingMode: e.target.value as any });
        window.location.reload(); 
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen">
        <h1 className="text-4xl md:text-5xl font-serif font-black text-foreground tracking-tighter mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
            {t('menuAdmin.editor')}
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="lg:col-span-1">
            <div className="glass-panel p-6 sm:p-10 rounded-[2rem] border-white/5 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <Settings2 className="w-5 h-5 text-accent" />
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">Storefront Upselling</h2>
              </div>
              <div className="space-y-4">
                <div>
                   <label className="block text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Trending Engine</label>
                   <select 
                     value={activeRestaurant?.trendingMode || 'AUTO'} 
                     onChange={handleTrendingChange}
                     className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-accent"
                   >
                     <option value="AUTO">🤖 Auto (Algorithm)</option>
                     <option value="MANUAL">⭐ Manual (Hand-picked)</option>
                     <option value="OFF">🚫 Off</option>
                   </select>
                   <p className="text-[10px] text-muted-foreground mt-2 font-medium opacity-60">
                     {activeRestaurant?.trendingMode === 'MANUAL' ? 'Click the stars on items to feature them on your menu.' : 'Automatically analyzes sales to trend popular items.'}
                   </p>
                </div>
              </div>
            </div>

            <div className="glass-panel p-6 sm:p-10 rounded-[2rem] min-h-[50vh] border-white/5">
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">{t('menuAdmin.categories')}</h2>
              {isLoadingCategories ? (
                <div className="flex justify-center p-4">
                  <p className="text-muted-foreground font-medium">{t('menuAdmin.loadingCategories')}</p>
                </div>
              ) : (
                <CategoryList />
              )}
              <div className="mt-8 border-t border-border pt-6">
                <CreateCategoryForm />
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="glass-panel p-6 sm:p-10 rounded-[2.5rem] min-h-[50vh] border-white/5 relative overflow-hidden">
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">
                {selectedCategory ? t('menuAdmin.itemsIn', { categoryName: selectedCategory.name }) : t('menuAdmin.selectCategory')}
              </h2>
              {isLoadingItems ? (
                <div className="flex justify-center p-4">
                  <p className="text-muted-foreground font-medium">{t('menuAdmin.loadingItems')}</p>
                </div>
              ) : (
                <ItemList />
              )}
              {selectedCategory && (
                <div className="mt-8 border-t border-border pt-6">
                  <CreateItemForm />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
};

export default MenuEditorPage;
