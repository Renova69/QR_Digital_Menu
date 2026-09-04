import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

const RESTAURANT_ID = "mobile-staff-restaurant";

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

async function mockStaffSettingsApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "en");
  });

  await page.context().route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/v1/auth/me") {
      await fulfillJson(route, {
        id: "mobile-owner",
        email: "owner@example.com",
        name: "Mobile Owner",
        role: "OWNER",
        onboardingComplete: true,
      });
      return;
    }

    if (path === "/api/v1/restaurants") {
      await fulfillJson(route, [
        {
          id: RESTAURANT_ID,
          name: "Mobile Bistro",
          ownerId: "mobile-owner",
          tier: "ENTERPRISE",
          paymentsEnabled: false,
          dashboardLanguage: "en",
          timezone: "Europe/Sofia",
          sharedDeviceModeEnabled: true,
          pinLoginStartTime: "11:00",
          pinLoginEndTime: "23:00",
        },
      ]);
      return;
    }

    if (path === "/api/v1/subscription/status") {
      await fulfillJson(route, {
        tier: "ENTERPRISE",
        features: [
          "orders:receive",
          "analytics:basic",
          "analytics:full",
          "pos",
          "kds",
        ],
        staffLimit: 25,
        allowedStaffRoles: ["STAFF", "MANAGER", "WAITER", "KITCHEN"],
        hasSubscription: true,
        subscription: null,
      });
      return;
    }

    if (path === `/api/v1/restaurants/${RESTAURANT_ID}/staff`) {
      await fulfillJson(route, [
        {
          id: "waiter-one",
          email: "long.waiter.address@example.com",
          name: "Alexandra Longname",
          role: "WAITER",
          isActive: true,
          createdAt: "2026-08-30T08:00:00.000Z",
          updatedAt: "2026-08-30T08:00:00.000Z",
        },
      ]);
      return;
    }

    if (
      path === `/api/v1/restaurants/${RESTAURANT_ID}/device-enrollments` ||
      path === `/api/v1/restaurants/${RESTAURANT_ID}/pin-security-alerts`
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (path === "/api/v1/platform-settings/public") {
      await fulfillJson(route, { announcementBannerEnabled: false });
      return;
    }

    await fulfillJson(route, []);
  });
}

async function expectNoHorizontalOverflow(
  clippedHeader: Locator,
): Promise<void> {
  const layout = await clippedHeader.evaluate((header) => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    horizontalScrollers: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth + 1 &&
          ["auto", "scroll"].includes(getComputedStyle(element).overflowX),
      )
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    overflowingElements: [...document.querySelectorAll<HTMLElement>("body *")]
      // The caller verifies this header is clipped for sighted users. Its
      // accessible descendants keep full boxes, but cannot paint or scroll.
      .filter((element) => !header.contains(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > window.innerWidth + 1),
      )
      .slice(0, 12),
  }));

  expect(
    layout.documentWidth,
    `overflowing elements: ${JSON.stringify(layout.overflowingElements)}`,
  ).toBeLessThanOrEqual(layout.viewportWidth);
  expect(
    layout.overflowingElements,
    "staff settings content should not be clipped outside the viewport",
  ).toEqual([]);
  expect(
    layout.horizontalScrollers,
    "staff settings should not require horizontal scrolling",
  ).toEqual([]);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
  { width: 1536, height: 960 },
]) {
  test(`staff settings stay stacked without overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockStaffSettingsApi(page);

    await page.goto("/dashboard?tab=settings&settingsTab=staff&lng=en");
    await expect(
      page.getByRole("heading", { name: "Staff Members" }),
    ).toBeVisible();
    await expect(page.getByText("Alexandra Longname")).toBeVisible();

    const table = page
      .getByRole("table")
      .filter({ hasText: "Alexandra Longname" });
    const header = table.locator("thead");
    // sr-only is visually clipped, not display:none: the column names must
    // remain accessible at every width. toBeHidden() tests the wrong contract.
    for (const name of [
      "Name",
      "Email",
      "Role",
      "Status",
      "Last update",
      "Open staff actions",
    ]) {
      await expect(
        table.getByRole("columnheader", { name, exact: true }),
      ).toHaveAttribute("scope", "col");
    }
    await expect(header).toHaveCSS("position", "absolute");
    await expect(header).toHaveCSS("width", "1px");
    await expect(header).toHaveCSS("height", "1px");
    await expect(header).toHaveCSS("overflow", "hidden");
    await expect(header).toHaveCSS("clip-path", "inset(50%)");

    const card = table.locator("tbody > tr");
    await expect(card).toHaveCSS("display", "block");
    for (const label of ["Email", "Role", "Status", "Last update"]) {
      await expect(card.getByText(label, { exact: true })).toBeVisible();
    }
    await expectNoHorizontalOverflow(header);

    await card.scrollIntoViewIfNeeded();
    const actions = card.getByRole("button", { name: "Open staff actions" });
    await expect(actions).toBeInViewport();
    await actions.click();
    for (const name of [
      "Reset PIN",
      "Re-bond Device",
      "Deactivate",
      "Remove permanently",
    ]) {
      const action = card.getByRole("button", { name, exact: true });
      await expect(action).toBeVisible();
      await expect(action).toBeInViewport();
      await expect(action).toBeEnabled();
    }
    await expectNoHorizontalOverflow(header);
  });
}
