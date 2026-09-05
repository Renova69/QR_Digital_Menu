---
id: print-station
title: Thermal Print Stations
sidebar_position: 2
---

# Thermal Print Stations

*(Available on the Enterprise plan)*

While Renova is a digital-first platform, many kitchens, expeditors, and service bars rely on physical paper tickets. Renova's **Print Station** subsystem connects your digital orders directly to physical thermal receipt printers, automatically printing tickets at the right station the instant an order is placed.

---

## What This Feature Does

- **Category-Based Print Routing**: Automatically direct food items to the kitchen line printer and beverages to the bar printer.
- **Automated Printing on Order Arrival**: Tickets print automatically as soon as an order is confirmed by a guest or submitted by waitstaff.
- **Customizable Receipt Layouts**: Add custom headers, venue details, and footer notes to your printed tickets.
- **Full Cyrillic & Latin Support**: Accurately prints dish titles in Bulgarian, English, Greek, Romanian, and other languages.
- **Print Job Status Tracking**: Monitor printer health and re-print tickets if a device runs out of paper.

---

## Who Can Use It

- **Owners and Managers**: On the Enterprise subscription tier can configure printers under **Settings > Printers**.

---

## How to Set Up a Thermal Print Station

1. In the dashboard sidebar, open **Settings** and click the **Printers** tab.
2. Click the **Add Print Station** button.
3. Configure the station:
   - **Station Name**: E.g., *"Kitchen Line Printer"* or *"Main Bar"*.
   - **Assigned Categories**: Select which menu categories should print at this station (for example, check *Appetizers* and *Mains* for the kitchen, and *Beer*, *Wine*, and *Cocktails* for the bar).
   - **Printer Connection**: Enter your local printer identifier or link your venue printing device.
4. **Receipt Customization**:
   - Customize header text (e.g., table number, date, time).
   - Add custom footer notes (e.g., "Order placed via QR").
5. Click **Test Print** to send a sample ticket to the printer and verify paper alignment and font legibility.
6. Click **Save Station**.

---

## How Automatic Printing Works During Service

1. A guest submits an order from their table QR code, or a waiter submits an order on the Waiter POS.
2. Renova instantly separates the dishes by category:
   - Food dishes print immediately on the **Kitchen Printer**.
   - Drink items print immediately on the **Bar Printer**.
3. Tickets print with bold table numbers, order timestamps, seat assignments, item options, and special preparation instructions in clear text.
4. In your dashboard, the print job status updates from **Printing** to **Completed**.

---

## Managing Printers & Troubleshooting Failed Prints

- **Reprinting a Ticket**: If a printer jammed or ran out of paper mid-print, open the order card in the **Orders** tab, click the options menu, and select **Reprint Ticket**.
- **Printer Status Overview**: Under **Settings > Printers**, view the live connection status of each registered print station.

---

## Important Notes

- **Network Requirements**: Thermal receipt printers must be connected to the same local venue network (via Ethernet or Wi-Fi) as your venue devices.
- **Standard 80mm & 58mm Paper**: Renova receipt templates format automatically for standard thermal paper roll widths.

---

## If Something Goes Wrong

- **Ticket Fails to Print**: Check that the printer has sufficient paper, the cover is closed securely, and the power light is steady.
- **Items Printed at the Wrong Station**: Open **Settings > Printers**, select the station, and review the category checkboxes to ensure dishes are assigned to the correct printer.
