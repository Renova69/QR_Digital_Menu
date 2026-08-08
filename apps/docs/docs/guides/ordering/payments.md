---
title: Guest Payments
sidebar_label: Payments
sidebar_position: 3
---

# Guest Payments

Available payment methods depend on the restaurant's enabled provider, currency, region, browser, and subscription features.

Renova supports configured online-provider flows and a staff-confirmed cash flow. Stripe uses automatic payment methods, so the card and wallet options presented to a guest are determined by Stripe for that payment. Other configured providers may use their own hosted checkout.

## Before Accepting Payments

1. Configure and verify the payment provider in restaurant settings.
2. Test a complete payment using the provider's test environment where available.
3. Confirm that successful payments create the expected order and appear in the payment dashboard.
4. Test failed, cancelled, delayed, and cash-confirmation paths.

Payout timing and supported methods are controlled by the selected payment provider and merchant account.
