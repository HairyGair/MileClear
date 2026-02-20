import Stripe from "stripe";

let stripe: Stripe | null = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-01-28.clover",
  });
} else {
  console.warn("STRIPE_SECRET_KEY not set — billing features disabled");
}

export { stripe };
