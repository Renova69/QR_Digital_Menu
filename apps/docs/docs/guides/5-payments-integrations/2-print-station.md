---
id: print-station
title: Print Station Integration
sidebar_position: 2
---

# Print Station Integration

*(Available on PROFESSIONAL and ENTERPRISE tiers)*

While the platform is digital-first, many kitchens and bars still rely on physical paper tickets. The **Print Station** subsystem bridges this gap, allowing you to automatically print thermal receipts when orders arrive.

## How it Works
The platform communicates with an Android-based Print Emulator app (`escpresso`) running on your local network. 

1. **Station Assignment**: In the dashboard, you can define different Print Stations (e.g., "Kitchen Printer", "Bar Printer").
2. **Category Routing**: You can route specific menu categories to specific printers. For example, all items in the "Cocktails" category will print only at the Bar Printer, while "Mains" will print at the Kitchen Printer.
3. **Authentication**: Each printer connects securely to the platform using a unique `PrintAgentToken`.

## Receipt Customization
The system generates ESC/POS tickets (the industry standard for thermal receipt printers). 
- It fully supports Cyrillic characters (crucial for Bulgarian/Russian menus).
- You can customize the receipt template per station, adjusting the header, footer, and font sizes to suit your kitchen's preferences.

## Reliability
If a printer runs out of paper or loses its connection, the platform tracks the `PrintJob` status. It distinguishes between `PENDING`, `PRINTING`, `COMPLETED`, and `FAILED` states, ensuring no ticket is ever silently lost. You can monitor the status of all printers directly from the **Print Stations** view in the dashboard.
