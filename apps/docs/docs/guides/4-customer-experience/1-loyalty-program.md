---
id: loyalty-program
title: Loyalty Program
sidebar_position: 1
---

# Loyalty Program

The built-in Loyalty Program is a powerful retention engine designed to turn first-time visitors into regulars. It is a highly configurable, points-based system with VIP tiers and happy hours.

## How Customers Earn Points

Customers earn points on every order they place while logged in.
- **Earn Rate**: You configure the earn rate (e.g., 10 points per €1 spent). 
- **Sign-Up Bonus**: To encourage registration, customers receive a one-time sign-up bonus on their first order.

### VIP Tiers
You can configure tiers (e.g., Silver, Gold) based on the total points a customer has accumulated. Higher tiers grant point multipliers. For example, a Gold member might earn 1.5x points on every purchase.

### Happy Hour Multipliers
You can set up specific Happy Hours (e.g., Friday 4 PM - 6 PM) where all customers earn double points. The system is timezone-aware, meaning it accurately tracks happy hours according to your restaurant's local time, and even supports overnight ranges.

*Note: If a customer orders during a Happy Hour and they also have a VIP multiplier, the system applies the highest multiplier, not both.*

## How Customers Redeem Points

Customers can use their points directly during the checkout process. There are two ways to redeem:

1. **Free Items**: You can assign a specific "Points Price" to individual menu items (e.g., a free coffee for 300 points). Customers can toggle these items as "Free" in their cart if they have enough points.
2. **Cash Discount**: Customers can redeem points for a flat discount off their total bill (up to a maximum of 15% of the order total). You configure the redemption rate (e.g., 150 points = €1 discount).

## Point Expiry & Reminders
To encourage customers to return sooner, points expire after a configurable period (default: 90 days). The system uses strict FIFO (First-In, First-Out) accounting, meaning the oldest points are always consumed first during redemption.

When a customer's points are nearing expiration, the platform automatically sends them a friendly email reminder, prompting them to visit your restaurant and use their rewards.
