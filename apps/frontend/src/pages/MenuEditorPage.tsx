import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CategoryList } from "../components/menu/CategoryList";
import { ItemList } from "../components/menu/ItemList";
import { CreateCategoryForm } from "../components/menu/CreateCategoryForm";
import { CreateItemForm } from "../components/menu/CreateItemForm";
import { MenuSearchResults } from "../components/menu/MenuSearchResults";
import { useMenuContext } from "../context/MenuContext";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  updateCategoryOrder,
  updateItemOrder,
  getItems,
} from "../services/menuService";
import { updateRestaurant } from "../services/restaurantService";
import RestaurantContext from "../context/RestaurantContext";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Download,
  Search,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import MenuImportExportView from "./Dashboard/MenuImportExportView";
import BulkEditView from "./Dashboard/BulkEditView";
import { MenuCheckWidget } from "../components/dashboard/MenuCheckWidget";
import { DashboardButton } from "../components/dashboard/DashboardButton";
import { dashboardSurface } from "../components/dashboard/dashboardUi";
import { searchMenuItems } from "../lib/menuSearch";

type EditorTab = "editor" | "importExport" | "bulkEdit";

const DASHBOARD_LANGUAGES = [
  { code: "bg", label: "BG" },
  { code: "en", label: "EN" },
  { code: "ro", label: "RO" },
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
  const queryClient = useQueryClient();
  const [activeEditorTab, setActiveEditorTab] =
    React.useState<EditorTab>("editor");
  const [searchQuery, setSearchQuery] = React.useState("");
  const isSearching = searchQuery.trim().length > 0;

  // Fetched once (and cached) the first time a search starts — reuses the
  // same ["items", categoryId] cache key as the normal per-category fetch,
  // so results are warm if the owner then clicks into that category.
  const categoryIds = React.useMemo(
    () => (categories ?? []).map((c) => c.id).join(","),
    [categories],
  );
  const { data: searchItemsByCategory, isFetching: isSearchLoading } = useQuery(
    {
      queryKey: ["menu-search-items", activeRestaurant?.id, categoryIds],
      queryFn: async () => {
        const entries = await Promise.all(
          (categories ?? []).map(async (c) => {
            const catItems = await queryClient.fetchQuery({
              queryKey: ["items", c.id],
              queryFn: () => getItems(c.id),
              staleTime: 60_000,
            });
            return [c.id, catItems] as const;
          }),
        );
        return Object.fromEntries(entries);
      },
      enabled: !!activeRestaurant?.id && !!categories?.length && isSearching,
      staleTime: 60_000,
    },
  );

  const categoryNameById = React.useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  const searchResults = React.useMemo(
    () =>
      isSearching
        ? searchMenuItems(
            searchItemsByCategory,
            categoryNameById,
            searchQuery,
            (key: string) => t(key),
          )
        : [],
    [isSearching, searchItemsByCategory, categoryNameById, searchQuery, t],
  );

  const handleSelectSearchResult = (categoryId: string) => {
    const cat = categories?.find((c) => c.id === categoryId);
    if (cat) selectCategory(cat);
    setActiveEditorTab("editor");
    setSearchQuery("");
  };

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
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  return (
    <div className="dashboard-ui min-h-screen bg-background">
      <header className="bg-card border-b border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="min-w-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("menuAdmin.backToDashboard", "Back to dashboard")}
            </Link>
            <h1 className="mt-1 text-xl font-display font-black text-foreground tracking-tight">
              {t("menuAdmin.editor")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {activeRestaurant?.name
                ? t(
                    "menuAdmin.editorForRestaurant",
                    "Editing menu for {{restaurantName}}",
                    { restaurantName: activeRestaurant.name },
                  )
                : userName
                  ? t("dashboard.welcomeBack", "Welcome back") + `, ${userName}`
                  : t("menuAdmin.editorSubtitle", "Manage your menu.")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={i18n.language?.slice(0, 2) ?? "en"}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="h-8 px-3 rounded-xl text-xs font-bold uppercase tracking-widest text-foreground/70 cursor-pointer bg-secondary border border-border hover:bg-muted transition-all"
              aria-label={t("publicMenu.selectLanguage") as string}
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

      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3 justify-between">
          <div
            className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border/60 bg-card p-1"
            role="tablist"
            aria-label={t("menuAdmin.editorSections", "Menu editor sections")}
          >
            {[
              {
                id: "editor" as EditorTab,
                label: t("menuAdmin.itemsTab", "Items"),
                icon: Settings2,
              },
              {
                id: "importExport" as EditorTab,
                label: t("dashboard.tabs.importExport", "Import/Export"),
                icon: Download,
              },
              {
                id: "bulkEdit" as EditorTab,
                label: t("dashboard.tabs.bulkEdit", "Bulk Edit"),
                icon: Table2,
              },
            ].map(({ id, label, icon: Icon }) => {
              const isActive = activeEditorTab === id;
              return (
                <DashboardButton
                  density="tab"
                  key={id}
                  type="button"
                  onClick={() => setActiveEditorTab(id)}
                  className={`${
                    isActive
                      ? "text-white"
                      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  }`}
                  style={isActive ? { background: "var(--brand)" } : {}}
                  role="tab"
                  aria-selected={isActive}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </DashboardButton>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                "menuAdmin.searchPlaceholder",
                "Search name, price, allergens…",
              )}
              aria-label={t(
                "menuAdmin.searchPlaceholder",
                "Search name, price, allergens…",
              )}
              className="w-full h-10 pl-9 pr-9 rounded-xl text-sm font-medium bg-card border border-border focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("common.clear", "Clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {isSearching ? (
          <MenuSearchResults
            results={searchResults}
            isLoading={isSearchLoading}
            query={searchQuery}
            onSelect={handleSelectSearchResult}
          />
        ) : activeEditorTab === "editor" ? (
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
                        {t("menuAdmin.trendingEngine")}
                      </label>
                      <select
                        value={activeRestaurant?.trendingMode || "AUTO"}
                        onChange={handleTrendingChange}
                        className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary"
                      >
                        <option value="AUTO">
                          {t("menuAdmin.trendingModeAuto")}
                        </option>
                        <option value="MANUAL">
                          {t("menuAdmin.trendingModeManual")}
                        </option>
                        <option value="OFF">
                          {t("menuAdmin.trendingModeOff")}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div
                  className={`glass-panel ${dashboardSurface.roomy} min-h-[50vh] rounded-2xl border-white/5`}
                >
                  <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">
                    {t("menuAdmin.categories")}
                  </h2>
                  {isLoadingCategories ? (
                    <div className="flex justify-center p-4">
                      <p className="text-muted-foreground font-medium">
                        {t("menuAdmin.loadingCategories")}
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
                <div
                  className={`glass-panel ${dashboardSurface.roomy} relative min-h-[50vh] overflow-hidden rounded-2xl border-white/5`}
                >
                  <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-8">
                    {selectedCategory
                      ? t("menuAdmin.itemsIn", {
                          categoryName: selectedCategory.name,
                        })
                      : t("menuAdmin.selectCategory")}
                  </h2>
                  {isLoadingItems ? (
                    <div className="flex justify-center p-4">
                      <p className="text-muted-foreground font-medium">
                        {t("menuAdmin.loadingItems")}
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
        ) : activeEditorTab === "importExport" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <MenuImportExportView />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <BulkEditView />
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuEditorPage;
