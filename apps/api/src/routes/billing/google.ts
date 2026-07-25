import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  isGooglePlayConfigured,
  fetchSubscription,
  acknowledgeSubscription,
  isSubscriptionActive,
  getExpiryDate,
  isTrialPurchase,
  hasValidBasePlan,
  decodePubSubMessage,
  RTDN_GRANTS_ACCESS,
  RTDN_REVOKES_ACCESS,
  RTDN_TYPES,
} from "../../services/googlePlayBilling.js";
import { logEvent } from "../../services/appEvents.js";
import { notifyBillingEvent } from "../../services/billingAlerts.js";
import { sendProWelcomeEmail } from "../../services/email.js";

/**
 * Google Play Billing routes — the Android counterpart to apple.ts.
 *
 * Registered from server.ts under /billing/google rather than from
 * billing/index.ts, purely to keep this file independent of the parked
 * monetisation work sitting uncommitted in billing/index.ts.
 *
 * Deliberate parity choices with the Apple path, each of which was a real
 * incident on iOS:
 *   - Conflict check before binding, so one subscription can't silently
 *     attach to two accounts.
 *   - A validate failure raises an act_now alert: the user has paid and we
 *     failed to bind, which is the worst state to discover from a support
 *     email.
 *   - The Pro welcome email is idempotent via an AppEvent check, so Restore
 *     Purchases doesn't re-send it.
 */
export async function googleBillingRoutes(app: FastifyInstance) {
  // --- Validate purchase (auth required) ---

  app.post("/validate", { preHandler: authMiddleware }, async (request, reply) => {
    if (!isGooglePlayConfigured()) {
      return reply.status(503).send({ error: "Google Play billing not configured" });
    }

    const { purchaseToken } = request.body as { purchaseToken?: string };
    if (!purchaseToken) {
      return reply.status(400).send({ error: "purchaseToken is required" });
    }

    try {
      const sub = await fetchSubscription(purchaseToken);

      if (!hasValidBasePlan(sub)) {
        return reply.status(400).send({ error: "Unrecognised subscription plan" });
      }

      // Conflict check: is this Play subscription already bound elsewhere?
      const existingUser = await prisma.user.findUnique({
        where: { googlePlayPurchaseToken: purchaseToken },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== request.userId) {
        return reply.status(409).send({
          error: "This subscription is already linked to a different account",
        });
      }

      if (!isSubscriptionActive(sub)) {
        return reply.status(400).send({ error: "Subscription is not active" });
      }

      const premiumExpiresAt = getExpiryDate(sub);

      // Acknowledge BEFORE responding. Google auto-refunds anything left
      // unacknowledged for three days, so a failure here has to surface
      // rather than be swallowed.
      await acknowledgeSubscription(purchaseToken);

      await prisma.user.update({
        where: { id: request.userId! },
        data: {
          isPremium: true,
          premiumExpiresAt,
          googlePlayPurchaseToken: purchaseToken,
          googlePlayOrderId: sub.latestOrderId ?? null,
          ...(isTrialPurchase(sub) ? { trialUsedAt: new Date() } : {}),
        },
      });

      logEvent("billing.google_play_validated", request.userId!, {
        orderId: sub.latestOrderId ?? null,
        state: sub.subscriptionState ?? null,
      });
      app.log.info(
        `User ${request.userId} validated Google Play purchase ${sub.latestOrderId ?? "(no order id)"}`,
      );

      const wasNewLink = !existingUser;
      if (wasNewLink) {
        const fullUser = await prisma.user.findUnique({
          where: { id: request.userId! },
          select: { email: true, displayName: true },
        });
        notifyBillingEvent({
          kind: "subscription.new",
          tier: "celebrate",
          title: "Pro subscription validated (Android) 🎉",
          body: `${fullUser?.displayName || fullUser?.email || request.userId}'s Google Play subscription just bound to their MileClear account.`,
          userId: request.userId!,
          userEmail: fullUser?.email ?? null,
          details: {
            premiumExpiresAt: premiumExpiresAt?.toISOString() ?? null,
            orderId: sub.latestOrderId ?? null,
            platform: "google",
          },
        });
        if (fullUser?.email) {
          try {
            const alreadySent = await prisma.appEvent.findFirst({
              where: { userId: request.userId!, type: "welcome.pro_sent" },
              select: { id: true },
            });
            if (!alreadySent) {
              await sendProWelcomeEmail(fullUser.email, fullUser.displayName);
              await logEvent("welcome.pro_sent", request.userId!, { method: "email" });
            }
          } catch (err) {
            app.log.error({ err }, "sendProWelcomeEmail failed (Google path)");
          }
        }
      }

      return reply.send({
        data: {
          isPremium: true,
          premiumExpiresAt: premiumExpiresAt?.toISOString() ?? null,
        },
      });
    } catch (err) {
      app.log.error({ err }, "Google Play purchase validation failed");
      notifyBillingEvent({
        kind: "subscription.validate_failed",
        tier: "act_now",
        title: "Google Play validate failed",
        body: `User ${request.userId ?? "(unknown)"} attempted to validate a Play purchase but the server rejected it. They paid; we didn't bind. Investigate immediately.`,
        userId: request.userId ?? null,
        details: {
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          platform: "google",
        },
      });
      return reply.status(400).send({ error: "Failed to validate purchase" });
    }
  });

  // --- RTDN webhook (no auth — shared-secret guarded) ---

  // RTDN arrives as a Pub/Sub push. Unlike Apple's JWS payloads these are not
  // signed, so authenticity comes from the transport. We require a secret in
  // the query string, which is the simplest option that works with a plain
  // Pub/Sub push subscription. Set GOOGLE_PLAY_RTDN_SECRET and append
  // ?secret=... to the push endpoint URL in the Google Cloud console.
  app.post("/webhook", async (request, reply) => {
    const expected = process.env.GOOGLE_PLAY_RTDN_SECRET;
    const provided = (request.query as { secret?: string })?.secret;
    if (!expected || provided !== expected) {
      app.log.warn("Rejected Google RTDN with missing or bad secret");
      return reply.status(403).send({ error: "Forbidden" });
    }

    // Always 200 back to Pub/Sub once authenticated. A non-2xx makes Google
    // redeliver for up to seven days, which would turn one bad message into a
    // sustained retry storm.
    const notification = decodePubSubMessage(request.body);
    if (!notification) {
      app.log.warn("Google RTDN body was not a Pub/Sub envelope");
      return reply.send({ received: true });
    }

    if (notification.testNotification) {
      app.log.info("Google RTDN test notification received");
      return reply.send({ received: true });
    }

    const sn = notification.subscriptionNotification;
    if (!sn?.purchaseToken || typeof sn.notificationType !== "number") {
      // Voided-purchase notifications land here too; log and move on.
      app.log.info(
        { type: notification.voidedPurchaseNotification ? "voided" : "unknown" },
        "Google RTDN without a subscription payload",
      );
      return reply.send({ received: true });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { googlePlayPurchaseToken: sn.purchaseToken },
        select: { id: true, email: true, displayName: true },
      });

      if (!user) {
        // Orphan: Google says someone is paying but no account carries the
        // token. On iOS this pattern was almost always a validate that never
        // completed, and it needs a human.
        if (RTDN_GRANTS_ACCESS.has(sn.notificationType)) {
          notifyBillingEvent({
            kind: "subscription.orphan",
            tier: "act_now",
            title: "Orphan Google Play subscription",
            body: `RTDN type ${sn.notificationType} arrived for a purchase token no account holds. Someone may be paying without Pro.`,
            details: { notificationType: sn.notificationType, platform: "google" },
          });
        }
        return reply.send({ received: true });
      }

      // Re-read the true state from the API rather than trusting the
      // notification type alone — the notification is a hint that something
      // changed, not a statement of current entitlement.
      const sub = await fetchSubscription(sn.purchaseToken);
      const expiry = getExpiryDate(sub);
      const active = isSubscriptionActive(sub);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isPremium: active,
          premiumExpiresAt: expiry,
          googlePlayOrderId: sub.latestOrderId ?? undefined,
        },
      });

      logEvent("billing.google_play_rtdn", user.id, {
        notificationType: sn.notificationType,
        state: sub.subscriptionState ?? null,
        active,
      });

      if (sn.notificationType === RTDN_TYPES.ON_HOLD) {
        notifyBillingEvent({
          kind: "subscription.payment_failed",
          tier: "act_now",
          title: "Google Play subscription on hold",
          body: `${user.displayName || user.email}'s payment failed and the subscription is on hold.`,
          userId: user.id,
          userEmail: user.email,
          details: { platform: "google" },
        });
      } else if (RTDN_REVOKES_ACCESS.has(sn.notificationType)) {
        notifyBillingEvent({
          kind: "subscription.revoked",
          tier: "act_now",
          title: "Google Play subscription ended",
          body: `${user.displayName || user.email}'s subscription was revoked or expired (RTDN ${sn.notificationType}).`,
          userId: user.id,
          userEmail: user.email,
          details: { platform: "google" },
        });
      }

      return reply.send({ received: true });
    } catch (err) {
      app.log.error({ err }, "Google RTDN handling failed");
      // Still 200 — see the retry-storm note above.
      return reply.send({ received: true });
    }
  });
}
