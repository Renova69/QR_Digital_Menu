import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("mobile-first dashboard UX contracts", () => {
  it("lets menu-editor text wrap and keeps item metadata/actions within the card", () => {
    const categories = readSource("./components/menu/CategoryList.tsx");
    const items = readSource("./components/menu/ItemList.tsx");

    expect(categories).toMatch(/whitespace-normal\s+break-words\s+sm:truncate/);
    expect(items).toMatch(
      /line-clamp-2[^"]*sm:line-clamp-1|sm:line-clamp-1[^"]*line-clamp-2/,
    );
    expect(items).toMatch(/flex-wrap[^"]*max-w-full|max-w-full[^"]*flex-wrap/);
    expect(items).toMatch(/w-full[^"]*flex-wrap[^"]*justify-between/);
    expect(items).toMatch(/w-full[^"]*sm:w-auto[^"]*sm:justify-end/);
    expect(items).not.toContain(
      "{(item.dietaryTags?.length || item.allergens?.length) && (",
    );
  });

  it("removes the order sound-preview-only control", () => {
    const orders = readSource("./pages/Dashboard/OrdersView.tsx");

    expect(orders).not.toContain("handleSoundPreview");
    expect(orders).not.toContain("orders.previewSound");
  });

  it("uses full-width touch-sized table and zone creation controls on mobile", () => {
    const tables = readSource("./components/tables/TableView.tsx");

    expect(tables.match(/h-12 w-full/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("uses 2x2 grids instead of horizontal scrollers for live-table and help filters", () => {
    const liveTables = readSource("./pages/Dashboard/LiveTablesView.tsx");
    const help = readSource("./pages/Dashboard/HelpView.tsx");

    expect(liveTables).toContain("grid grid-cols-2");
    expect(liveTables).toContain("sm:inline-flex");
    expect(help).toContain("grid grid-cols-2");
    expect(help).toContain("lg:flex");
  });

  it("stacks the reservation custom-chip input and action on narrow screens", () => {
    const preferences = readSource(
      "./components/reservations/CustomPreferencesEditor.tsx",
    );

    expect(preferences).toContain("flex flex-col gap-2 sm:flex-row");
    expect(preferences).toMatch(/min-w-0[^"]*w-full|w-full[^"]*min-w-0/);
  });

  it("uses a vertical demand list only on mobile", () => {
    const analytics = readSource("./pages/Dashboard/analytics/panels.tsx");

    expect(analytics).toContain('data-testid="hourly-demand-mobile"');
    expect(analytics).toContain("sm:hidden");
    expect(analytics).toContain('data-testid="hourly-demand-chart"');
    expect(analytics).toContain("hidden sm:block");
  });

  it("uses a solid selected state for mobile settings tabs", () => {
    const settings = readSource("./pages/Dashboard/SettingsView.tsx");

    expect(settings).toContain(
      "bg-primary text-primary-foreground shadow-sm sm:bg-transparent sm:text-primary",
    );
  });

  it("scopes legacy dashboard buttons to the 14px control system", () => {
    const dashboard = readSource("./pages/DashboardPage.tsx");
    const menuEditor = readSource("./pages/MenuEditorPage.tsx");
    const modal = readSource("./components/ui/Modal.tsx");
    const styles = readSource("./index.css");

    expect(dashboard).toContain("dashboard-ui");
    expect(menuEditor).toContain("dashboard-ui");
    expect(styles).toContain(".dashboard-ui button.text-base");
    expect(styles).toContain(
      ".dashboard-ui button.whitespace-nowrap.uppercase.tracking-wider",
    );
    expect(styles).toContain("font-size: 0.875rem");
    expect(styles).toContain("min-height: 2.75rem");
    expect(modal).toContain('dashboardUi && "dashboard-ui p-4 sm:p-8"');
  });

  it("keeps Menu Editor empty and loading states compact on mobile", () => {
    const itemList = readSource("./components/menu/ItemList.tsx");
    const searchResults = readSource("./components/menu/MenuSearchResults.tsx");
    const categoryList = readSource("./components/menu/CategoryList.tsx");

    expect(itemList).not.toMatch(/className="[^"]*\sp-12(?:\s|")/);
    expect(searchResults).not.toMatch(/className="[^"]*\sp-12(?:\s|")/);
    expect(categoryList).toContain("p-4 shadow-xl sm:p-6");
  });

  it("does not expand Menu Editor icon-only actions with text-button sizing", () => {
    const itemList = readSource("./components/menu/ItemList.tsx");
    const categoryList = readSource("./components/menu/CategoryList.tsx");
    const button = readSource("./components/ui/button.tsx");
    const styles = readSource("./index.css");

    expect(itemList).toContain('<Edit className="h-5 w-5');
    expect(categoryList).toContain('aria-label={t("menuAdmin.editCategory"');
    expect(categoryList).toContain('aria-label={t("menuAdmin.categorySettings"');
    expect(button).toContain('icon: "h-11 w-11 p-0"');
    expect(styles).toContain(
      "button.whitespace-nowrap.uppercase.tracking-wider:not(.p-0)",
    );
    expect(styles).not.toContain(
      "button.whitespace-nowrap.uppercase.tracking-wider:not(.w-11)",
    );
  });

  it("exposes Menu Editor and the Analytics label in the mobile More sheet", () => {
    const dashboard = readSource("./pages/DashboardPage.tsx");

    expect(dashboard.match(/to="\/dashboard\/menu"/g)?.length ?? 0).toBe(2);
    expect(dashboard).toContain(
      '{ id: "analytics", Icon: BarChart2, labelKey: "dashboard.tabs.analytics" }',
    );
  });
});
