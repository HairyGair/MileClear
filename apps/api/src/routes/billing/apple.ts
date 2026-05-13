import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushNotification } from "../../lib/push.js";
import {
  getAppleClient,
  getSignedDataVerifier,
  decodeNotification,
  isTransactionActive,
  fetchTransactionWithEnvFallback,
  VALID_PRODUCT_IDS,
  bundleId,
  type AppleIapEnvironment,
} from "../../services/appleIap.js";
import { logEvent } from "../../services/appEvents.js";
import { respondToConsumptionRequest } from "../../services/appleConsumption.js";
import { notifyBillingEvent } from "../../services/billingAlerts.js";
import { sendProWelcomeEmail } from "../../services/email.js";

// Notification types that imply an active payment relationship. When
// any of these arrive without a matching user, we surface a real-time
// alert so the orphan can be recovered before the user churns.
const ACTIVE_PAYMENT_NOTIFICATIONS = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_STATUS",
  "OFFER_REDEEMED",
]);

async function recordAppleWebhook(data: {
  notificationType?: string | null;
  subtype?: string | null;
  originalTransactionId?: string | null;
  userId?: string | null;
  environment?: string | null;
  status: string;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await prisma.appleIapWebhookLog.create({
      data: {
        notificationType: data.notificationType ?? null,
        subtype: data.subtype ?? null,
        originalTransactionId: data.originalTransactionId ?? null,
        userId: data.userId ?? null,
        environment: data.environment ?? null,
        status: data.status,
        errorMessage: data.errorMessage ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to record Apple webhook log:", err);
  }
}

export async function appleBillingRoutes(app: FastifyInstance) {
  // --- Validate purchase (auth required) ---

  app.post(
    "/validate",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const client = getAppleClient();
      const verifier = getSignedDataVerifier();
      if (!client || !verifier) {
        return reply.status(503).send({ error: "Apple IAP not configured" });
      }

      const { transactionId } = request.body as { transactionId?: string };
      if (!transactionId) {
        return reply.status(400).send({ error: "transactionId is required" });
      }

      try {
        // Fetch via the env-fallback helper so production App Store
        // transactions resolve correctly even when APPLE_IAP_ENVIRONMENT
        // is set to Sandbox (and vice versa). Without this, the Restore
        // Purchases button silently fails for users on the production
        // App Store. Discovered 4 May 2026.
        const fetched = await fetchTransactionWithEnvFallback(transactionId);
        if (!fetched) {
          return reply.status(400).send({ error: "Invalid transaction" });
        }
        const transaction = fetched.transaction;

        // Validate bundle ID and product ID
        if (transaction.bundleId !== bundleId) {
          return reply.status(400).send({ error: "Bundle ID mismatch" });
        }
        if (!transaction.productId || !VALID_PRODUCT_IDS.includes(transaction.productId)) {
          return reply.status(400).send({ error: "Product ID mismatch" });
        }

        const originalTransactionId = transaction.originalTransactionId;
        if (!originalTransactionId) {
          return reply.status(400).send({ error: "Missing original transaction ID" });
        }

        // Conflict check: if this Apple subscription is already linked to a different user
        const existingUser = await prisma.user.findUnique({
          where: { appleOriginalTransactionId: originalTransactionId },
          select: { id: true },
        });
        if (existingUser && existingUser.id !== request.userId) {
          return reply.status(409).send({
            error: "This subscription is already linked to a different account",
          });
        }

        // Check if the subscription is currently active
        if (!isTransactionActive(transaction)) {
          return reply.status(400).send({ error: "Subscription is not active" });
        }

        // Calculate premium expiry from transaction
        const premiumExpiresAt = transaction.expiresDate
          ? new Date(transaction.expiresDate)
          : null;

        // Update user with Apple subscription info
        await prisma.user.update({
          where: { id: request.userId! },
          data: {
            isPremium: true,
            premiumExpiresAt,
            appleOriginalTransactionId: originalTransactionId,
          },
        });

        logEvent("billing.apple_iap_validated", request.userId!, { originalTransactionId });
        app.log.info(
          `User ${request.userId} validated Apple purchase ${originalTransactionId}`
        );

        // Celebrate: a real Pro user just landed (or restored). Only
        // alert when the link was new — re-validating an already-linked
        // sub doesn't need a new ping.
        const wasNewLink = !existingUser;
        if (wasNewLink) {
          const fullUser = await prisma.user.findUnique({
            where: { id: request.userId! },
            select: { email: true, displayName: true },
          });
          notifyBillingEvent({
            kind: "subscription.new",
            tier: "celebrate",
            title: `Pro subscription validated 🎉`,
            body: `${fullUser?.displayName || fullUser?.email || request.userId}'s Apple IAP just bound to their MileClear account.`,
            userId: request.userId!,
            userEmail: fullUser?.email ?? null,
            originalTransactionId,
            details: { premiumExpiresAt: premiumExpiresAt?.toISOString() ?? null },
          });
          // One-shot founder welcome email. Idempotent — checks
          // for a prior welcome.pro_sent AppEvent first so a
          // Restore Purchases on an existing account doesn't
          // re-send. Wrapped in try/catch so a Brevo outage can't
          // break the IAP validate handshake.
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
              app.log.error({ err }, "sendProWelcomeEmail failed (Apple path)");
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
        app.log.error({ err }, "Apple purchase validation failed");
        notifyBillingEvent({
          kind: "subscription.validate_failed",
          tier: "act_now",
          title: "Apple IAP validate failed",
          body: `User ${request.userId ?? "(unknown)"} attempted to validate an Apple purchase but the server rejected it. They paid; we didn't bind. Investigate immediately.`,
          userId: request.userId ?? null,
          details: {
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            transactionId: (request.body as { transactionId?: string })?.transactionId ?? null,
          },
        });
        return reply.status(400).send({ error: "Failed to validate purchase" });
      }
    }
  );

  // --- Apple webhook (no auth — JWS-verified) ---

  // Override content type parser for raw body access
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  app.post("/webhook", async (request, reply) => {
    const verifier = getSignedDataVerifier();
    if (!verifier) {
      await recordAppleWebhook({ status: "not_configured", errorMessage: "Apple IAP not configured" });
      return reply.status(503).send({ error: "Apple IAP not configured" });
    }

    let rawBody: string;
    if (Buffer.isBuffer(request.body)) {
      rawBody = request.body.toString("utf8");
    } else if (typeof request.body === "string") {
      rawBody = request.body;
    } else {
      rawBody = JSON.stringify(request.body);
    }

    let payload: { signedPayload?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await recordAppleWebhook({ status: "invalid_json", errorMessage: "Body was not valid JSON" });
      return reply.status(400).send({ error: "Invalid JSON" });
    }

    if (!payload.signedPayload) {
      await recordAppleWebhook({ status: "missing_payload", errorMessage: "signedPayload field missing" });
      return reply.status(400).send({ error: "Missing signedPayload" });
    }

    let notification;
    try {
      notification = await decodeNotification(payload.signedPayload);
    } catch (err) {
      await recordAppleWebhook({
        status: "verification_failed",
        errorMessage: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      return reply.status(400).send({ error: "Failed to verify notification" });
    }
    if (!notification) {
      await recordAppleWebhook({ status: "verification_failed", errorMessage: "decodeNotification returned null" });
      return reply.status(400).send({ error: "Failed to verify notification" });
    }

    const { notificationType, subtype, transactionInfo, environment } = notification;
    if (!transactionInfo?.originalTransactionId) {
      app.log.warn("Apple webhook: no originalTransactionId in notification");
      await recordAppleWebhook({
        notificationType,
        subtype,
        environment,
        status: "no_transaction_id",
        errorMessage: "Notification had no originalTransactionId",
      });
      return reply.send({ received: true });
    }

    const originalTransactionId = transactionInfo.originalTransactionId;
    let appAccountToken = transactionInfo.appAccountToken ?? null;

    // Look up user by Apple original transaction ID first, then fall back to the
    // appAccountToken the mobile client set at purchase time (which we seed with
    // the MileClear userId). The fallback closes the race where Apple's webhook
    // arrives before /billing/apple/validate has linked the transaction to us.
    let user = await prisma.user.findUnique({
      where: { appleOriginalTransactionId: originalTransactionId },
      select: { id: true, pushToken: true },
    });

    // Third fallback: Apple sometimes omits appAccountToken from the inbound
    // webhook JWS even when the mobile client set it at purchase time. Re-
    // fetch the canonical transaction from the App Store Server API.
    //
    // Use the env-fallback helper so this works whether the transaction
    // came from sandbox (TestFlight) or production (App Store) — we try
    // the webhook's stated environment first, then the other one.
    //
    // Documented: 4 May 2026 — discovered 4 production users had subscribed
    // without ever being linked because (a) the inbound webhook had no
    // appAccountToken, AND (b) the production app store API client wasn't
    // configured to fetch their canonical transactions either.
    if (!user && !appAccountToken) {
      try {
        const fetched = await fetchTransactionWithEnvFallback(
          originalTransactionId,
          environment
        );
        if (fetched && fetched.transaction.appAccountToken) {
          appAccountToken = fetched.transaction.appAccountToken;
          app.log.info(
            `Apple webhook: re-fetched appAccountToken ${appAccountToken} for transaction ${originalTransactionId} from ${fetched.environment} env`
          );
        }
      } catch (err) {
        app.log.warn(
          { err: err instanceof Error ? err.message : String(err), originalTransactionId },
          "Apple webhook: re-fetch from App Store Server API failed"
        );
      }
    }

    if (!user && appAccountToken) {
      const linkedUser = await prisma.user.findUnique({
        where: { id: appAccountToken },
        select: { id: true, pushToken: true, appleOriginalTransactionId: true },
      });
      if (linkedUser) {
        // Only persist the link if the user doesn't already have a conflicting
        // transaction. A conflict would mean two purchases have claimed the
        // same MileClear account, which /validate also rejects with a 409.
        if (
          !linkedUser.appleOriginalTransactionId ||
          linkedUser.appleOriginalTransactionId === originalTransactionId
        ) {
          await prisma.user.update({
            where: { id: linkedUser.id },
            data: { appleOriginalTransactionId: originalTransactionId },
          });
          user = { id: linkedUser.id, pushToken: linkedUser.pushToken };
          app.log.info(
            `Apple webhook: linked transaction ${originalTransactionId} to user ${linkedUser.id} via appAccountToken`
          );
        } else {
          app.log.warn(
            `Apple webhook: appAccountToken ${appAccountToken} is already linked to a different transaction — not overwriting`
          );
        }
      }
    }

    if (!user) {
      app.log.warn(
        `Apple webhook: no user found for transaction ${originalTransactionId} (env: ${environment})`
      );
      await recordAppleWebhook({
        notificationType,
        subtype,
        originalTransactionId,
        environment,
        status: "no_user",
        errorMessage: `No user with appleOriginalTransactionId ${originalTransactionId}${appAccountToken ? ` (appAccountToken ${appAccountToken} also not matched)` : ""}`,
      });

      // Real-time alert when an active-payment notification lands
      // without a user link. This surfaces in the admin Alerts feed
      // immediately so the orphan can be recovered before the user
      // gives up and churns silently.
      if (notificationType && ACTIVE_PAYMENT_NOTIFICATIONS.has(notificationType)) {
        logEvent("alert.subscription_orphan", null, {
          originalTransactionId,
          notificationType,
          subtype: subtype ?? null,
          environment: environment ?? null,
          appAccountToken,
        });
        notifyBillingEvent({
          kind: "subscription.orphan",
          tier: "act_now",
          title: "Orphan subscription. Money in, no user linked",
          body: `Apple sent ${notificationType}${subtype ? ` (${subtype})` : ""} for txn ${originalTransactionId.slice(0, 12)}… but it can't be linked to a MileClear account. Open the Ops tab and use Reprocess or Link.`,
          originalTransactionId,
          details: {
            notificationType,
            subtype: subtype ?? null,
            environment: environment ?? null,
            appAccountTokenPresent: Boolean(appAccountToken),
          },
        });
      }

      // CONSUMPTION_REQUEST orphans still need a response — Apple's
      // 12-hour window doesn't care that we couldn't find the user.
      // Submit minimal UNDECLARED data so we don't get the worst-case
      // default refund decision.
      if (notificationType === "CONSUMPTION_REQUEST") {
        const env: AppleIapEnvironment | null =
          environment === "production" || environment === "sandbox"
            ? environment
            : null;
        const r = await respondToConsumptionRequest({
          originalTransactionId,
          userId: null,
          environment: env,
          appAccountToken,
        });
        app.log.info(
          { ok: r.ok, reason: r.reason, originalTransactionId },
          "Apple CONSUMPTION_REQUEST (orphan) consumption response"
        );
      }

      return reply.send({ received: true });
    }

    const premiumExpiresAt = transactionInfo.expiresDate
      ? new Date(transactionInfo.expiresDate)
      : null;

    let handlerStatus = "success";

    try {
      switch (notificationType) {
        case "DID_RENEW":
        case "SUBSCRIBED": {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isPremium: true,
              premiumExpiresAt,
            },
          });
          app.log.info(
            `Apple ${notificationType}: user ${user.id} premium renewed until ${premiumExpiresAt?.toISOString()}`
          );
          // Only celebrate the actual new sub, not every renewal — renewals
          // happen monthly and would spam the alert channel. Subtype
          // INITIAL_BUY = first-time subscribe.
          if (notificationType === "SUBSCRIBED" && subtype === "INITIAL_BUY") {
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { email: true, displayName: true },
            });
            notifyBillingEvent({
              kind: "subscription.new",
              tier: "celebrate",
              title: `New Pro subscriber 🎉`,
              body: `${fullUser?.displayName || fullUser?.email || user.id} just subscribed to MileClear Pro on iOS.`,
              userId: user.id,
              userEmail: fullUser?.email ?? null,
              originalTransactionId,
              details: { premiumExpiresAt: premiumExpiresAt?.toISOString() ?? null },
            });
          }
          break;
        }

        case "EXPIRED":
        case "GRACE_PERIOD_EXPIRED": {
          await prisma.user.update({
            where: { id: user.id },
            data: { isPremium: false },
          });
          app.log.info(
            `Apple ${notificationType}: user ${user.id} premium expired`
          );
          break;
        }

        case "REVOKE":
        case "REFUND": {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isPremium: false,
              appleOriginalTransactionId: null,
            },
          });
          app.log.info(
            `Apple ${notificationType}: user ${user.id} subscription revoked/refunded`
          );
          {
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { email: true, displayName: true },
            });
            notifyBillingEvent({
              kind: notificationType === "REFUND" ? "subscription.refund_granted" : "subscription.revoked",
              tier: "aware",
              title: notificationType === "REFUND" ? "Refund granted by Apple" : "Subscription revoked",
              body: `${fullUser?.displayName || fullUser?.email || user.id}'s subscription has been ${notificationType === "REFUND" ? "refunded" : "revoked"}. Pro access removed.`,
              userId: user.id,
              userEmail: fullUser?.email ?? null,
              originalTransactionId,
            });
          }
          break;
        }

        case "DID_FAIL_TO_RENEW": {
          // Don't revoke — Apple retries. Notify user.
          if (user.pushToken) {
            try {
              await sendPushNotification({
                to: user.pushToken,
                title: "Payment Failed",
                body: "Your MileClear Pro payment didn't go through. Update your payment method in App Store settings.",
                sound: "default",
                data: { type: "payment_failed", action: "open_billing" },
              });
            } catch (err) {
              app.log.error(
                { err },
                "Failed to send Apple payment_failed push notification"
              );
            }
          }
          app.log.warn(
            `Apple DID_FAIL_TO_RENEW: user ${user.id}`
          );
          {
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { email: true, displayName: true },
            });
            notifyBillingEvent({
              kind: "subscription.payment_failed",
              tier: "act_now",
              title: "Payment failed on renewal",
              body: `${fullUser?.displayName || fullUser?.email || user.id}'s renewal payment failed. They'll get a system push to update their payment method; consider following up.`,
              userId: user.id,
              userEmail: fullUser?.email ?? null,
              originalTransactionId,
              details: { subtype: subtype ?? null },
            });
          }
          break;
        }

        case "DID_CHANGE_RENEWAL_STATUS": {
          // auto_renew_disabled — log only, keep access until expiry
          app.log.info(
            `Apple DID_CHANGE_RENEWAL_STATUS (subtype: ${subtype}): user ${user.id}`
          );
          break;
        }

        case "CONSUMPTION_REQUEST": {
          // The user has filed a refund request with Apple. We have 12
          // hours to respond with consumption data. Silent non-response
          // = Apple defaults to worst-case (approves refund). Build a
          // payload from real usage so engaged users' refund attempts
          // get pushed back on; lightly-used or unused subs get
          // NO_PREFERENCE.
          const env: AppleIapEnvironment | null =
            environment === "production" || environment === "sandbox"
              ? environment
              : null;
          const r = await respondToConsumptionRequest({
            originalTransactionId,
            userId: user.id,
            environment: env,
            appAccountToken,
          });
          if (!r.ok) {
            handlerStatus = "consumption_failed";
          }
          app.log.info(
            { ok: r.ok, reason: r.reason, status: r.status, preference: r.preference, userId: user.id },
            `Apple CONSUMPTION_REQUEST: response submitted`
          );
          {
            const fullUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { email: true, displayName: true },
            });
            notifyBillingEvent({
              kind: "subscription.refund_requested",
              tier: "aware",
              title: "Refund request filed with Apple",
              body: `${fullUser?.displayName || fullUser?.email || user.id} filed a refund request. ${r.ok ? "Auto-response sent to Apple with consumption data." : "Auto-response FAILED. Check the Ops tab."} Apple typically decides within 24-48h.`,
              userId: user.id,
              userEmail: fullUser?.email ?? null,
              originalTransactionId,
              details: {
                consumptionResponseOk: r.ok,
                refundPreference: r.preference ?? null,
                consumptionStatus: r.status ?? null,
                error: r.reason ?? null,
              },
            });
          }
          break;
        }

        default: {
          handlerStatus = "unhandled";
          app.log.info(
            `Apple webhook: unhandled notification type ${notificationType}`
          );
        }
      }
    } catch (err) {
      app.log.error({ err }, `Apple webhook handler failed for ${notificationType}`);
      await recordAppleWebhook({
        notificationType,
        subtype,
        originalTransactionId,
        userId: user.id,
        environment,
        status: "handler_error",
        errorMessage: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      return reply.send({ received: true });
    }

    await recordAppleWebhook({
      notificationType,
      subtype,
      originalTransactionId,
      userId: user.id,
      environment,
      status: handlerStatus,
    });

    return reply.send({ received: true });
  });
}
