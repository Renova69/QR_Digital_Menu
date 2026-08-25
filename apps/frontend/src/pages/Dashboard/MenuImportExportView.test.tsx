import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MenuImportExportView from "./MenuImportExportView";
import RestaurantContext from "../../context/RestaurantContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock API endpoints
const mockGetImportApiKey = vi.fn();
const mockRegenerateImportApiKey = vi.fn();
const mockExportMenu = vi.fn();
const mockConfirmMenuImport = vi.fn();

vi.mock("../../lib/api", () => ({
  getImportApiKey: (...args: any[]) => mockGetImportApiKey(...args),
  regenerateImportApiKey: (...args: any[]) => mockRegenerateImportApiKey(...args),
  exportMenu: (...args: any[]) => mockExportMenu(...args),
  confirmMenuImport: (...args: any[]) => mockConfirmMenuImport(...args),
}));

vi.mock("../../lib/menuExport", () => ({
  downloadMenuExport: vi.fn(),
}));

const mockRestaurant = {
  id: "rest-1",
  name: "Test Restaurant",
  currency: "EUR",
  tier: "PROFESSIONAL",
};

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RestaurantContext.Provider
        value={{
          activeRestaurant: mockRestaurant as any,
          restaurants: [mockRestaurant as any],
          setActiveRestaurant: vi.fn(),
          isLoading: false,
          error: null,
          refreshRestaurants: vi.fn(),
        }}
      >
        {ui}
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
}

describe("MenuImportExportView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetImportApiKey.mockResolvedValue({
      apiKey: "import-key-abcdef123456",
      createdAt: "2026-08-01",
    });
    mockExportMenu.mockResolvedValue({
      categories: [
        { id: "c1", name: "Starters", items: [{ id: "i1", name: "Soup", price: 5 }] },
      ],
    });
  });

  it("renders Import sub-tab by default with dropzone and API Key panel", async () => {
    renderWithProviders(<MenuImportExportView />);

    expect(screen.getByRole("tab", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /export/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetImportApiKey).toHaveBeenCalledWith("rest-1");
    });
  });

  it("switches to Export sub-tab when clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MenuImportExportView />);

    const exportTab = screen.getByRole("tab", { name: /export/i });
    await user.click(exportTab);

    expect(exportTab).toHaveAttribute("aria-selected", "true");
  });
});
