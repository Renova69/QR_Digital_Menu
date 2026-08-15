import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const CALL_SITES = [
  "components/tables/QrCodeModal.tsx",
  "components/tables/PrintableQRCodes.tsx",
  "components/tables/ServicePointsTab.tsx",
  "components/tables/TableView.tsx",
  "pages/BookingManagePage.tsx",
  "pages/BookingConfirmationPage.tsx",
  "pages/BookingPage.tsx",
];

describe("menu URL seam", () => {
  it.each(CALL_SITES)("%s builds no menu URL by hand", (relativePath) => {
    const source = readFileSync(join(ROOT, relativePath), "utf8");
    expect(source).not.toMatch(/\/menu\/public\/\$\{/);
    expect(source).not.toMatch(/to=\{`\/menu\/public\//);
    expect(source).not.toMatch(/href=\{`\/menu\/public\//);
  });
});
