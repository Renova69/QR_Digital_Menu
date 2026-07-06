import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PricingPage from "./PricingPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../hooks/useFeature", () => ({
  useTier: () => ({
    tier: "FREE",
    hasSubscription: false,
  }),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../context/RestaurantContext", () => ({
  default: createContext(undefined),
}));

vi.mock("../lib/api", () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

describe("PricingPage reservation entitlement", () => {
  it("shows reservations as a Professional and Enterprise feature only", () => {
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>,
    );

    const row = screen.getByText("pricing.features.reservations").closest("tr");
    const cells = row?.querySelectorAll("td");

    expect(cells).toHaveLength(5);
    expect(cells?.[1].querySelector("svg")).toBeNull();
    expect(cells?.[2].querySelector("svg")).toBeNull();
    expect(cells?.[3].querySelector("svg")).not.toBeNull();
    expect(cells?.[4].querySelector("svg")).not.toBeNull();
    expect(screen.getByText("pricing.tiers.professional.b11")).toBeTruthy();
  });

  it.each([
    ["en", "Reservations"],
    ["bg", "Резервации"],
    ["de", "Reservierungen"],
    ["el", "Κρατήσεις"],
    ["es", "Reservas"],
    ["fr", "Réservations"],
    ["it", "Prenotazioni"],
    ["ro", "Rezervări"],
    ["zh", "预订"],
  ])("keeps reservation pricing copy complete in %s", (language, label) => {
    const path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      `../locales/${language}/translation.json`,
    );
    const locale = JSON.parse(readFileSync(path, "utf8"));

    expect(locale.pricing.features.reservations).toBe(label);
    expect(locale.pricing.tiers.professional.b11).toBe(label);
    expect(locale.landing.pricingSection.plans.professional.b10).toBe(label);
    expect(locale.landing.comparisonTable.rows.reservations).toBe(label);
  });
});
