import Stripe from "stripe";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";

function getPeriodEnd(sub: Stripe.Subscription): number {
  return sub.items.data[0]?.current_period_end ?? 0;
}

export async function billingRoutes(app: FastifyInstance) {
  const API_BASE_URL =
    process.env.API_BASE_URL || "https://api.mileclear.com";

  // Override content type parser in this scope to capture raw body for webhook verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // --- Success / Cancel redirect pages ---

  app.get("/success", async (_request, reply) => {
    reply.type("text/html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MileClear Pro</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;background:#030712;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.card{max-width:400px;padding:40px}.check{font-size:64px;margin-bottom:16px}h1{color:#f59e0b;margin-bottom:8px}p{color:#9ca3af;line-height:1.6}
.btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#f59e0b;color:#030712;font-weight:700;border-radius:10px;text-decoration:none}</style></head>
<body><div class="card"><div class="check">&#10003;</div><h1>Welcome to MileClear Pro!</h1>
<p>Your subscription is active.</p>
<a class="btn" href="mileclear://billing/success">Return to App</a>
<script>setTimeout(function(){window.location.href="mileclear://billing/success"},1500)</script>
</div></body></html>`);
  });

  app.get("/cancel", async (_request, reply) => {
    reply.type("text/html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MileClear</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;background:#030712;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.card{max-width:400px;padding:40px}h1{margin-bottom:8px}p{color:#9ca3af;line-height:1.6}
.btn{display:inline-block;margin-top:20px;padding:12px 24px;background:#374151;color:#fff;font-weight:600;border-radius:10px;text-decoration:none}</style></head>
<body><div class="card"><h1>Checkout Cancelled</h1>
<p>No charges were made.</p>
<a class="btn" href="mileclear://billing/cancel">Return to App</a>
<script>setTimeout(function(){window.location.href="mileclear://billing/cancel"},1500)</script>
</div></body></html>`);
  });

  // --- Webhook (no auth — verified by Stripe signature) ---

  app.post("/webhook", async (request, reply) => {
    if (!stripe) {
      return reply.status(503).send({ error: "Billing not configured" });
    }

    const sig = request.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return reply.status(400).send({ error: "Missing signature or webhook secret" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        webhookSecret
      );
    } catch (err) {
      app.log.error({ err }, "Webhook signature verification failed");
      return reply.status(400).send({ error: "Invalid signature" });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (!userId) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        if (!subscriptionId || !customerId) break;

        // Fetch subscription to get period end
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await prisma.user.update({
          where: { id: userId },
          data: {
            isPremium: true,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            premiumExpiresAt: new Date(getPeriodEnd(sub) * 1000),
          },
        });

        app.log.info(`User ${userId} upgraded to premium`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (!customerId) break;

        const subRef =
          invoice.parent?.type === "subscription_details"
            ? invoice.parent.subscription_details?.subscription
            : null;
        const subscriptionId =
          typeof subRef === "string" ? subRef : subRef?.id;

        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            isPremium: true,
            premiumExpiresAt: new Date(getPeriodEnd(sub) * 1000),
          },
        });

        app.log.info(`Renewed premium for customer ${customerId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId =
          typeof sub.customer === "string"
            ? sub.customer
            : sub.customer?.id;

        if (!customerId) break;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            isPremium: false,
            stripeSubscriptionId: null,
          },
        });

        app.log.info(`Premium cancelled for customer ${customerId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        app.log.warn(`Payment failed for customer ${customerId}`);
        // Don't revoke premium — Stripe retries automatically
        break;
      }
    }

    return reply.send({ received: true });
  });

  // --- Status (auth required) ---

  app.get(
    "/status",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!stripe) {
        return reply.send({
          data: {
            isPremium: false,
            premiumExpiresAt: null,
            subscriptionStatus: "none",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
          },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: {
          isPremium: true,
          premiumExpiresAt: true,
          stripeSubscriptionId: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      let subscriptionStatus: "active" | "canceled" | "past_due" | "none" =
        "none";
      let cancelAtPeriodEnd = false;
      let currentPeriodEnd: string | null = null;

      if (user.stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            user.stripeSubscriptionId
          );
          subscriptionStatus = sub.status as typeof subscriptionStatus;
          cancelAtPeriodEnd = sub.cancel_at_period_end;
          currentPeriodEnd = new Date(
            getPeriodEnd(sub) * 1000
          ).toISOString();
        } catch {
          // Subscription may have been deleted on Stripe side
          subscriptionStatus = "none";
        }
      }

      return reply.send({
        data: {
          isPremium: user.isPremium,
          premiumExpiresAt: user.premiumExpiresAt?.toISOString() ?? null,
          subscriptionStatus,
          cancelAtPeriodEnd,
          currentPeriodEnd,
        },
      });
    }
  );

  // --- Checkout (auth required) ---

  app.post(
    "/checkout",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!stripe) {
        return reply.status(503).send({ error: "Billing not configured" });
      }

      const priceId = process.env.STRIPE_PRICE_ID;
      if (!priceId) {
        return reply.status(503).send({ error: "Price not configured" });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: {
          id: true,
          email: true,
          isPremium: true,
          stripeCustomerId: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (user.isPremium) {
        return reply.status(400).send({ error: "Already subscribed to Pro" });
      }

      // Create or reuse Stripe Customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: user.id,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${API_BASE_URL}/billing/success`,
        cancel_url: `${API_BASE_URL}/billing/cancel`,
      });

      return reply.send({ data: { url: session.url } });
    }
  );

  // --- Cancel subscription (auth required) ---

  app.post(
    "/cancel",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!stripe) {
        return reply.status(503).send({ error: "Billing not configured" });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { stripeSubscriptionId: true },
      });

      if (!user?.stripeSubscriptionId) {
        return reply.status(400).send({ error: "No active subscription" });
      }

      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      return reply.send({
        data: { message: "Subscription will cancel at end of billing period" },
      });
    }
  );
}
