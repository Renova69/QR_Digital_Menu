import writeXlsxFile from 'write-excel-file/browser';
import type { TFunction } from 'i18next';
import { BGN_RATE } from './currency';

export interface MenuExportCategory {
  id: string;
  name: string;
  sort_order?: number | null;
  isAvailable?: boolean;
  items: Array<{
    name: string;
    description?: string | null;
    price?: number | null;
    weight?: string | null;
    currency?: string | null;
    isAvailable?: boolean;
    allergens?: string[];
    dietaryTags?: string[];
    options?: Array<{
      name: string;
      choices: Array<{ name: string; priceModifier: number }>;
    }>;
  }>;
}

export interface MenuExportData {
  restaurantId: string;
  categories: MenuExportCategory[];
}

interface Cell {
  value?: boolean | number | string | Date | null;
  type?: typeof Number | typeof String | typeof Boolean | typeof Date;
  format?: string;
  fontWeight?: 'bold';
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
}

const HEADER_BG = '#4f46e5';
const HEADER_FG = '#ffffff';
const EUR_FORMAT = '"EUR "#,##0.00';
const BGN_FORMAT = '#,##0.00" BGN"';

function h(value: string): Cell {
  return { value, fontWeight: 'bold', backgroundColor: HEADER_BG, textColor: HEADER_FG };
}

function eur(value: number): Cell {
  return { value, type: Number, format: EUR_FORMAT };
}

function bgn(eurValue: number): Cell {
  return { value: eurValue * BGN_RATE, type: Number, format: BGN_FORMAT };
}

// Excel / Google Sheets interpret a cell whose text starts with = + - @ (or a
// leading tab/CR) as a formula. An attacker who set a menu name to
// `=cmd|'/C calc'!A0` could trigger code execution when the owner opens the
// export. Prefixing with an apostrophe forces literal-text rendering (#29).
function sanitizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function text(value?: string | number | null): Cell {
  return { value: value == null ? '' : sanitizeFormula(String(value)) };
}

function int(value: number): Cell {
  return { value, type: Number };
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function downloadMenuExport(
  data: MenuExportData,
  t: TFunction,
  restaurantName?: string,
): Promise<void> {
  const ex = (key: string, fallback: string) =>
    t(`menu.export.${key}`, { defaultValue: fallback });

  const slug = toSlug(restaurantName || data.restaurantId.slice(0, 8));
  const fileName = `menu-export-${slug}-${fmtDate(new Date())}.xlsx`;

  // Sheet 1 — Categories
  const categoriesSheet: Cell[][] = [
    [
      h(ex('colSortOrder', 'Sort Order')),
      h(ex('colCategoryName', 'Category Name')),
      h(ex('colItemCount', 'Items')),
      h(ex('colAvailable', 'Available')),
    ],
    ...data.categories.map((cat, index) => [
      int(cat.sort_order ?? index + 1),
      text(cat.name),
      int(cat.items?.length ?? 0),
      text(cat.isAvailable !== false ? '✓' : '✗'),
    ]),
  ];

  // Sheet 2 — Items
  const itemsSheet: Cell[][] = [
    [
      h(ex('colCategory', 'Category')),
      h(ex('colItemName', 'Item Name')),
      h(ex('colDescription', 'Description')),
      h(ex('colPriceEur', 'Price EUR')),
      h(ex('colPriceBgn', 'Price BGN')),
      h(ex('colWeight', 'Weight')),
      h(ex('colAllergens', 'Allergens')),
      h(ex('colDietaryTags', 'Dietary Tags')),
      h(ex('colAvailable', 'Available')),
    ],
  ];

  for (const cat of data.categories) {
    for (const item of cat.items ?? []) {
      const price = item.price ?? 0;
      itemsSheet.push([
        text(cat.name),
        text(item.name),
        text(item.description),
        eur(price),
        bgn(price),
        text(item.weight),
        text((item.allergens ?? []).join(', ')),
        text((item.dietaryTags ?? []).join(', ')),
        text(item.isAvailable !== false ? '✓' : '✗'),
      ]);
    }
  }

  if (itemsSheet.length === 1) {
    itemsSheet.push([text(ex('noData', 'No items')), ...Array(8).fill({ value: null })]);
  }

  // Sheet 3 — Options & Choices
  const optionsSheet: Cell[][] = [
    [
      h(ex('colCategory', 'Category')),
      h(ex('colItemName', 'Item Name')),
      h(ex('colOption', 'Option')),
      h(ex('colChoice', 'Choice')),
      h(ex('colModifierEur', 'Modifier EUR')),
      h(ex('colModifierBgn', 'Modifier BGN')),
    ],
  ];

  for (const cat of data.categories) {
    for (const item of cat.items ?? []) {
      for (const option of item.options ?? []) {
        for (const choice of option.choices ?? []) {
          const mod = choice.priceModifier ?? 0;
          optionsSheet.push([
            text(cat.name),
            text(item.name),
            text(option.name),
            text(choice.name),
            eur(mod),
            bgn(mod),
          ]);
        }
      }
    }
  }

  if (optionsSheet.length === 1) {
    optionsSheet.push([text(ex('noData', 'No options')), ...Array(5).fill({ value: null })]);
  }

  const sheets = [
    {
      sheet: ex('sheetCategories', 'Categories'),
      columns: [{ width: 8 }, { width: 28 }, { width: 12 }, { width: 12 }],
      data: categoriesSheet as any,
    },
    {
      sheet: ex('sheetItems', 'Items'),
      columns: [
        { width: 22 },
        { width: 30 },
        { width: 50 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 26 },
        { width: 26 },
        { width: 12 },
      ],
      data: itemsSheet as any,
    },
    {
      sheet: ex('sheetOptions', 'Options & Choices'),
      columns: [
        { width: 22 },
        { width: 28 },
        { width: 24 },
        { width: 26 },
        { width: 14 },
        { width: 14 },
      ],
      data: optionsSheet as any,
    },
  ];

  await writeXlsxFile(sheets).toFile(fileName);
}
