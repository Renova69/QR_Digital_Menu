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
});
