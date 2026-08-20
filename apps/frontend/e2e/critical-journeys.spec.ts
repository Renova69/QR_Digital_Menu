import { expect, test, type Page, type Route } from "@playwright/test";

const RESTAURANT_ID = "e2e-restaurant";
const CANONICAL_SLUG = "test-bistro";

const menuMeta = {
  restaurant: {
    id: RESTAURANT_ID,
    name: "Test Bistro",
    tier: "PROFESSIONAL",
    features: ["orders:receive"],
    paymentsEnabled: false,
    dashboardLanguage: "en",
    menuSourceLanguage: "bg",
    targetLanguages: ["en"],
    defaultTheme: "light",
  },
  categories: [
    {
      id: "starters",
      name: "Starters",
      originalName: "Starters",
      translations: {},
    },
  ],
};

const menuItems = {
  starters: [
    {
      id: "soup",
      categoryId: "starters",
      name: "Tomato Soup",
      originalName: "Tomato Soup",
      description: "Roasted tomato and basil",
      originalDescription: "Roasted tomato and basil",
      price: 8,
      currency: "EUR",
      available: true,
      allergens: [],
      dietaryTags: ["VEGAN"],
      options: [],
      translations: {},
    },
  ],
};

const reservationConfig = {
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
  allergens: {
    allergens: [],
    dietaryTags: [],
  },
};

async function fulfillJson(
  route: Route,
  json: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(json),
  });
}

async function mockPublicApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "en");
  });

  await page.context().route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/v1/auth/me") {
      await fulfillJson(route, { message: "Unauthorized" }, 401);
      return;
    }

    if (path === "/api/v1/auth/login") {
      await fulfillJson(route, { message: "Invalid credentials" }, 401);
      return;
    }

    if (path === "/api/v1/auth/register") {
      await fulfillJson(route, { requiresVerification: true });
      return;
    }

    if (path === "/api/v1/platform-settings/public") {
      await fulfillJson(route, {
        announcementBannerEnabled: false,
        announcementBannerText: null,
        announcementBannerType: "info",
      });
      return;
    }

    if (path === `/api/v1/menu/public/resolve/${CANONICAL_SLUG}`) {
      await fulfillJson(route, {
        restaurantId: RESTAURANT_ID,
        canonicalSlug: CANONICAL_SLUG,
      });
      return;
    }

    if (path === "/api/v1/menu/public/resolve/old-test-bistro") {
      await fulfillJson(route, {
        restaurantId: RESTAURANT_ID,
        canonicalSlug: CANONICAL_SLUG,
      });
      return;
    }

    if (path === "/api/v1/menu/public/resolve/released-test-bistro") {
      await fulfillJson(route, { message: "Gone" }, 410);
      return;
    }

    if (path === `/api/v1/menu/public/${RESTAURANT_ID}/meta`) {
      await fulfillJson(route, menuMeta);
      return;
    }

    if (path === `/api/v1/menu/public/${RESTAURANT_ID}/items`) {
      await fulfillJson(route, menuItems);
      return;
    }

    if (path === `/api/v1/menu/public/${RESTAURANT_ID}/view`) {
      await fulfillJson(route, {});
      return;
    }

    if (path === `/api/v1/reservations/public/${RESTAURANT_ID}/config`) {
      await fulfillJson(route, reservationConfig);
      return;
    }

    if (
      path === `/api/v1/reservations/public/${RESTAURANT_ID}/availability` &&
      request.method() === "GET"
    ) {
      await fulfillJson(route, {
        slots: [
          {
            startsAt: "2099-07-05T15:00:00.000Z",
            label: "18:00",
          },
        ],
      });
      return;
    }

    if (
      path === `/api/v1/reservations/public/${RESTAURANT_ID}` &&
      request.method() === "POST"
    ) {
      await fulfillJson(route, {
        referenceCode: "RES-123",
        manageToken: "manage-secret",
      });
      return;
    }

    await fulfillJson(route, {});
  });
}

test.beforeEach(async ({ page }) => {
  await mockPublicApi(page);
});

test("customer can open a restaurant menu", async ({ page }) => {
  await page.goto(`/menu/public/${RESTAURANT_ID}?table=7&lang=en`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Test Bistro" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Starters" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Tomato Soup" }),
  ).toBeVisible();
});

test("customer can open the canonical vanity URL", async ({ page }) => {
  await page.goto(`/m/${CANONICAL_SLUG}?table=7&lang=en`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Test Bistro" }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/m/${CANONICAL_SLUG}?table=7&lang=en`);
});

test("live alias canonicalization preserves table and language", async ({
  page,
}) => {
  await page.goto("/m/old-test-bistro?table=7&lang=en");

  await expect(
    page.getByRole("heading", { level: 1, name: "Test Bistro" }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/m/${CANONICAL_SLUG}?table=7&lang=en`);
});

test("released vanity URL shows the translated moved-menu state", async ({
  page,
}) => {
  await page.goto("/m/released-test-bistro?lang=en");

  await expect(page.getByRole("alert")).toHaveText("This menu has moved.");
});

test("customer can add a menu item to the cart", async ({ page }) => {
  await page.goto(`/menu/public/${RESTAURANT_ID}?table=7&lang=en`);

  await page.getByRole("button", { name: /\+ Add/i }).click();

  const openCart = page.getByRole("button", { name: "Open cart" });
  await expect(openCart.locator("span")).toHaveText("1");
  await openCart.click();
  await expect(page.getByText("Tomato Soup", { exact: true })).toHaveCount(2);
});

test("guest can request a reservation", async ({ page }) => {
  await page.goto(`/book/${RESTAURANT_ID}?lng=en`);

  await page.getByRole("button", { name: "18:00" }).click();
  await page.getByPlaceholder("Your full name").fill("Maria Test");
  await page.getByPlaceholder("Enter mobile number").fill("888123456");
  await page.getByPlaceholder("you@example.com").fill("maria@example.com");

  const reservationRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        `/api/v1/reservations/public/${RESTAURANT_ID}`,
  );
  await page.getByRole("button", { name: "Request reservation" }).click();

  const request = await reservationRequest;
  expect(request.postDataJSON()).toEqual(
    expect.objectContaining({
      guestName: "Maria Test",
      guestEmail: "maria@example.com",
      adultsCount: 2,
      childrenCount: 0,
    }),
  );
  await expect(page).toHaveURL(/\/booking\/confirmation\?ref=RES-123/);
});

test("owner sees a useful error for invalid credentials", async ({ page }) => {
  await page.goto("/login?lng=en");

  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();

  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("new owner is prompted to verify registration", async ({ page }) => {
  await page.goto("/register?lng=en");

  await page.getByLabel("Email").fill("new-owner@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  // Registration is gated on the terms checkbox — LoginDialog keeps the submit
  // button disabled until it is ticked. Without this the click just waits for
  // an element that never becomes actionable and the test dies on timeout
  // rather than on a real assertion.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await expect(page.getByLabel("Verification code")).toBeVisible();
});
