import { vi } from "vitest";
import {
  csvToPayload,
  parseCSVRows,
  jsonToPayload,
  xlsxToPayload,
  parseImportPrice,
} from "./MenuImportExportView";
const excel = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("read-excel-file/browser", () => ({ readSheet: excel.read }));

describe("money parsing across import formats", () => {
  it.each(["12,50", "12.50", "12,50 €", "EUR 12.50", 12.5])(
    "preserves cents in %s",
    (value) => {
      expect(parseImportPrice(value)).toBe(12.5);
    },
  );
  it.each(["1.234,56", "1,234.56", "1 234,56", "1\u00a0234.56"])(
    "handles explicit grouping in %s",
    (value) => {
      expect(parseImportPrice(value)).toBe(1234.56);
    },
  );
  it("normalizes JSON variants and canonical options without losing an explicit zero", () => {
    const [category] = jsonToPayload(
      JSON.stringify({
        categories: [
          {
            name: "Mains",
            items: [
              {
                name: "Soup",
                price: "12,50",
                variants: [{ name: "Large", price: "2,50" }],
              },
              {
                name: "Salad",
                price: 5,
                options: [
                  {
                    name: "Dressing",
                    choices: [{ name: "Oil", priceModifier: 0, price: 99 }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(category.items[0].price).toBe(12.5);
    expect(category.items[0].options[0].choices[0]).toEqual({
      name: "Large",
      priceModifier: 2.5,
    });
    expect(category.items[1].options[0].choices[0]).toEqual({
      name: "Oil",
      priceModifier: 0,
    });
  });
  it.each([{ currency: "BGN" }, { currency: "EUR", itemCurrency: "BGN" }])(
    "rejects non-EUR JSON at either level: %j",
    ({ currency, itemCurrency }) => {
      expect(() =>
        jsonToPayload(
          JSON.stringify({
            currency,
            categories: [
              {
                name: "Mains",
                items: [{ name: "Soup", price: 10, currency: itemCurrency }],
              },
            ],
          }),
        ),
      ).toThrow("importExport.errors.eurOnly");
    },
  );
  it("parses text and numeric Excel prices and choice modifiers", async () => {
    excel.read.mockResolvedValue([
      ["Category", "Item Name", "Price", "Currency", "Variants"],
      ["Mains", "Soup", "12,50", "EUR", "Large:2,50:400g"],
      ["Mains", "Salad", 5.75, "EUR", ""],
    ]);
    const [category] = await xlsxToPayload(new File([], "menu.xlsx"));
    expect(category.items.map((item: { price: number }) => item.price)).toEqual(
      [12.5, 5.75],
    );
    expect(category.items[0].options[0].choices[0]).toEqual({
      name: "Large",
      priceModifier: 2.5,
      weight: "400g",
    });
  });
  it("rejects a non-EUR Excel row before import", async () => {
    excel.read.mockResolvedValue([
      ["Category", "Item Name", "Price", "Currency"],
      ["Mains", "Soup", 10, "BGN"],
    ]);
    await expect(xlsxToPayload(new File([], "menu.xlsx"))).rejects.toThrow(
      "importExport.errors.eurOnly",
    );
  });
});

describe("menu import CSV parsing", () => {
  it("preserves decimal cents and emits canonical choice modifiers", () => {
    const categories = csvToPayload(
      'category,item_name,price,variants\nMains,Soup,"12,50 €","Large:2,50:400g"',
    );
    expect(categories[0].items[0].price).toBe(12.5);
    expect(categories[0].items[0].options[0].choices).toEqual([
      { name: "Large", priceModifier: 2.5, weight: "400g" },
    ]);
  });

  it.each(["garbage", "12,5,0", "-12.50", "1.234", "12 USD"])(
    "rejects invalid or ambiguous prices instead of silently changing them: %s",
    (price) => {
      expect(() =>
        csvToPayload(`category,item_name,price\nMains,Soup,"${price}"`),
      ).toThrow("importExport.errors.invalidPrice");
    },
  );

  it.each(["BGN", "USD"])("rejects non-EUR currency %s", (currency) => {
    expect(() =>
      csvToPayload(
        `category,item_name,price,currency\nMains,Soup,12,${currency}`,
      ),
    ).toThrow("importExport.errors.eurOnly");
  });
  it("parses CRLF, escaped quotes, commas, and multiline quoted fields", () => {
    const rows = parseCSVRows(
      'category,item_name,description\r\nStarters,"Soup, ""daily""","Line one\r\nLine two"\r\n',
    );

    expect(rows).toEqual([
      ["category", "item_name", "description"],
      ["Starters", 'Soup, "daily"', "Line one\r\nLine two"],
    ]);
  });

  it("preserves explicit false flags for EUR items", () => {
    const categories = csvToPayload(
      [
        "category,item_name,price,currency,is_available,is_featured",
        "Starters,Soup,12.5,EUR,true,false",
        "Mains,Stew,18,EUR,false,true",
      ].join("\n"),
    );

    expect(categories[0].items[0]).toEqual(
      expect.objectContaining({
        currency: "EUR",
        isOutOfStock: false,
        isFeatured: false,
      }),
    );
    expect(categories[1].items[0]).toEqual(
      expect.objectContaining({
        currency: "EUR",
        isOutOfStock: true,
        isFeatured: true,
      }),
    );
  });

  it("rejects malformed quoted data and missing required columns", () => {
    expect(() => parseCSVRows('category,item_name\nStarters,"Soup')).toThrow(
      "importExport.errors.csvUnclosedQuote",
    );
    expect(() => csvToPayload("name,price\nSoup,10")).toThrow(
      "importExport.errors.csvMissingColumns",
    );
  });

  it("parses variants into options with choices, prices, and weights", () => {
    const categories = csvToPayload(
      [
        "category,item_name,price,variants",
        "Pizzas,Margherita,10,Small:6.5:200g;Medium:10:350g;Large:14:500g",
      ].join("\n"),
    );

    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Pizzas");
    expect(categories[0].items[0].options).toEqual([
      {
        name: "Size / Variant",
        type: "VARIATION",
        choices: [
          { name: "Small", priceModifier: 6.5, weight: "200g" },
          { name: "Medium", priceModifier: 10, weight: "350g" },
          { name: "Large", priceModifier: 14, weight: "500g" },
        ],
      },
    ]);
  });

  it("classifies allergens and dietary tags from separate and combined columns", () => {
    const separateCols = csvToPayload(
      [
        "category,item_name,price,allergens,dietary_tags",
        "Salads,Greek Salad,7.5,dairy,vegetarian",
      ].join("\n"),
    );
    expect(separateCols[0].items[0].allergens).toContain("milk");
    expect(separateCols[0].items[0].dietaryTags).toContain("vegetarian");

    const combinedCols = csvToPayload(
      [
        "category,item_name,price,tags",
        'Desserts,Gluten Cake,5,"gluten,vegan"',
      ].join("\n"),
    );
    expect(combinedCols[0].items[0].allergens).toContain("gluten");
    expect(combinedCols[0].items[0].dietaryTags).toContain("vegan");
  });

  it("handles Cyrillic characters correctly for category, item names, and descriptions", () => {
    const categories = csvToPayload(
      [
        "category,item_name,price,description,currency",
        "Салати,Шопска салата,8.50,Домати краставици сирене,EUR",
      ].join("\n"),
    );

    expect(categories[0].name).toBe("Салати");
    expect(categories[0].items[0].name).toBe("Шопска салата");
    expect(categories[0].items[0].description).toBe("Домати краставици сирене");
    expect(categories[0].items[0].currency).toBe("EUR");
    expect(categories[0].items[0].price).toBe(8.5);
  });
});
