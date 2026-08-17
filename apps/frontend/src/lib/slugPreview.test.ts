import { describe, expect, it } from "vitest";
import { slugifyForPreview } from "./slugPreview";

// These cases are carried over from the backend specs that are the source
// of truth for this ported logic (see slugPreview.ts header):
//   - apps/backend/src/restaurants/slug/transliterate.spec.ts
//   - apps/backend/src/restaurants/slug/slug-generator.spec.ts
// Keeping the expected values identical to those specs is what makes the
// two pipelines unable to drift silently.
describe("slugifyForPreview", () => {
  it("transliterates a Bulgarian name", () => {
    expect(slugifyForPreview("Бистро Оранж")).toBe("bistro-oranzh");
  });

  it("renders word-final -ия as -ia", () => {
    expect(slugifyForPreview("Пицария")).toBe("pitsaria");
  });

  // Guards against a future edit loosening the negative lookahead in the
  // ported -ия regex — the backend's own spec proves the rule fires only
  // at a word boundary, not on any "ия" substring.
  it("does not apply the -ия rule mid-word", () => {
    expect(slugifyForPreview("Пицариян")).toBe("pitsariyan");
  });

  it("slugifies a Latin name", () => {
    expect(slugifyForPreview("Restaurant OWEN")).toBe("restaurant-owen");
  });

  it("strips Latin diacritics", () => {
    expect(slugifyForPreview("Café Münchén")).toBe("cafe-munchen");
  });

  it("uses a for ъ, not the ISO-9 breve form", () => {
    expect(slugifyForPreview("България")).toBe("balgaria");
  });

  it("uses sht for щ", () => {
    expect(slugifyForPreview("Щастие")).toBe("shtastie");
  });

  it("maps the full Bulgarian alphabet", () => {
    expect(slugifyForPreview("абвгдежзийклмнопрстуфхцчшщъьюя")).toBe(
      "abvgdezhziyklmnoprstufhtschshshtayyuya",
    );
  });

  it("collapses runs of separators", () => {
    expect(slugifyForPreview("Bistro   ---   Orange!!")).toBe("bistro-orange");
  });

  it("truncates at a hyphen boundary, never mid-word", () => {
    const name = "aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee";
    const slug = slugifyForPreview(name);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("aaaaaaaaaa-bbbbbbbbbb-cccccccccc");
  });

  it("hard-cuts when the first token alone exceeds the length bound", () => {
    const name = "a".repeat(50);
    const slug = slugifyForPreview(name);
    expect(slug.length).toBe(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  // Backend equivalent: generateSlugBase falls back to
  // `restaurant-<id.slice(0,6)>` when nothing survives. There is no
  // restaurant id yet during onboarding preview, so this only asserts the
  // same *shape* (prefix + 6 chars) — see slugPreview.ts header.
  it("falls back to an id-shaped placeholder when nothing survives (emoji-only)", () => {
    expect(slugifyForPreview("🍕🍕🍕")).toMatch(/^restaurant-[a-z0-9]{6}$/);
  });

  it("falls back for an all-numeric name", () => {
    expect(slugifyForPreview("12345")).toMatch(/^restaurant-[a-z0-9]{6}$/);
  });

  it("is deterministic — same input always previews the same fallback", () => {
    expect(slugifyForPreview("🍕🍕🍕")).toBe(slugifyForPreview("🍕🍕🍕"));
  });
});
