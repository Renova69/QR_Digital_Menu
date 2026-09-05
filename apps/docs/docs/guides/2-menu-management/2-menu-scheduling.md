---
id: menu-scheduling
title: Menu Scheduling & Dayparting
sidebar_position: 2
---

# Menu Scheduling & Dayparting

*(Available on Professional and Enterprise plans)*

Menu scheduling (also called dayparting) allows you to automatically control when specific menu categories appear on your public digital menu based on the time of day and the day of the week. This eliminates the need to manually hide or unhide breakfast menus, lunch specials, or late-night drink lists.

---

## What This Feature Does

- **Automated Menu Transitions**: Breakfast menus automatically switch off at 11:30 AM, lunch specials appear only from 12:00 PM to 3:00 PM, and late-night menus activate in the evening.
- **Day-of-Week Targeting**: Configure weekend-only brunch menus or weekday-only business lunches.
- **Overnight Schedule Handling**: Seamlessly support bar and nightlife schedules that span across midnight (such as 10:00 PM to 3:00 AM).
- **Timezone Accurate**: Uses your restaurant's configured local timezone rather than the guest's device clock, preventing tourists from seeing out-of-schedule menus.

---

## Who Can Use It

- **Owners and Managers**: On Professional and Enterprise subscription tiers.
- Venues on Free or Starter plans will see an upgrade option when selecting the Scheduled availability mode.

---

## Availability Modes

Each category in your menu has one of three availability settings:

1. **Always Available** *(Default)*: The category is visible 24 hours a day, 7 days a week.
2. **Hidden**: The category is saved in your dashboard but completely hidden from guests. Ideal for seasonal menus or upcoming dishes in draft.
3. **Scheduled**: The category is visible only during specific hours and days that you define.

---

## How to Set Up Category Scheduling

1. In the top navigation bar, click **Edit Menu**.
2. Under the **Items** tab, locate the category you wish to schedule and click its **Edit** (pencil) icon.
3. In the category dialog, find the **Availability** section and select **Scheduled**.
4. Configure your schedule:
   - **Active Days**: Check the days of the week when this category should appear (e.g., check **Saturday** and **Sunday** for a weekend brunch menu).
   - **Start Time**: Set the time when the category should become visible (e.g., `08:00`).
   - **End Time**: Set the time when the category should be hidden (e.g., `11:30`).
5. Click **Save Category**.

---

## Overnight Schedules for Bars & Late-Night Venues

If you run a late-night lounge or bar and want a category visible across midnight (for example, from 21:00 to 02:00):

1. Set the **Start Time** to `21:00`.
2. Set the **End Time** to `02:00`.
3. Check the days when this night schedule starts.
4. Renova automatically detects that the end time falls on the following morning and keeps the category visible across midnight.

---

## Managing Existing Schedules

- **Change Hours**: Click the edit icon on the category, update the start or end times, and click **Save Category**.
- **Temporarily Hide**: Switch the availability mode to **Hidden** to immediately remove the category without deleting its scheduled hours.
- **Revert to Full-Time**: Switch the availability mode back to **Always Available** and click **Save Category**.

---

## Important Notes

- **Timezone Dependency**: Scheduling relies on the timezone configured in **Settings > General**. Verify that your local city or region is selected so your schedules switch at the correct hour.
- **Guest In-Progress Carts**: If a guest adds an item to their cart before the scheduled end time, they can still complete their checkout even if the clock passes the cutoff while they are entering their payment details.

---

## If Something Goes Wrong

- **Category Visible at the Wrong Time**: Open **Settings > General** and confirm your venue's **Timezone** matches your physical location.
- **Category Not Visible During Scheduled Hours**: Ensure that at least one item inside the category is marked as **Available**, and verify that the current day of the week is checked in the category's active days list.
