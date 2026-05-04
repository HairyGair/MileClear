// HMRC MTD ITSA routes — Phase 1 (OAuth + status).
//
// /hmrc/authorize  — start the OAuth handshake (auth-required). Generates
//                    a state token, persists it on a draft HmrcConnection
//                    row, redirects to HMRC's authorize URL.
// /hmrc/callback   — HMRC redirects here with code+state. We verify the
//                    state, exchange code for tokens, persist on the row.
// /hmrc/disconnect — clear the user's HmrcConnection (auth-required).
// /hmrc/status     — return whether the user is connected + scopes +
//                    expiry (auth-required).

import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  getHmrcConfig,
  generateStateToken,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  expiryFromExpiresIn,
  HMRC_SCOPES,
} from "../../services/hmrc/index.js";
import { logEvent } from "../../services/appEvents.js";

export async function hmrcRoutes(app: FastifyInstance) {
  // GET /hmrc/status — connection state for the current user
  app.get("/status", { preHandler: authMiddleware }, async (request, reply) => {
    const config = getHmrcConfig();
    if (!config) {
      return reply.status(503).send({ error: "HMRC integration not configured" });
    }

    const connection = await prisma.hmrcConnection.findUnique({
      where: { userId: request.userId! },
      select: {
        environment: true,
        scope: true,
        expiresAt: true,
        connectedAt: true,
        disconnectedAt: true,
      },
    });

    if (!connection || connection.disconnectedAt) {
      return reply.send({
        data: {
          connected: false,
          environment: config.environment,
        },
      });
    }

    return reply.send({
      data: {
        connected: true,
        environment: connection.environment,
        scopes: connection.scope.split(" "),
        expiresAt: connection.expiresAt.toISOString(),
        connectedAt: connection.connectedAt.toISOString(),
      },
    });
  });

  // GET /hmrc/authorize — kicks off the OAuth handshake
  app.get("/authorize", { preHandler: authMiddleware }, async (request, reply) => {
    const config = getHmrcConfig();
    if (!config) {
      return reply.status(503).send({ error: "HMRC integration not configured" });
    }

    const state = generateStateToken();

    // Upsert a draft HmrcConnection row holding the state token. If the
    // user is already connected, we replace the existing row's state but
    // leave the active tokens in place until the new ones land.
    await prisma.hmrcConnection.upsert({
      where: { userId: request.userId! },
      update: { lastStateToken: state },
      create: {
        userId: request.userId!,
        accessToken: "",
        refreshToken: "",
        scope: "",
        environment: config.environment,
        expiresAt: new Date(0),
        lastStateToken: state,
      },
    });

    const url = buildAuthorizationUrl({ config, state });

    logEvent("hmrc.authorize_started", request.userId!, {
      environment: config.environment,
    });

    return reply.redirect(url);
  });

  // GET /hmrc/callback — HMRC redirects here after consent
  app.get<{
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>(
    "/callback",
    async (request, reply) => {
      const config = getHmrcConfig();
      if (!config) {
        return reply.status(503).send({ error: "HMRC integration not configured" });
      }

      const { code, state, error, error_description } = request.query;

      if (error) {
        logEvent("hmrc.authorize_denied", null, { error, error_description });
        return reply
          .status(400)
          .type("text/html")
          .send(
            `<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;">` +
              `<h1>HMRC connection cancelled</h1>` +
              `<p>${error_description ? String(error_description) : String(error)}</p>` +
              `<p>Return to MileClear and try again, or contact support@mileclear.com.</p>` +
              `</body></html>`
          );
      }

      if (!code || !state) {
        return reply.status(400).send({ error: "Missing code or state on callback" });
      }

      // Match the state token to a user. The lastStateToken is unique enough
      // for a single in-flight handshake per user; collisions across users
      // are astronomically unlikely (24 bytes of randomness).
      const connection = await prisma.hmrcConnection.findFirst({
        where: { lastStateToken: state },
      });
      if (!connection) {
        logEvent("hmrc.callback_state_mismatch", null, { state });
        return reply.status(400).send({ error: "Unknown or expired state token" });
      }

      let tokens;
      try {
        tokens = await exchangeCodeForTokens({ config, code });
      } catch (err) {
        logEvent("hmrc.token_exchange_failed", connection.userId, {
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(502).send({ error: "Failed to exchange code with HMRC" });
      }

      await prisma.hmrcConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          expiresAt: expiryFromExpiresIn(tokens.expires_in),
          environment: config.environment,
          disconnectedAt: null,
          lastStateToken: null,
        },
      });

      logEvent("hmrc.connected", connection.userId, {
        environment: config.environment,
        scopes: tokens.scope.split(" ").length,
      });

      // Bounce back to the mobile app via the deep-link scheme.
      return reply.redirect("mileclear://hmrc-connected");
    }
  );

  // POST /hmrc/disconnect — soft-disconnect (clears active tokens)
  app.post("/disconnect", { preHandler: authMiddleware }, async (request, reply) => {
    await prisma.hmrcConnection.updateMany({
      where: { userId: request.userId!, disconnectedAt: null },
      data: {
        accessToken: "",
        refreshToken: "",
        disconnectedAt: new Date(),
      },
    });

    logEvent("hmrc.disconnected", request.userId!);
    return reply.send({ data: { disconnected: true } });
  });

  // GET /hmrc/scopes — debugging / introspection: full set we ask for
  app.get("/scopes", async (_request, reply) => {
    return reply.send({ data: { scopes: HMRC_SCOPES } });
  });
}
