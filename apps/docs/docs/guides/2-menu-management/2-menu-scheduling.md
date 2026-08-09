---
id: menu-scheduling
title: Menu Scheduling (Dayparting)
sidebar_position: 2
---

# Menu Scheduling (Dayparting)

Menu scheduling allows you to automatically hide or show specific menu categories based on the time of day and the day of the week. This is perfect for offering a dedicated breakfast menu, a weekend brunch menu, or late-night drink specials.

## Setting Availability

Every category in your menu has an "Availability" setting with three options:
1. **Always Available**: The category is visible 24/7. This is the default.
2. **Hidden**: The category is manually hidden from the public menu (useful for seasonal menus you want to save for later).
3. **Scheduled**: The category only appears during specific times and days.

## How Scheduled Availability Works

When you set a category to "Scheduled", you define:
- **Days of the Week**: Select which days the category should appear (e.g., Saturday and Sunday for brunch).
- **Time Range**: Set a start time and an end time (e.g., 07:00 to 11:30).

### Timezone Accuracy
The scheduling system uses the precise IANA timezone you configured in your Restaurant Settings (e.g., `Europe/Sofia`). It does not rely on the customer's phone clock or the server's UTC time. This guarantees that your breakfast menu stops at exactly 11:30 AM local time, no matter what time it is for a tourist browsing your menu.

### Overnight Schedules
The system fully supports overnight ranges. For example, if you run a bar and want a "Late Night" category visible from 22:00 to 02:00, simply enter those times. The platform will automatically calculate the boundary across midnight and display the category correctly.
