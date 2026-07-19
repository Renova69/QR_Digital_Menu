import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import MenuEditorPage from "./MenuEditorPage";
import { useAuth } from "../context/AuthContext";
import { useMenuContext } from "../context/MenuContext";
import RestaurantContext from "../context/RestaurantContext";
import { updateRestaurant } from "../services/restaurantService";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && options.restaurantName) {
        return key + " " + options.restaurantName;
      }
      return key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = (await vi.importActual("react-router-dom")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    useLocation: () => ({ state: null }),
  };
});

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../context/MenuContext", () => ({
  useMenuContext: vi.fn(),
}));

vi.mock("../services/menuService", () => ({
  updateCategoryOrder: vi.fn(),
  updateItemOrder: vi.fn(),
  getItems: vi.fn(),
}));

vi.mock("../services/restaurantService", () => ({
  updateRestaurant: vi.fn(),
}));

// Mock components
vi.mock("../components/menu/CategoryList", () => ({
  CategoryList: () => <div data-testid="category-list">CategoryList</div>,
}));
vi.mock("../components/menu/ItemList", () => ({
  ItemList: () => <div data-testid="item-list">ItemList</div>,
}));
vi.mock("../components/menu/CreateCategoryForm", () => ({
  CreateCategoryForm: () => (
    <div data-testid="create-category-form">CreateCategoryForm</div>
  ),
}));
vi.mock("../components/menu/CreateItemForm", () => ({
  CreateItemForm: () => (
    <div data-testid="create-item-form">CreateItemForm</div>
  ),
}));
vi.mock("./Dashboard/MenuImportExportView", () => ({
  __esModule: true,
  default: () => <div data-testid="import-export-view">ImportExportView</div>,
}));
vi.mock("../components/dashboard/MenuCheckWidget", () => ({
  MenuCheckWidget: () => (
    <div data-testid="menu-check-widget">MenuCheckWidget</div>
  ),
}));
vi.mock("../components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

// Provide a virtual mock for useToast and react-query in case other child components try to import them if they weren't fully mocked
vi.mock("react-hot-toast", () => ({
  toast: vi.fn(),
  useToast: () => vi.fn(),
}));

describe("MenuEditorPage", () => {
  const mockUseAuth = useAuth as Mock;
  const mockUseMenuContext = useMenuContext as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: { name: "Test User", email: "test@example.com" },
    });

    mockUseMenuContext.mockReturnValue({
      categories: [],
      items: [],
      selectedCategory: null,
      selectCategory: vi.fn(),
      setCategories: vi.fn(),
      setItems: vi.fn(),
      isLoadingCategories: false,
      isLoadingItems: false,
    });

    // Mock window.location.reload
    Object.defineProperty(window, "location", {
      writable: true,
      value: { reload: vi.fn() },
    });
  });

  const renderWithProviders = (
    ui: React.ReactElement,
    restaurantContextValue: Partial<
      React.ContextType<typeof RestaurantContext>
    > | null = null,
  ) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <RestaurantContext.Provider
            value={
              restaurantContextValue as unknown as React.ContextType<
                typeof RestaurantContext
              >
            }
          >
            {ui}
          </RestaurantContext.Provider>
        </BrowserRouter>
      </QueryClientProvider>,
    );
  };

  it("renders correctly with default editor tab", () => {
    renderWithProviders(<MenuEditorPage />);

    expect(screen.getByText("menuAdmin.editor")).toBeTruthy();
    expect(screen.getByTestId("category-list")).toBeTruthy();
    expect(screen.getByTestId("create-category-form")).toBeTruthy();
  });

  it("shows loading states when fetching data", () => {
    mockUseMenuContext.mockReturnValue({
      categories: [],
      items: [],
      selectedCategory: null,
      selectCategory: vi.fn(),
      setCategories: vi.fn(),
      setItems: vi.fn(),
      isLoadingCategories: true,
      isLoadingItems: true,
    });

    renderWithProviders(<MenuEditorPage />);

    expect(screen.getByText("menuAdmin.loadingCategories")).toBeTruthy();
    expect(screen.getByText("menuAdmin.loadingItems")).toBeTruthy();
  });

  it("switches to import/export tab when clicked", () => {
    renderWithProviders(<MenuEditorPage />);

    const importExportTab = screen.getByRole("tab", {
      name: "dashboard.tabs.importExport",
    });
    fireEvent.click(importExportTab);

    expect(screen.getByTestId("import-export-view")).toBeTruthy();
    expect(screen.queryByTestId("category-list")).toBeNull();
  });

  it("shows ItemList when a category is selected", () => {
    mockUseMenuContext.mockReturnValue({
      categories: [{ id: "1", name: "Category 1" }],
      items: [{ id: "1", name: "Item 1" }],
      selectedCategory: { id: "1", name: "Category 1" },
      selectCategory: vi.fn(),
      setCategories: vi.fn(),
      setItems: vi.fn(),
      isLoadingCategories: false,
      isLoadingItems: false,
    });

    renderWithProviders(<MenuEditorPage />);

    expect(screen.getByTestId("item-list")).toBeTruthy();
    expect(screen.getByTestId("create-item-form")).toBeTruthy();
  });

  it("calls updateRestaurant when trending mode is changed", async () => {
    const mockRestaurantContext = {
      activeRestaurant: {
        id: "rest1",
        name: "Test Restaurant",
        country: "Bulgaria",
        ownerId: "owner1",
        trendingMode: "AUTO" as const,
      },
    };

    renderWithProviders(<MenuEditorPage />, mockRestaurantContext);

    const selects = screen.getAllByRole("combobox");
    // The second combobox is trending mode (first is language)
    const trendingSelect = selects[1];

    fireEvent.change(trendingSelect, { target: { value: "MANUAL" } });

    await waitFor(() => {
      expect(updateRestaurant).toHaveBeenCalledWith("rest1", {
        trendingMode: "MANUAL",
      });
    });
  });
});
