---
id: reservations
title: Table Reservations
sidebar_position: 2
---

# Table Reservations

*(Available on Professional and Enterprise plans)*

Renova includes an end-to-end table reservation system that lets guests book tables online 24/7, pick seating zones, declare dietary and accessibility needs, and receive automated SMS or email confirmations—all while your team manages availability and seating from a live calendar in your dashboard.

---

## What This Feature Does

- **Public Online Booking Page**: A mobile-friendly booking portal at `/book/[your-restaurant-slug]` accessible directly from your website, social media, or digital menu.
- **Real-Time Availability & Slot Capacity**: Prevent overbooking by defining maximum guest capacities and booking intervals (e.g., 15 or 30-minute arrival slots).
- **Seating Zone Preferences**: Allow guests to request specific seating areas (such as Terrace, Main Hall, or Window).
- **Guest Preferences & Allergen Disclosures**: Guests can state dietary requirements (Vegan, Gluten-Free, Nut Allergies) and accessibility requests (High Chairs, Wheelchair Access, Pet-Friendly).
- **Automated Notifications**: Send instant confirmation and reminder messages to guests via SMS or email.
- **Guest Self-Service Management**: Confirmation links allow guests to view, modify, or cancel their bookings independently without phoning the venue.
- **Interactive Staff Calendar**: Manage bookings in Day, Week, or Month views, with clear status badges (Pending, Confirmed, Seated, Completed, Declined).

---

## Who Can Use It

- **Owners, Managers, and Staff**: On Professional and Enterprise subscription tiers.

---

## The Guest Booking Workflow

1. The guest opens your booking page (`/book/[your-restaurant-slug]`) or taps **Book a Table** on your digital menu.
2. **Party Size**: The guest selects the number of adults and children.
3. **Preferred Seating Zone**: The guest selects their preferred area (e.g., *Indoor*, *Terrace*, or *No Preference*).
4. **Date & Time**: The guest picks a date from the calendar and selects an available arrival slot. Unavailable slots and blackout dates are automatically grayed out.
5. **Contact Information**: The guest provides their Full Name, Mobile Phone (with international country code flag selector), and Email address.
6. **Preferences & Notes**:
   - The guest checks any relevant dietary tags (e.g., *Gluten Intolerant*, *Nut Allergy*).
   - The guest checks accessibility needs (e.g., *High Chair*, *Wheelchair Access*).
   - The guest can type custom notes (such as celebrating a birthday or anniversary).
7. **Updates Preference**: The guest chooses whether to receive updates by **SMS** or **Email**.
8. The guest clicks **Request Reservation**.
9. The confirmation screen displays a unique **Booking Reference Number** and current status.

---

## How Staff Manage Reservations in the Dashboard

1. In the dashboard sidebar, click **Reservations**.
2. Choose your view:
   - **Day View**: Best for the host stand during active service to see party arrivals chronologically.
   - **Week / Month View**: Best for planning staffing and seeing upcoming high-volume days.
3. Managing booking statuses:
   - **Pending Requests**: Click on any pending reservation card and select **Confirm** or **Decline**. Confirming sends an instant confirmation SMS or email to the guest.
   - **When Guests Arrive**: Click **Seat** to mark the party as seated.
   - **When Dining is Finished**: Click **Complete** to clear the slot.
   - **Cancellations**: If a guest calls to cancel, click **Cancel Reservation**.

---

## How to Configure Reservation Rules

In the Reservations tab, click the **Settings** gear icon to set your venue's capacity rules:

- **Service Hours**: Define your lunch and dinner service windows.
- **Slot Interval**: Set arrival intervals (e.g., every 15, 30, or 60 minutes).
- **Dining Duration**: Set default table turnover time (e.g., 90 minutes for standard parties, 120 minutes for parties of 6 or more).
- **Booking Horizon**: Define how many days in advance guests can book (e.g., up to 30 days).
- **Minimum Notice**: Prevent last-minute walk-ins by requiring bookings to be made at least 1 or 2 hours in advance.
- **Blackout Dates**: Select specific calendar dates to block online reservations for private events, holidays, or maintenance days.

---

## Important Notes

- **Real-Time Sync**: If a host marks a table as seated on a door tablet, all manager and kitchen screens update immediately.
- **Guest Self-Service**: When guests cancel via their confirmation link, the slot is immediately reopened in your availability calendar for other diners.

---

## Tracking Notification Deliveries & SMS Quotas

In the **Reservations** dashboard, scroll below your calendar or open the notification section to inspect message delivery history and monthly allowances:

### Monthly SMS Usage
- **Quota Meter**: Displays your plan's included SMS message segments alongside how many segments your venue has used during the current calendar month.
- **Uninterrupted Operations**: SMS quotas are monitored for visibility and cost tracking; reservation confirmations are never blocked even if your venue exceeds its monthly included segment allowance.

### Delivery History & Statuses
Every confirmation and reminder sent to guests displays a color-coded status badge:
- **Queued / Sending** (Amber): The notification is prepared and scheduled for dispatch.
- **Provider Accepted / Sent** (Blue): The message has been handed off to the telecommunications network or email service provider.
- **Delivered** (Green): Confirmed delivery to the recipient's phone or email inbox.
- **Delayed** (Amber): Transient carrier delay; delivery will proceed automatically.
- **Failed / Bounced / Spam Complaint** (Red): The message could not reach the recipient (for example, due to an invalid phone number, unreachable cellular network, or inbox bounce).

### One-Click Notification Retry
If a notification displays a **Failed** or **Delayed** badge:
1. Click the **Retry** button directly on the delivery card.
2. Renova immediately re-queues the notification for delivery.
3. The delivery badge updates to reflect the new transmission attempt.

---

## If Something Goes Wrong

- **No Slots Available for a Specific Date**: Check whether the date is marked as a **Blackout Date** in settings or whether the maximum party capacity for that service window has been reached.
- **Guest Did Not Receive SMS Confirmation**: Check the **Delivery History** section in your Reservations dashboard to see if the message was delayed or bounced. If needed, click **Retry** to dispatch the confirmation again.
