# Go-Live Checklist for Stripe Billing

Before switching your application from "Test Mode" to "Live Mode", you must perform the following steps to ensure billing works correctly in production:

## 1. Create Live Stripe Products
- Flip the toggle in the top-right of the Stripe Dashboard from **Test mode** to **Live mode**.
- Re-create your three products: **QR Menu Starter**, **QR Menu Professional**, and **QR Menu Enterprise**.
- Add Monthly and Yearly prices for each product.

## 2. Update Google Secret Manager
- Copy the newly generated "Live" Price IDs (they will start with `price_...` but will NOT contain the word `test`).
- Open your Google Cloud Console and navigate to **Secret Manager**.
- Create new versions for all 6 Stripe Price secrets (`STRIPE_PRICE_STARTER_MONTHLY`, etc.) and paste the live Price IDs.
- Create a new version for `STRIPE_SECRET_KEY` and paste your live secret key (`sk_live_...`).
- Create a new version for `STRIPE_WEBHOOK_SECRET` and paste your live webhook signing secret (`whsec_...`).

## 3. Configure the Live Customer Portal
- In the Live Stripe Dashboard, go to **Settings > Customer portal**.
- Under the Subscriptions section, turn on **"Customers can switch plans"**.
- Add the three live products (Starter, Pro, Enterprise) to the allowed list.
- Select the **"Prorate charges and credits"** radio button.
- Save changes.

## 4. Run the API Proration Fix Script
*By default, Stripe defers proration charges. You must run this script to force immediate payment on upgrades.*
- In your local development environment, open `apps/backend/.env`.
- Temporarily replace your `STRIPE_SECRET_KEY` with your **Live Secret Key** (`sk_live_...`).
- Open a terminal, navigate to `apps/backend`, and run:
  ```bash
  node fix-portal.js
  ```
- You should see a success message saying the portal was updated to `always_invoice`.
- *Optional: Revert your `.env` file back to your test key so you don't accidentally run test code against production.*

## 5. Deploy Cloud Run
- Deploy your backend to Google Cloud Run so it pulls the latest secret versions from Secret Manager.
- Your billing is now completely live!
