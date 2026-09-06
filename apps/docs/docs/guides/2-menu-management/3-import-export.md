---
id: import-export
title: Menu Import & Export
sidebar_position: 3
---

# Menu Import & Export

The **Import/Export** tool allows you to back up your menu data and perform bulk updates using familiar spreadsheet software like Microsoft Excel or Google Sheets, saving you hours when rolling out seasonal menus or adjusting pricing across many items.

---

## What This Feature Does

- **Full Menu Backups**: Export your entire catalog of categories, items, prices, descriptions, options, and translations at any time.
- **Excel Spreadsheet Roundtrip**: Download a pre-formatted multi-sheet Excel (`.xlsx`) workbook, make your adjustments offline, and upload it back to Renova to apply your changes in bulk.
- **Multiple Export Formats**: Choose between Excel (`.xlsx`), JSON data files, or standard CSV files with European locale formatting.
- **Pre-Import Verification**: View a preview table of your imported dishes before confirming changes to avoid accidental overwrites.

---

## Who Can Use It

- **Owners and Managers**: Available on all subscription plans, including the Free plan.

---

## How to Export Your Menu

1. Click **Edit Menu** in the top navigation bar.
2. Select the **Import/Export** tab.
3. Choose your preferred export format under the **Export** section:
   - **Download XLSX** *(Recommended)*: Downloads a multi-sheet Excel file with separate sheets for categories, items, and custom options. Use this for spreadsheet editing.
   - **Download JSON**: Downloads a complete data file suitable for backups or transferring your menu to another venue.
   - **Download CSV**: Generates a standard spreadsheet file formatted with semicolon delimiters for accounting or inventory software.
   - **Copy JSON**: Copies your raw menu data directly to your device clipboard.
4. The file downloads immediately to your computer.

---

## The Excel Roundtrip Workflow (Bulk Editing in Excel)

The most efficient way to overhaul prices or add dozens of dishes at once is the Excel roundtrip:

1. In the Menu Editor under **Import/Export**, click **Download XLSX**.
2. Open the file in Microsoft Excel, Apple Numbers, or Google Sheets.
3. Edit your items:
   - Change prices in the price column.
   - Update descriptions or item titles.
   - Add new rows to create new dishes under an existing category.
4. Save the file in `.xlsx` format.
5. In your Renova dashboard, switch to the **Import** tab.
6. Drag and drop your saved `.xlsx` file into the upload zone, or click **Browse File** to select it.
7. Renova will parse the spreadsheet and display a **Preview Table** summarizing the categories, items, and prices found in your file.
8. Verify the preview, then click **Confirm Import**.
9. Your menu updates immediately across your dashboard and live digital menu.

---

## Important Notes

- **Preserve Column Headers**: When editing in Excel, do not rename, reorder, or delete the column header row at the top of each sheet. Renova relies on these exact headers to match each field.
- **Price Formatting**: Prices must be in EUR. Decimal points and decimal commas are accepted (for example, `12.50` or `12,50`). In comma-delimited CSV files, quote prices that contain a comma. Malformed or ambiguous price strings are rejected before import.
- **Automatic Translations**: If you add new items in your spreadsheet without translations, Renova's translation system will automatically generate translations in the background for your configured target languages.

---

## If Something Goes Wrong

- **File Rejected on Upload**: Verify that your file ends with `.xlsx` or `.json`. Standard `.xls` (older Excel format) or `.doc` files are not supported.
- **Invalid Rows in Preview**: If an item shows a warning in the preview table, check that the item has a valid name and that the price is a positive number.
