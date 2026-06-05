const Stripe = require('stripe');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function fixPortal() {
  try {
    const configs = await stripe.billingPortal.configurations.list({
      is_default: true,
      limit: 1,
    });

    if (configs.data.length === 0) {
      console.log('No default portal configuration found.');
      return;
    }

    const config = configs.data[0];
    console.log('Found default config:', config.id);

    const updated = await stripe.billingPortal.configurations.update(config.id, {
      features: {
        subscription_update: {
          default_allowed_updates: ['price'],
          products: config.features.subscription_update.products,
          proration_behavior: 'always_invoice',
        },
      },
    });

    console.log('Successfully updated Customer Portal to ALWAYS INVOICE immediately!');
    console.log('Proration behavior is now:', updated.features.subscription_update.proration_behavior);
  } catch (e) {
    console.error('Error:', e);
  }
}

fixPortal();
