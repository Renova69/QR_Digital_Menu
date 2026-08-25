import { csvToPayload, parseCSVRows } from "./MenuImportExportView";

describe("menu import CSV parsing", () => {
  it("parses CRLF, escaped quotes, commas, and multiline quoted fields", () => {
    const rows = parseCSVRows(
      'category,item_name,description\r\nStarters,"Soup, ""daily""","Line one\r\nLine two"\r\n',
    );

    expect(rows).toEqual([
      ["category", "item_name", "description"],
      ["Starters", 'Soup, "daily"', "Line one\r\nLine two"],
    ]);
  });

  it("preserves explicit false flags and each row's currency", () => {
    const categories = csvToPayload(
      [
        "category,item_name,price,currency,is_available,is_featured",
        "Starters,Soup,12.5,EUR,true,false",
        "Mains,Stew,18,BGN,false,true",
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
        currency: "BGN",
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
          { name: "Small", price: 6.5, weight: "200g" },
          { name: "Medium", price: 10, weight: "350g" },
          { name: "Large", price: 14, weight: "500g" },
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
        "Салати,Шопска салата,8.50,Домати краставици сирене,BGN",
      ].join("\n"),
    );

    expect(categories[0].name).toBe("Салати");
    expect(categories[0].items[0].name).toBe("Шопска салата");
    expect(categories[0].items[0].description).toBe("Домати краставици сирене");
    expect(categories[0].items[0].currency).toBe("BGN");
    expect(categories[0].items[0].price).toBe(8.5);
  });
});
