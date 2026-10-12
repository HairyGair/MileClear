// Practice accounts: public lookups for the join link and invite landing
// pages, and the checked logo. No sign-in. Shows only what the consent
// sheet shows: firm name, contact, professional body, whether checked.

import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { PRACTICE_JOIN_CODE_RE } from "@mileclear/shared";
import { hashToken, INVITE_TOKEN_RE } from "../../services/practice/access.js";
import { logoIsChecked, practiceForDriver, practiceIdentitySelect } from "./shared.js";

const LIMIT = { rateLimit: { max: 60, timeWindow: "1 minute" } };

export async function practicePublicRoutes(app: FastifyInstance) {
  // GET /practice-public/join/:code
  app.get("/join/:code", { config: LIMIT }, async (request, reply) => {
    const code = String((request.params as { code?: string }).code ?? "").toUpperCase();
    if (!PRACTICE_JOIN_CODE_RE.test(code)) return reply.status(404).send({ error: "This link is not recognised.", code: "not_found" });
    const p = await prisma.practice.findUnique({ where: { joinCode: code }, select: practiceIdentitySelect });
    if (!p || p.suspendedAt) return reply.status(404).send({ error: "This link is not recognised.", code: "not_found" });
    return reply.send({ data: { practice: practiceForDriver(p), joinCode: code } });
  });

  // GET /practice-public/invite/:token: who is asking, and whether the
  // invite still works. Never says who was invited.
  app.get("/invite/:token", { config: LIMIT }, async (request, reply) => {
    const token = String((request.params as { token?: string }).token ?? "");
    if (!INVITE_TOKEN_RE.test(token)) return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
    const link = await prisma.practiceLink.findUnique({
      where: { inviteTokenHash: hashToken(token) },
      select: { status: true, inviteExpiresAt: true, practice: { select: practiceIdentitySelect } },
    });
    if (!link || !link.practice || link.status !== "invited" || link.practice.suspendedAt) {
      return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
    }
    const expired = !link.inviteExpiresAt || link.inviteExpiresAt.getTime() <= Date.now();
    return reply.send({ data: { practice: practiceForDriver(link.practice), expired } });
  });

  // GET /practice-public/staff-invite/:token: firm name for the colleague's page.
  app.get("/staff-invite/:token", { config: LIMIT }, async (request, reply) => {
    const token = String((request.params as { token?: string }).token ?? "");
    if (!INVITE_TOKEN_RE.test(token)) return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
    const m = await prisma.practiceMember.findUnique({
      where: { inviteTokenHash: hashToken(token) },
      select: { status: true, inviteExpiresAt: true, practice: { select: { name: true } } },
    });
    if (!m || m.status !== "invited") return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
    const expired = !m.inviteExpiresAt || m.inviteExpiresAt.getTime() <= Date.now();
    return reply.send({ data: { practiceName: m.practice.name, expired } });
  });

  // GET /practice-public/logo/:practiceId: only a checked logo of a checked
  // practice. Anything else is a 404, so the app falls back to initials.
  app.get("/logo/:practiceId", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (request, reply) => {
    const id = String((request.params as { practiceId?: string }).practiceId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.status(404).send({ error: "Not found" });
    const p = await prisma.practice.findUnique({
      where: { id },
      select: { ...practiceIdentitySelect, logo: { select: { updatedAt: true, checkedAt: true, data: true, mime: true } } },
    });
    if (!p || !p.logo || !logoIsChecked(p)) return reply.status(404).send({ error: "Not found" });
    return reply
      .header("Content-Type", p.logo.mime)
      .header("Cache-Control", "public, max-age=86400")
      .header("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(p.logo.data));
  });
}
