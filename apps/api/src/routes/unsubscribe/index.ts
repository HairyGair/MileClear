import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { verifyUnsubscribeToken } from "../../lib/unsubscribeToken.js";
import { logEvent } from "../../services/appEvents.js";

const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";

async function applyOptOut(userId: string, source: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        marketingEmailsEnabled: false,
        marketingEmailsDisabledAt: new Date(),
        marketingEmailsDisabledSource: source,
      },
    });
    logEvent("email.unsubscribed", userId, { source });
    return true;
  } catch {
    return false;
  }
}

async function applyOptIn(userId: string, source: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        marketingEmailsEnabled: true,
        marketingEmailsDisabledAt: null,
        marketingEmailsDisabledSource: null,
      },
    });
    logEvent("email.resubscribed", userId, { source });
    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeRoutes(app: FastifyInstance) {
  // GET /unsubscribe?token=...
  // For human clicks from email body links. Flips the opt-out flag and
  // redirects to the web confirmation page so the user sees a branded
  // "you're unsubscribed" UI rather than a JSON blob.
  app.get("/", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.redirect(`${WEB_BASE_URL}/unsubscribe?status=invalid`, 302);
    }

    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      return reply.redirect(`${WEB_BASE_URL}/unsubscribe?status=invalid`, 302);
    }

    const ok = await applyOptOut(verified.userId, "email_link");
    return reply.redirect(
      `${WEB_BASE_URL}/unsubscribe?status=${ok ? "ok" : "error"}&token=${encodeURIComponent(token)}`,
      302
    );
  });

  // POST /unsubscribe?token=...
  // RFC 8058 one-click unsubscribe. Mail clients (Gmail, Apple Mail, Outlook)
  // POST directly to this URL when the user taps the native "Unsubscribe"
  // button in their inbox. Must return 200 with no body redirect.
  app.post("/", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.status(400).send({ error: "Missing token" });
    }

    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      return reply.status(400).send({ error: "Invalid token" });
    }

    const ok = await applyOptOut(verified.userId, "one_click");
    if (!ok) {
      return reply.status(500).send({ error: "Could not unsubscribe" });
    }
    return reply.status(200).send({ data: { unsubscribed: true } });
  });

  // POST /unsubscribe/resubscribe?token=...
  // Lets a user undo an accidental unsubscribe directly from the web
  // confirmation page, no login required (the token already proves ownership).
  app.post("/resubscribe", async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.status(400).send({ error: "Missing token" });
    }

    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      return reply.status(400).send({ error: "Invalid token" });
    }

    const ok = await applyOptIn(verified.userId, "email_link");
    if (!ok) {
      return reply.status(500).send({ error: "Could not resubscribe" });
    }
    return reply.status(200).send({ data: { resubscribed: true } });
  });
}
