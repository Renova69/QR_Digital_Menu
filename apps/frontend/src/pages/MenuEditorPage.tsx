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
import { ArrowLeft, Download, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import MenuImportExportView from './Dashboard/MenuImportExportView';
import { MenuCheckWidget } from '../components/dashboard/MenuCheckWidget';

type EditorTab = 'editor' | 'importExport';

const DASHBOARD_LANGUAGES = [
  { code: 'bg', label: 'BG' },
  { code: 'en', label: 'EN' },
  { code: 'ro', label: 'RO' },
];

const MenuEditorPage: React.FC = () => {
  const {
    categories,
    items,
    selectedCategory,
    selectCategory,
    setCategories,
    setItems,
    isLoadingCategories,
    isLoadingItems,
  } = useMenuContext();
  const restaurantContext = React.useContext(RestaurantContext);
  const activeRestaurant = restaurantContext?.activeRestaurant;
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [activeEditorTab, setActiveEditorTab] =
    React.useState<EditorTab>('editor');

  React.useEffect(() => {
    if (categories && location.state?.targetCategoryId) {
      const targetCat = categories.find(
        (c) => c.id === location.state.targetCategoryId,
      );
      if (targetCat) {
        selectCategory(targetCat);
        // Selecting the category is a good start; opening edit needs extra modal plumbing.
      }
    }
  }, [categories, location.state, selectCategory]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const isCategoryDrag = categories?.some((c) => c.id === active.id);

      if (isCategoryDrag && categories && activeRestaurant) {
        const oldIndex = categories.findIndex((c) => c.id === active.id);
        const newIndex = categories.findIndex((c) => c.id === over.id);
        const newCategories = arrayMove(categories, oldIndex, newIndex);
        setCategories(newCategories as any);
        await updateCategoryOrder(
          activeRestaurant.id,
          newCategories.map((c) => c.id),
        );
      } else if (items && selectedCategory) {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        setItems(newItems as any);
        await updateItemOrder(
          selectedCategory.id,
          newItems.map((i) => i.id),
        );
      }
    }
  }

  const handleTrendingChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    if (activeRestaurant) {
      try {
        await updateRestaurant(activeRestaurant.id, {
          trendingMode: e.target.value as any,
        });
        window.location.reload();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const userName =
    user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border/60">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('menuAdmin.backToDashboard', 'Back to dashboard')}
            </Link>
            <h1 className="mt-1 text-xl font-display font-black text-foreground tracking-tight">
              {t('menuAdmin.editor')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeRestaurant?.name
                ? t(
                    'menuAdmin.editorForRestaurant',
                    'Editing menu for {{restaurantName}}',
                    { restaurantName: activeRestaurant.name },
                  )
                : userName
                  ? t('dashboard.welcomeBack', 'Welcome back') + `, ${userName}`
                  : t('menuAdmin.editorSubtitle', 'Manage your menu.')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={i18n.language?.slice(0, 2) ?? 'en'}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="h-8 px-3 rounded-xl text-xs font-bold uppercase tracking-widest text-foreground/70 cursor-pointer bg-secondary border border-border hover:bg-muted transition-all"
              aria-label={t('publicMenu.selectLanguage') as string}
            >
              {DASHBOARD_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <ThemeToggle size="sm" />
          </div>
        </div>
      </header>

      <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div
          className="mb-6 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border/60 bg-card p-1"
          role="tablist"
          aria-label={t('menuAdmin.editorSections', 'Menu editor sections')}
        >
          {[
            {
              id: 'editor' as EditorTab,
              label: t('menuAdmin.itemsTab', 'Items'),
              icon: Settings2,
            },
            {
              id: 'importExport' as EditorTab,
              label: t('dashboard.tabs.importExport', 'Import/Export'),
              icon: Download,
            },
          ].map(({ id, label, icon: Icon }) => {
            const isActive = activeEditorTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveEditorTab(id)}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                  isActive
                    ? 'text-white'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                }`}
                style={isActive ? { background: 'var(--brand)' } : {}}
                role="tab"
                aria-selected={isActive}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        {activeEditorTab === 'editor' ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="lg:col-span-1">
                <div className="glass-panel p-4 rounded-xl border-white/5 mb-4">
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {t('menuAdmin.trendingEngine')}
                      </label>
                      <select
                        value={activeRestaurant?.trendingMode || 'AUTO'}
                        onChange={handleTrendingChange}
                        className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary"
                      >
                        <option value="AUTO">
                          {t('menuAdmin.trendingModeAuto')}
                        </option>
                        <option value="MANUAL">
                          {t('menuAdmin.trendingModeManual')}
                        </option>
                        <option value="OFF">
                          {t('menuAdmin.trendingModeOff')}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-6 sm:p-8 rounded-2xl min-h-[50vh] border-white/5">
                  <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">
                    {t('menuAdmin.categories')}
                  </h2>
                  {isLoadingCategories ? (
                    <div className="flex justify-center p-4">
                      <p className="text-muted-foreground font-medium">
                        {t('menuAdmin.loadingCategories')}
                      </p>
                    </div>
                  ) : (
                    <CategoryList />
                  )}
                  <div className="mt-8 border-t border-border pt-6">
                    <CreateCategoryForm />
                  </div>
                </div>
                
                <div className="mt-4 hidden lg:block">
                  <MenuCheckWidget />
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="glass-panel p-6 sm:p-8 rounded-2xl min-h-[50vh] border-white/5 relative overflow-hidden">
                  <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">
                    {selectedCategory
                      ? t('menuAdmin.itemsIn', {
                          categoryName: selectedCategory.name,
                        })
                      : t('menuAdmin.selectCategory')}
                  </h2>
                  {isLoadingItems ? (
                    <div className="flex justify-center p-4">
                      <p className="text-muted-foreground font-medium">
                        {t('menuAdmin.loadingItems')}
                      </p>
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
                
                <div className="mt-8 block lg:hidden">
                  <MenuCheckWidget />
                </div>
              </div>
            </div>
          </DndContext>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <MenuImportExportView />
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuEditorPage;
