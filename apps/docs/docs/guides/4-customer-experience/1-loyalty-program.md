---
id: loyalty-program
title: Loyalty & VIP Rewards Program
sidebar_position: 1
---

# Loyalty & VIP Rewards Program

*(Available on Professional and Enterprise plans)*

Renova includes a fully automated, points-based loyalty and VIP rewards program designed to turn first-time visitors into repeat regulars. Guests earn points on every purchase, unlock VIP tier multipliers, enjoy happy hour bonuses, and redeem points for free items or direct bill discounts.

---

## What This Feature Does

- **Automatic Point Accrual**: Guests earn points on every order placed while signed in with their email or Google account.
- **Configurable Earning & Redemption Rates**: You decide how many points guests earn per €1 spent and how many points are needed to unlock €1 of discount.
- **VIP Tiers & Multipliers**: Automatically elevate your most loyal customers to Silver, Gold, or Platinum tiers with 1.2x, 1.5x, or 2.0x earning multipliers.
- **Timezone-Aware Happy Hours**: Boost slow periods by configuring double-point hours (such as Tuesdays 16:00 to 18:00).
- **Flexible Redemption at Checkout**: Guests can redeem points for a direct percentage discount off their total bill, or unlock designated free dishes (such as a complimentary dessert or craft coffee).
- **Point Expiration with Automatic Reminders**: Keep guests returning by expiring points after a set timeframe (e.g., 90 days), with automatic reminder emails sent before points lapse.

---

## Who Can Use It

- **Owners and Managers**: On Professional and Enterprise plans can configure rules in **Settings > Loyalty**.
- **Guests**: Can create an account in seconds via the public menu using email verification or Google Sign-In.

---

## Understanding Earning & Redemption Rates

The loyalty program is governed by two clear ratios:

1. **Earn Rate (Points per €1 Spent)**: Default is `10 points`. On a €20 meal, the guest earns 200 points.
2. **Redeem Rate (Points per €1 Discount)**: Default is `150 points`. A guest with 300 points can redeem them for a €2.00 discount on their bill.

:::tip Effective Cashback Calculation
The effective reward percentage is `Earn Rate ÷ Redeem Rate × 100`. With the defaults (10 ÷ 150), your customers receive approximately 6.7% back in rewards. Renova's settings screen calculates this live and warns you if the reward rate exceeds 15%.
:::

---

## How to Set Up Your Loyalty Program

1. In the dashboard sidebar, open **Settings** and click the **Loyalty** tab.
2. Check the box to **Enable Loyalty Program**.
3. Configure the core parameters:
   - **Points Earned per €1**: Set your baseline reward rate (e.g., `10`).
   - **Points for €1 Discount**: Set your redemption requirement (e.g., `150`).
   - **Welcome Sign-Up Bonus**: Enter a one-time point award given to new members upon their first order (e.g., `100 points`).
   - **Point Expiration (Days)**: Set how long points remain valid before expiring (e.g., `90 days`, or leave blank for no expiration).
4. Configure **VIP Tiers**:
   - **Silver Tier**: E.g., at 500 lifetime points, grant a 1.2x point multiplier.
   - **Gold Tier**: E.g., at 2,000 lifetime points, grant a 1.5x point multiplier.
5. Configure **Happy Hours** *(Optional)*:
   - Select the day of the week, start time, end time, and multiplier (e.g., Friday 17:00 to 19:00 with 2.0x points).
6. Click **Save Changes**.

---

## How Guests Earn and Redeem Rewards

### Earning Points
1. When checking out on the digital menu, the guest signs in by entering their email address or clicking **Sign in with Google**.
2. The checkout drawer displays the points they will earn for the current order, including any active VIP or happy hour multipliers.
3. Upon order completion, points are credited instantly to their account.

### Redeeming for Bill Discounts
1. In the guest checkout drawer, a logged-in member with points will see the **Redeem Points** option.
2. They toggle the reward switch to apply their available points.
3. Renova applies the cash discount to the order total (capped at a maximum of 15% of the bill to protect your margins).

### Redeeming for Free Dishes
1. In the Menu Editor, you can set a specific **Points Price** on individual items (e.g., 250 points for an Espresso).
2. When an eligible guest adds that dish to their cart, a toggle allows them to claim the item as **Free with Points**.

---

## Managing Customer Points and Inquiries

- **Customer Profile View**: Guests can view their points balance, active VIP tier, and upcoming expiring point batches anytime by visiting their **Profile** page (`/profile`).
- **First-In, First-Out (FIFO) Expiry**: Renova automatically consumes the oldest points first during redemption, ensuring fair treatment for returning guests.

---

## Important Notes

- **Multiplier Strategy**: If an order takes place during an active Happy Hour (e.g., 2.0x) and the guest also has a Gold VIP multiplier (e.g., 1.5x), Renova applies the higher multiplier (2.0x) rather than multiplying them together.
- **Dual Currency Balance**: Point values and rewards calculate against your restaurant's base currency and display accurately in dual currency.

---

## If Something Goes Wrong

- **Guest Did Not Receive Points**: Ensure the guest was signed in with their email or Google account before tapping **Place Order**. Orders placed anonymously cannot retroactively earn points.
- **Points Balance Appears Lower Than Expected**: Check whether older points reached their expiration date. Points expiring within the current week are summarized in the guest's profile.
