// Voluntary donation flow — one-off Stripe Checkout, public (no auth).
// Lives outside /billing because conceptually it's a thank-you, not a
// purchase: no goods or services exchanged, no impact on user account
// state. Donors are NOT tracked against user records (one of the
// reasons it's keep-it-simple anonymous Checkout).
//
// VAT: voluntary contributions with no service in return are outside
// the scope of VAT. The Checkout product is created without VAT lines.
//
// Tax classification (for Anthony's bookkeeping): this is business
// income — declare as such on Self Assessment. NOT a tax-deductible
// donation for the donor since MileClear is not a registered charity.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stripe } from "../../lib/stripe.js";
import { logEvent } from "../../services/appEvents.js";

const PRESET_AMOUNTS_PENCE = [300, 500, 1000, 2000] as const;
const MIN_DONATION_PENCE = 100;        // £1 floor — anything smaller is mostly Stripe fees
const MAX_DONATION_PENCE = 100_000;     // £1000 ceiling — fraud-prevention sanity cap

const checkoutSchema = z.object({
  /** Donation amount in pence. Either one of the preset amounts or a
   *  custom value within [MIN, MAX]. */
  amountPence: z.number().int().min(MIN_DONATION_PENCE).max(MAX_DONATION_PENCE),
  /** Optional donor display name shown on the thank-you page only —
   *  not stored, not visible to other users. */
  name: z.string().max(80).optional(),
});

export async function donationRoutes(app: FastifyInstance) {
  // Public — no auth. Anyone can donate including signed-out visitors.
  // (Auth would be a nice-to-have for a "your donations" history page,
  // but adds complexity for zero user-facing benefit.)

  // POST /donations/checkout-session
  // Body: { amountPence, name? }
  // Returns: { url } — Stripe Checkout URL the browser redirects to
  app.post("/checkout-session", async (request, reply) => {
    if (!stripe) {
      return reply.status(503).send({
        error: "Donations aren't available right now. Try again later.",
      });
    }
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { amountPence, name } = parsed.data;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              product_data: {
                name: "MileClear voluntary contribution",
                description:
                  "Supports continued development. Not a payment for goods or services.",
              },
              unit_amount: amountPence,
            },
          },
        ],
        // Anchored at our domain regardless of where the request came
        // from — prevents an open-redirect amplifier via the success URL.
        success_url: "https://mileclear.com/donate/thank-you?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://mileclear.com/donate",
        // Public-facing surfaces; not visible to anyone but the donor.
        metadata: {
          kind: "donation",
          ...(name ? { donorName: name } : {}),
        },
        // Don't push donors into our subscriber list; no goods
        // delivered means no shipping/billing collection.
        billing_address_collection: "auto",
      });

      logEvent("donation.checkout_created", null, { amountPence });

      return reply.send({ data: { url: session.url } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe error";
      return reply.status(502).send({ error: `Couldn't start checkout: ${msg}` });
    }
  });

  // GET /donations/session/:sessionId — used by the thank-you page to
  // confirm the donation actually succeeded (defends against someone
  // navigating to /thank-you directly).
  app.get("/session/:sessionId", async (request, reply) => {
    if (!stripe) {
      return reply.status(503).send({ error: "Donations aren't available" });
    }
    const { sessionId } = request.params as { sessionId: string };
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return reply.status(400).send({ error: "Invalid session id" });
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Only acknowledge donations from our flow — don't leak data
      // about unrelated checkout sessions (subscriptions etc).
      if (session.metadata?.kind !== "donation") {
        return reply.status(404).send({ error: "Donation not found" });
      }
      return reply.send({
        data: {
          status: session.payment_status,
          amountPence: session.amount_total ?? 0,
          donorName: session.metadata?.donorName ?? null,
        },
      });
    } catch {
      return reply.status(404).send({ error: "Donation not found" });
    }
  });

  // GET /donations/presets — small public endpoint so the page knows
  // the suggested amounts without re-deploying the web app when we
  // tweak them. Helps with A/B testing later.
  app.get("/presets", async (_request, reply) => {
    return reply.send({
      data: {
        amountsPence: PRESET_AMOUNTS_PENCE,
        minPence: MIN_DONATION_PENCE,
        maxPence: MAX_DONATION_PENCE,
      },
    });
  });
}
