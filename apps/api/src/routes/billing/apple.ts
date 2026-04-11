import { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushNotification } from "../../lib/push.js";
import {
  getAppleClient,
  getSignedDataVerifier,
  decodeNotification,
  isTransactionActive,
  VALID_PRODUCT_IDS,
  bundleId,
} from "../../services/appleIap.js";
import { logEvent } from "../../services/appEvents.js";

async function recordAppleWebhook(data: {
  notificationType?: string | null;
  subtype?: string | null;
  originalTransactionId?: string | null;
  userId?: string | null;
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
        // Fetch transaction info from Apple Server API
        const transactionResponse = await client.getTransactionInfo(transactionId);
        if (!transactionResponse.signedTransactionInfo) {
          return reply.status(400).send({ error: "Invalid transaction" });
        }

        // Verify JWS signature
        const transaction = await verifier.verifyAndDecodeTransaction(
          transactionResponse.signedTransactionInfo
        );

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

        return reply.send({
          data: {
            isPremium: true,
            premiumExpiresAt: premiumExpiresAt?.toISOString() ?? null,
          },
        });
      } catch (err) {
        app.log.error({ err }, "Apple purchase validation failed");
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

    const { notificationType, subtype, transactionInfo } = notification;
    if (!transactionInfo?.originalTransactionId) {
      app.log.warn("Apple webhook: no originalTransactionId in notification");
      await recordAppleWebhook({
        notificationType,
        subtype,
        status: "no_transaction_id",
        errorMessage: "Notification had no originalTransactionId",
      });
      return reply.send({ received: true });
    }

    const originalTransactionId = transactionInfo.originalTransactionId;

    // Look up user by Apple original transaction ID
    const user = await prisma.user.findUnique({
      where: { appleOriginalTransactionId: originalTransactionId },
      select: { id: true, pushToken: true },
    });

    if (!user) {
      app.log.warn(
        `Apple webhook: no user found for transaction ${originalTransactionId}`
      );
      await recordAppleWebhook({
        notificationType,
        subtype,
        originalTransactionId,
        status: "no_user",
        errorMessage: `No user with appleOriginalTransactionId ${originalTransactionId}`,
      });
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
                data: { type: "payment_failed" },
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
          break;
        }

        case "DID_CHANGE_RENEWAL_STATUS": {
          // auto_renew_disabled — log only, keep access until expiry
          app.log.info(
            `Apple DID_CHANGE_RENEWAL_STATUS (subtype: ${subtype}): user ${user.id}`
          );
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
      status: handlerStatus,
    });

    return reply.send({ received: true });
  });
}
