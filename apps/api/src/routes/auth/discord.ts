// Discord OAuth — link a MileClear account to a Discord user.
//
// Three endpoints:
//   GET  /auth/discord/start     — auth'd; returns the OAuth URL to open
//   GET  /auth/discord/callback  — public; Discord redirects here with
//                                   ?code + ?state; we exchange + persist
//   POST /auth/discord/unlink    — auth'd; clears the link, revokes role
//
// State token is a short-lived JWT signed with JWT_SECRET. Carries the
// MileClear user ID across the OAuth roundtrip so the callback can
// re-identify the user without needing a session cookie.
//
// Phase 1A of the Discord community roadmap (21 May 2026).

import type { FastifyInstance } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import {
  syncProMemberRole,
  revokeProMemberRole,
} from "../../services/discordBot.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const DISCORD_OAUTH_TOKEN = "https://discord.com/api/oauth2/token";

// Mobile uses this as the OAuth redirect_uri so `WebBrowser.openAuthSessionAsync`
// closes the in-app browser when Discord redirects. The callback below
// honours the same path by re-routing to a `mileclear://discord-linked`
// deep link after persisting the link.
const REDIRECT_URI =
  process.env.DISCORD_OAUTH_REDIRECT_URI ||
  `${process.env.API_BASE_URL ?? "https://api.mileclear.com"}/auth/discord/callback`;

const STATE_TTL_SECONDS = 600; // 10 minutes
const stateSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-secret");

interface StatePayload {
  uid: string; // MileClear user ID
  iat: number;
  exp: number;
}

async function signState(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + STATE_TTL_SECONDS)
    .sign(stateSecret());
}

async function verifyState(token: string): Promise<StatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, stateSecret());
    if (!payload.uid || typeof payload.uid !== "string") return null;
    return payload as unknown as StatePayload;
  } catch {
    return null;
  }
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUserMe {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

async function exchangeCodeForToken(code: string): Promise<DiscordTokenResponse> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(DISCORD_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordTokenResponse>;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUserMe> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord /users/@me failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscordUserMe>;
}

export async function discordAuthRoutes(app: FastifyInstance) {
  // GET /auth/discord/start — kicks off the OAuth flow. Returns the
  // Discord authorize URL with a signed state. Mobile opens this URL
  // in an in-app browser (`WebBrowser.openAuthSessionAsync`).
  app.get(
    "/start",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const clientId = process.env.DISCORD_CLIENT_ID;
      if (!clientId) {
        return reply.status(503).send({
          error: "Discord OAuth is not configured on this server.",
        });
      }
      const state = await signState(request.userId!);
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        scope: "identify",
        redirect_uri: REDIRECT_URI,
        state,
        prompt: "consent",
      });
      const url = `${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`;
      return reply.send({ data: { url } });
    }
  );

  // GET /auth/discord/callback — Discord redirects here with ?code + ?state.
  // Public endpoint (no auth middleware) because Discord isn't carrying
  // any MileClear session; the state token is what binds the callback
  // to the user that initiated the link.
  app.get("/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().min(1).optional(),
        state: z.string().min(1).optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.redirect("mileclear://discord-linked?ok=false&reason=bad_request");
    }
    const { code, state, error } = query.data;

    // User declined / Discord errored
    if (error || !code || !state) {
      const reason = error ? `denied_${error}` : "missing_params";
      return reply.redirect(
        `mileclear://discord-linked?ok=false&reason=${encodeURIComponent(reason)}`
      );
    }

    const statePayload = await verifyState(state);
    if (!statePayload) {
      return reply.redirect("mileclear://discord-linked?ok=false&reason=bad_state");
    }

    let discordUser: DiscordUserMe;
    try {
      const token = await exchangeCodeForToken(code);
      discordUser = await fetchDiscordUser(token.access_token);
    } catch (err) {
      app.log.error({ err }, "Discord OAuth exchange failed");
      return reply.redirect(
        "mileclear://discord-linked?ok=false&reason=exchange_failed"
      );
    }

    // Already linked to a DIFFERENT MileClear account? Refuse the
    // re-link rather than silently moving the badge.
    const existingLink = await prisma.user.findUnique({
      where: { discordUserId: discordUser.id },
      select: { id: true },
    });
    if (existingLink && existingLink.id !== statePayload.uid) {
      return reply.redirect(
        `mileclear://discord-linked?ok=false&reason=already_linked_elsewhere`
      );
    }

    // Persist link + sync Pro role.
    await prisma.user.update({
      where: { id: statePayload.uid },
      data: { discordUserId: discordUser.id },
    });
    logEvent("discord.linked", statePayload.uid, {
      discordUserId: discordUser.id,
      username: discordUser.username,
    });

    // Pro Member role sync — fire and forget, never block the user's
    // redirect on a Discord API hiccup.
    void (async () => {
      try {
        const u = await prisma.user.findUnique({
          where: { id: statePayload.uid },
          select: { isPremium: true, premiumExpiresAt: true },
        });
        const active =
          !!u?.isPremium && (!u.premiumExpiresAt || u.premiumExpiresAt > new Date());
        await syncProMemberRole({
          discordUserId: discordUser.id,
          isPremiumActive: active,
        });
      } catch (err) {
        app.log.warn({ err }, "Pro role sync (post-link) failed");
      }
    })();

    return reply.redirect(
      `mileclear://discord-linked?ok=true&username=${encodeURIComponent(discordUser.username)}`
    );
  });

  // POST /auth/discord/unlink — drops the link and revokes the Pro role.
  app.post(
    "/unlink",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { discordUserId: true },
      });
      if (!user?.discordUserId) {
        return reply.send({ data: { unlinked: false, already: true } });
      }
      const previousDiscordId = user.discordUserId;
      await prisma.user.update({
        where: { id: request.userId! },
        data: { discordUserId: null },
      });
      // Best-effort role revoke — never let a Discord API problem
      // block the unlink succeeding on our side.
      void revokeProMemberRole(previousDiscordId);
      logEvent("discord.unlinked", request.userId!, {
        previousDiscordId,
      });
      return reply.send({ data: { unlinked: true } });
    }
  );

  // GET /auth/discord/status — auth'd; tells the client whether the
  // current user has a linked Discord account. Used by the mobile
  // profile screen to render "Connect" vs "Connected as @username /
  // Disconnect".
  app.get(
    "/status",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { discordUserId: true },
      });
      return reply.send({
        data: {
          linked: !!user?.discordUserId,
          discordUserId: user?.discordUserId ?? null,
        },
      });
    }
  );
}
