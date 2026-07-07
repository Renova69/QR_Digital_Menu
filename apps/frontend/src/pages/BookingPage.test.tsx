import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "./BookingPage";

const apiMocks = vi.hoisted(() => ({
  getReservationConfig: vi.fn(),
  getReservationAvailability: vi.fn(),
  createReservation: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({
  language: "en",
  changeLanguage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/api", () => apiMocks);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: i18nMock,
  }),
}));

describe("BookingPage dietary consent", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    });
    apiMocks.getReservationConfig.mockResolvedValue({
      enabled: true,
      restaurant: {
        name: "Test Bistro",
        timezone: "Europe/Sofia",
        defaultTheme: "light",
      },
      languages: ["en"],
      defaultLanguage: "en",
      policy: {
        slotIntervalMinutes: 30,
        minLeadMinutes: 60,
        bookingHorizonDays: 60,
        maxTotalGuests: 12,
        requirePhone: true,
        allergenSectionEnabled: true,
        customPreferences: [],
        zones: [],
      },
      allergens: { allergens: [], dietaryTags: [] },
    });
    apiMocks.getReservationAvailability.mockResolvedValue({
      slots: [
        {
          startsAt: "2099-07-05T15:00:00.000Z",
          label: "18:00",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires explicit consent before submitting selected health data", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/book/rest-1"]}>
        <Routes>
          <Route path="/book/:restaurantId" element={<BookingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "18:00" }));
    await user.type(screen.getByPlaceholderText("Your full name"), "Maria");
    await user.type(
      screen.getByPlaceholderText("Enter mobile number"),
      "888123456",
    );
    await user.type(
      screen.getByPlaceholderText("you@example.com"),
      "maria@example.com",
    );

    const submit = screen.getByRole("button", { name: "Request reservation" });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Vegan" }));

    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.click(
      screen.getByRole("checkbox", {
        name: /I consent to the restaurant storing this dietary/i,
      }),
    );

    await waitFor(() =>
      expect((submit as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
