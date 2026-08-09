---
id: import-export
title: Menu Import & Export
sidebar_position: 3
---

# Menu Import & Export

Managing a large menu manually can be time-consuming. The dashboard provides a combined **Import/Export** tab that allows you to manage your menu in bulk using standard file formats.

## Exporting Your Menu

You can export your current menu data to safely back it up or edit it offline. 
- **Download JSON**: Generates a raw data file suitable for backups and re-imports.
- **Download XLSX**: Generates a multi-sheet Excel workbook. This is the recommended format if you want to edit your menu data, prices, and translations using spreadsheet software.
- **Download CSV**: Generates a standard CSV file (using European locale formatting with semicolon delimiters) for easy import into accounting or inventory software.

## Importing Your Menu

You can bulk-create or update your menu by importing a file. The platform supports both `.json` and `.xlsx` formats.

### Excel Roundtrip (XLSX)
The easiest way to manage a large menu is the Excel roundtrip:
1. Go to the Export tab and click **Download XLSX**.
2. Open the file in Excel, add new items, update prices, or tweak descriptions.
3. Go to the Import tab and upload the modified XLSX file.
4. The system will preview the changes. Once confirmed, your menu is instantly updated.

### Automated Translations
If your imported file lacks translations for certain languages, the platform's DeepL integration will automatically detect the missing languages and translate the new items for you during the import process. 

### JSON & OCR Imports
If you are transitioning from another system or using Optical Character Recognition (OCR) tools to digitize a paper menu, you can upload the resulting JSON file directly. The import pipeline handles DTO validation and gracefully passes any pre-translated content into the database without requiring re-translation.
