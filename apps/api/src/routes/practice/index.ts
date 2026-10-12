// Practice accounts: the accountant's side (Accountant mode phase 1, Oct 2026).
//
// Every route here needs a signed-in MileClear user who is an active
// member of a practice. Client data routes also need a live, driver-approved
// link (services/practice/access.ts), return business records only unless
// the driver turned on personal trips, and write a PracticeAccessLog row
// before any data goes back.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { logEvent } from "../../services/appEvents.js";
import { sendPushToUser } from "../../lib/push.js";
import { sendPracticeStaffInviteEmail } from "../../services/email.js";
import { generateSelfAssessmentPdf, generateTripsCsv, generateTripsPdf, canSafelyEmbedImage } from "../../services/export.js";
import { loadPeriodFigures } from "../../services/periodFigures.js";
import {
  EXPENSE_CATEGORIES,
  GIG_PLATFORMS,
  PRACTICE_BULK_INVITE_MAX,
  PRACTICE_INVITE_DAYS,
  PRACTICE_NOTE_MAX,
  PRACTICE_REQUESTS_PER_WEEK,
  PRACTICE_STAFF_CAP,
  linkEndsAt,
  mtdQuarters,
  parsePastedInvites,
  practicePeriod,
  taxYearStartYear,
  ukDateKey,
  type PracticeAccessAction,
  type PracticePeriod,
} from "@mileclear/shared";
import {
  clientName,
  hashToken,
  loadMember,
  logPracticeAccess,
  newInviteToken,
  newJoinCode,
  problemResponse,
  resolveClientLink,
  visibleClassifications,
  INVITE_TOKEN_RE,
  type LiveLink,
  type MemberContext,
} from "../../services/practice/access.js";
import {
  loadClientList,
  loadMtdSent,
  sentForQuarter,
  updateState,
} from "../../services/practice/clients.js";
import {
  classifyInvites,
  claimOldLinks,
  deliverClientInvite,
  findClaimable,
  inviteClient,
  inviteFromText,
} from "../../services/practice/invites.js";
import {
  refreshAutoRequests,
  requestSelect,
  shapeRequest,
  ukBoundsFromKeys,
} from "../../services/practice/requests.js";
import { buildZip, fileSlug } from "../../services/practice/zip.js";
import {
  DAY_MS,
  LOGO_MAX_BYTES,
  PRACTICE_READ_LIMIT,
  joinUrl,
  logoIsChecked,
  rateLimitByCaller,
  sniffLogoMime,
  staffInviteUrl,
} from "./shared.js";

declare module "fastify" {
  interface FastifyRequest {
    practiceMember?: MemberContext;
  }
}

/** Membership gate. 404 with code "no_practice" so the web can offer sign-up. */
async function requireMember(request: FastifyRequest, reply: FastifyReply) {
  const member = await loadMember(request.userId!);
  if (!member) {
    return reply.status(404).send({ error: "You are not part of a practice.", code: "no_practice" });
  }
  request.practiceMember = member;
}

/** Paused practices see nothing about clients and cannot invite. */
async function requireNotPaused(request: FastifyRequest, reply: FastifyReply) {
  if (request.practiceMember?.practice.suspendedAt) {
    return reply.status(403).send({
      error: "This practice account is paused. Email support@mileclear.com and we'll sort it.",
      code: "practice_paused",
    });
  }
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (request.practiceMember?.role !== "owner") {
    return reply.status(403).send({ error: "Only the practice owner can do that.", code: "owner_only" });
  }
}

const member = [authMiddleware, requireMember];
const active = [authMiddleware, requireMember, requireNotPaused];

const firmSchema = z.object({
  name: z.string().trim().min(2, "Enter the firm's name").max(160),
  contactName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a work email").max(255),
  phone: z.string().trim().max(40).optional().nullable(),
  professionalBody: z
    .enum(["ICAEW", "ACCA", "AAT", "ATT", "CIOT", "ICB", "IAB", "other", "none"])
    .optional()
    .nullable(),
  arn: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : v)),
});

const periodQuery = z.object({
  period: z.enum(["due", "current", "tax_year", "last_tax_year"]).optional(),
});

const clientParams = z.object({ clientId: z.string().uuid() });

function periodFor(request: FastifyRequest): PracticePeriod {
  const q = periodQuery.safeParse(request.query);
  return practicePeriod(ukDateKey(new Date()), q.success ? q.data.period : undefined);
}

/** "dave-mills-2026-27-q2" or "dave-mills-2026-27". */
function fileStem(name: string, period: PracticePeriod): string {
  const q = period.quarter ? `-q${period.quarter.index}` : "";
  return `mileclear-${fileSlug(name)}-${period.taxYear}${q}`;
}

/** Unique join code (retry on the rare collision). */
async function freshJoinCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = newJoinCode();
    const taken = await prisma.practice.findUnique({ where: { joinCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not make a join code");
}

/**
 * Client data gate: live link or a 403/404 that says why, with enough for
 * the page to show "Dave stopped sharing with you on 12 Oct."
 */
async function clientGate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ link: LiveLink; clientId: string } | null> {
  const params = clientParams.safeParse(request.params);
  if (!params.success) {
    reply.status(400).send({ error: "Invalid client" });
    return null;
  }
  const m = request.practiceMember!;
  const res = await resolveClientLink(m, params.data.clientId);
  if (!res.ok) {
    const p = problemResponse(res.code);
    let extra: Record<string, unknown> = {};
    // Name only for someone who shared before (stopped or ended), never
    // for an invite the driver has not answered.
    if (res.link?.startedAt) {
      const u = await prisma.user.findUnique({
        where: { id: params.data.clientId },
        select: { fullName: true, displayName: true },
      });
      extra = {
        linkId: res.link.id,
        clientName: u ? clientName(u) : null,
        endedAt: (res.link.endedAt ?? res.link.endsAt)?.toISOString() ?? null,
        endedBy: res.link.endedBy,
      };
    }
    reply.status(p.status).send({ error: p.error, code: p.code, ...extra });
    return null;
  }
  return { link: res.link, clientId: params.data.clientId };
}

async function log(
  request: FastifyRequest,
  clientUserId: string,
  action: PracticeAccessAction,
  detail?: Record<string, unknown>
) {
  const m = request.practiceMember!;
  return logPracticeAccess({ member: m, practice: m.practice, clientUserId, action, detail });
}

export async function practiceRoutes(app: FastifyInstance) {
  // Multipart only for the logo, scoped to this plugin.
  const { default: multipart } = await import("@fastify/multipart");
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  // ── Sign up ─────────────────────────────────────────────────────────────
  // POST /practice/signup: the signed-in user creates a practice and is its
  // owner. Free, open sign-up; the practice shows as "Not checked yet" to
  // drivers until an admin ticks it.
  app.post(
    "/signup",
    { preHandler: [authMiddleware], config: rateLimitByCaller("practice-signup", 5, "1 hour") },
    async (request, reply) => {
      const parsed = firmSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const userId = request.userId!;
      const already = await loadMember(userId);
      if (already) {
        return reply.status(409).send({ error: "You are already part of a practice.", code: "already_member" });
      }
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) return reply.status(401).send({ error: "Sign in again." });

      const d = parsed.data;
      const practice = await prisma.practice.create({
        data: {
          name: d.name,
          contactName: d.contactName,
          email: d.email.toLowerCase(),
          phone: d.phone || null,
          professionalBody: d.professionalBody ?? null,
          arn: d.arn || null,
          joinCode: await freshJoinCode(),
          members: {
            create: {
              userId,
              role: "owner",
              status: "active",
              invitedEmail: user.email.toLowerCase(),
              acceptedAt: new Date(),
            },
          },
        },
        select: { id: true, name: true },
      });

      // Drivers who invited this email before the practice existed.
      await attachDriverInvites(practice.id, [d.email, user.email]);

      logEvent("practice.created", userId, { practiceId: practice.id });
      return reply.status(201).send({ data: { id: practice.id, name: practice.name } });
    }
  );

  // ── The practice ────────────────────────────────────────────────────────
  app.get("/me", { preHandler: member }, async (request, reply) => {
    const m = request.practiceMember!;
    const p = await prisma.practice.findUnique({
      where: { id: m.practice.id },
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        professionalBody: true,
        arn: true,
        status: true,
        checkedAt: true,
        suspendedAt: true,
        joinCode: true,
        createdAt: true,
        logo: { select: { updatedAt: true, checkedAt: true, mime: true, bytes: true } },
      },
    });
    if (!p) return reply.status(404).send({ error: "Practice not found", code: "no_practice" });

    const user = await prisma.user.findUnique({ where: { id: m.userId }, select: { email: true } });
    const [openRequests, wantsToJoin, claimable] = await Promise.all([
      prisma.practiceRequest.count({ where: { practiceId: p.id, status: "open" } }),
      prisma.practiceLink.count({ where: { practiceId: p.id, status: "pending_practice" } }),
      findClaimable(p.id, [p.email, user?.email ?? ""]),
    ]);

    return reply.send({
      data: {
        practice: {
          id: p.id,
          name: p.name,
          contactName: p.contactName,
          email: p.email,
          phone: p.phone,
          professionalBody: p.professionalBody,
          arn: p.arn,
          checked: p.status === "checked",
          checkedAt: p.checkedAt?.toISOString() ?? null,
          paused: !!p.suspendedAt,
          joinCode: p.joinCode,
          joinUrl: joinUrl(p.joinCode),
          createdAt: p.createdAt.toISOString(),
          logo: p.logo
            ? {
                updatedAt: p.logo.updatedAt.toISOString(),
                // Shown to drivers only once checked.
                checked: logoIsChecked({ ...p, logo: p.logo }),
                mime: p.logo.mime,
                bytes: p.logo.bytes,
              }
            : null,
        },
        member: { id: m.memberId, role: m.role, name: m.name },
        counts: { openRequests, wantsToJoin, claimable: claimable.length },
      },
    });
  });

  // PATCH /practice/me: owner edits the firm's details. Changing the name
  // puts the practice back to "Not checked yet": a checked firm must not be
  // able to rename itself into a well-known one.
  app.patch("/me", { preHandler: [...member, requireOwner] }, async (request, reply) => {
    const parsed = firmSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
    const m = request.practiceMember!;
    const d = parsed.data;
    const current = await prisma.practice.findUnique({ where: { id: m.practice.id }, select: { name: true } });
    const renamed = d.name !== undefined && d.name !== current?.name;
    await prisma.practice.update({
      where: { id: m.practice.id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.contactName !== undefined ? { contactName: d.contactName } : {}),
        ...(d.email !== undefined ? { email: d.email.toLowerCase() } : {}),
        ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
        ...(d.professionalBody !== undefined ? { professionalBody: d.professionalBody } : {}),
        ...(d.arn !== undefined ? { arn: d.arn || null } : {}),
        ...(renamed ? { status: "unchecked", checkedAt: null, checkedByUserId: null } : {}),
      },
    });
    return reply.send({ data: { ok: true, recheck: renamed } });
  });

  // ── Logo ────────────────────────────────────────────────────────────────
  // Drivers see the initials tile until an admin has checked the practice
  // AND this logo. A new logo goes back to initials until re-checked.
  app.post("/logo", { preHandler: [...member, requireOwner] }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "Attach an image file" });
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.status(413).send({ error: "Image too large. Use one under 512 KB." });
    }
    const mime = sniffLogoMime(buf);
    if (!mime) return reply.status(400).send({ error: "The logo must be a PNG, JPEG or WebP image." });
    if (buf.length > LOGO_MAX_BYTES) {
      return reply.status(413).send({ error: "Image too large. Use one under 512 KB (400 px wide is plenty)." });
    }
    if (mime !== "image/webp" && !canSafelyEmbedImage(buf, mime)) {
      return reply.status(400).send({ error: "That image couldn't be read. Save it as a standard PNG or JPEG and try again." });
    }
    const m = request.practiceMember!;
    const now = new Date();
    const bytes = new Uint8Array(buf);
    await prisma.practiceLogo.upsert({
      where: { practiceId: m.practice.id },
      create: { practiceId: m.practice.id, data: bytes, mime, bytes: buf.length, updatedAt: now, checkedAt: null },
      update: { data: bytes, mime, bytes: buf.length, updatedAt: now, checkedAt: null },
    });
    logEvent("practice.logo_uploaded", request.userId!, { practiceId: m.practice.id, bytes: buf.length, mime });
    return reply.send({ data: { ok: true, bytes: buf.length, mime } });
  });

  app.get("/logo", { preHandler: member }, async (request, reply) => {
    const logo = await prisma.practiceLogo.findUnique({ where: { practiceId: request.practiceMember!.practice.id } });
    if (!logo) return reply.status(404).send({ error: "No logo uploaded" });
    return reply.header("Content-Type", logo.mime).header("Cache-Control", "private, no-store").send(Buffer.from(logo.data));
  });

  app.delete("/logo", { preHandler: [...member, requireOwner] }, async (request, reply) => {
    await prisma.practiceLogo.deleteMany({ where: { practiceId: request.practiceMember!.practice.id } });
    return reply.send({ data: { deleted: true } });
  });

  // ── Join link and QR ────────────────────────────────────────────────────
  app.post("/join-link/reset", { preHandler: [...active, requireOwner] }, async (request, reply) => {
    const code = await freshJoinCode();
    await prisma.practice.update({ where: { id: request.practiceMember!.practice.id }, data: { joinCode: code } });
    return reply.send({ data: { joinCode: code, joinUrl: joinUrl(code) } });
  });

  // GET /practice/join-qr?format=svg|png: one source for both downloads.
  app.get("/join-qr", { preHandler: member }, async (request, reply) => {
    const format = (request.query as { format?: string }).format === "png" ? "png" : "svg";
    const p = await prisma.practice.findUnique({
      where: { id: request.practiceMember!.practice.id },
      select: { joinCode: true },
    });
    if (!p) return reply.status(404).send({ error: "Practice not found" });
    const url = joinUrl(p.joinCode);
    const filename = `mileclear-join-${p.joinCode.toLowerCase()}.${format}`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    if (format === "png") {
      const png = await QRCode.toBuffer(url, { type: "png", margin: 2, width: 640, errorCorrectionLevel: "M" });
      return reply.header("Content-Type", "image/png").send(png);
    }
    const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
    return reply.header("Content-Type", "image/svg+xml").send(svg);
  });

  // ── Old accountant links (A15) ──────────────────────────────────────────
  app.post(
    "/claim",
    { preHandler: active, config: rateLimitByCaller("practice-claim", 5, "1 hour") },
    async (request, reply) => {
      const m = request.practiceMember!;
      const [p, user] = await Promise.all([
        prisma.practice.findUnique({ where: { id: m.practice.id }, select: { email: true } }),
        prisma.user.findUnique({ where: { id: m.userId }, select: { email: true } }),
      ]);
      const asked = await claimOldLinks(m, [p?.email ?? "", user?.email ?? ""]);
      logEvent("practice.claimed_old_links", request.userId!, { practiceId: m.practice.id, asked });
      return reply.send({ data: { asked } });
    }
  );

  // ── Invites ─────────────────────────────────────────────────────────────
  const inviteBody = z.object({
    email: z.string().trim().email("Enter a valid email").max(255),
    name: z.string().trim().max(120).optional().nullable(),
  });

  /** A practice can send at most this many invites a day. */
  const DAILY_INVITE_CAP = 500;
  async function invitesToday(practiceId: string): Promise<number> {
    return prisma.practiceLink.count({
      where: { practiceId, invitedAt: { gte: new Date(Date.now() - DAY_MS) }, startedBy: "practice" },
    });
  }

  app.post(
    "/invites",
    { preHandler: active, config: rateLimitByCaller("practice-invite", 30, "1 minute") },
    async (request, reply) => {
      const parsed = inviteBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const m = request.practiceMember!;
      if ((await invitesToday(m.practice.id)) >= DAILY_INVITE_CAP) {
        return reply.status(429).send({ error: "That's a lot of invites for one day. Try again tomorrow." });
      }
      const outcome = await inviteClient({ member: m, email: parsed.data.email, name: parsed.data.name ?? null });
      return reply.send({ data: { outcome } });
    }
  );

  const pasteBody = z.object({ text: z.string().max(40_000) });

  app.post(
    "/invites/check",
    { preHandler: active, config: rateLimitByCaller("practice-invite-check", 30, "1 minute") },
    async (request, reply) => {
      const parsed = pasteBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Paste a list of emails." });
      const entries = parsePastedInvites(parsed.data.text);
      if (entries.length > PRACTICE_BULK_INVITE_MAX + 50) {
        return reply.status(400).send({ error: `Up to ${PRACTICE_BULK_INVITE_MAX} at a time.` });
      }
      const rows = await classifyInvites(request.practiceMember!.practice.id, entries);
      return reply.send({ data: { rows } });
    }
  );

  app.post(
    "/invites/bulk",
    { preHandler: active, config: rateLimitByCaller("practice-invite-bulk", 5, "10 minutes") },
    async (request, reply) => {
      const parsed = pasteBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Paste a list of emails." });
      const m = request.practiceMember!;
      const room = DAILY_INVITE_CAP - (await invitesToday(m.practice.id));
      if (room <= 0) {
        return reply.status(429).send({ error: "That's a lot of invites for one day. Try again tomorrow." });
      }
      const { rows, sent } = await inviteFromText(m, parsed.data.text, Math.min(PRACTICE_BULK_INVITE_MAX, room));
      logEvent("practice.bulk_invited", request.userId!, { practiceId: m.practice.id, sent, lines: rows.length });
      return reply.send({ data: { sent, rows } });
    }
  );

  // ── Links (waiting group) ───────────────────────────────────────────────
  const linkParams = z.object({ linkId: z.string().uuid() });

  async function ownLink(request: FastifyRequest, reply: FastifyReply) {
    const params = linkParams.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ error: "Invalid link" });
      return null;
    }
    const link = await prisma.practiceLink.findFirst({
      where: { id: params.data.linkId, practiceId: request.practiceMember!.practice.id },
      include: { client: { select: { id: true, email: true, fullName: true, displayName: true } } },
    });
    if (!link) {
      reply.status(404).send({ error: "Not found" });
      return null;
    }
    return link;
  }

  app.post(
    "/links/:linkId/resend",
    { preHandler: active, config: rateLimitByCaller("practice-resend", 30, "1 minute") },
    async (request, reply) => {
      const link = await ownLink(request, reply);
      if (!link) return;
      if (link.status !== "invited") return reply.status(409).send({ error: "This invite can't be resent." });
      const last = link.lastResentAt ?? link.invitedAt;
      const expired = !link.inviteExpiresAt || link.inviteExpiresAt.getTime() <= Date.now();
      if (!expired && last && Date.now() - last.getTime() < 3 * DAY_MS) {
        return reply.status(429).send({ error: "You can resend 3 days after the last one." });
      }
      const to = link.client?.email ?? link.invitedEmail;
      if (!to) return reply.status(409).send({ error: "No email for this invite." });
      const token = newInviteToken();
      const now = new Date();
      await prisma.practiceLink.update({
        where: { id: link.id },
        data: {
          inviteTokenHash: hashToken(token),
          inviteExpiresAt: new Date(now.getTime() + PRACTICE_INVITE_DAYS * DAY_MS),
          lastResentAt: now,
          ...(expired ? { invitedAt: now } : {}),
        },
      });
      const m = request.practiceMember!;
      await deliverClientInvite({
        to,
        token,
        practiceName: m.practice.name,
        inviterName: m.name,
        clientUserId: link.clientUserId,
        linkId: link.id,
      });
      return reply.send({ data: { ok: true } });
    }
  );

  app.post("/links/:linkId/cancel", { preHandler: member }, async (request, reply) => {
    const link = await ownLink(request, reply);
    if (!link) return;
    if (link.status !== "invited") return reply.status(409).send({ error: "Only an unanswered invite can be cancelled." });
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: { status: "cancelled", inviteTokenHash: null, inviteExpiresAt: null },
    });
    return reply.send({ data: { ok: true } });
  });

  // A driver asked to share (join link or from the app). Accepting makes it
  // live: the driver already said yes on the consent screen.
  app.post("/links/:linkId/accept", { preHandler: active }, async (request, reply) => {
    const link = await ownLink(request, reply);
    if (!link) return;
    if (link.status !== "pending_practice" || !link.consentedAt || !link.clientUserId) {
      return reply.status(409).send({ error: "There is nothing to accept here." });
    }
    const m = request.practiceMember!;
    const now = new Date();
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: { status: "active", startedAt: now, endsAt: linkEndsAt(now), endedAt: null, endedBy: null },
    });
    await logPracticeAccess({
      member: null,
      practice: m.practice,
      clientUserId: link.clientUserId,
      action: "started_sharing",
    });
    sendPushToUser(
      link.clientUserId,
      m.practice.name,
      "Accepted you as a client. They can now see your business records.",
      { action: "practice_sharing" }
    ).catch(() => {});
    logEvent("practice.link_accepted", request.userId!, { practiceId: m.practice.id, linkId: link.id });
    return reply.send({ data: { ok: true } });
  });

  app.post("/links/:linkId/decline", { preHandler: member }, async (request, reply) => {
    const link = await ownLink(request, reply);
    if (!link) return;
    if (link.status !== "pending_practice") return reply.status(409).send({ error: "There is nothing to decline here." });
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: { status: "declined", endedAt: new Date(), endedBy: "practice" },
    });
    return reply.send({ data: { ok: true } });
  });

  // "Ask again" after sharing ended: a fresh ask the driver answers in the
  // app. Once a month at most.
  app.post("/links/:linkId/ask-again", { preHandler: active }, async (request, reply) => {
    const link = await ownLink(request, reply);
    if (!link) return;
    const now = new Date();
    const endedByDate = link.status === "active" && (!link.endsAt || link.endsAt.getTime() <= now.getTime());
    if (!(link.status === "ended" || endedByDate) || !link.client) {
      return reply.status(409).send({ error: "Sharing hasn't ended for this client." });
    }
    if (link.askedAgainAt && now.getTime() - link.askedAgainAt.getTime() < 30 * DAY_MS) {
      return reply.status(429).send({ error: "You can ask again once a month." });
    }
    const m = request.practiceMember!;
    const token = newInviteToken();
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: {
        status: "invited",
        startedBy: "practice",
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(now.getTime() + PRACTICE_INVITE_DAYS * DAY_MS),
        invitedAt: now,
        askedAgainAt: now,
        consentedAt: null,
        startedAt: null,
        endsAt: null,
        renewalAskedAt: null,
        renewalRemindedAt: null,
        createdByMemberId: m.memberId,
      },
    });
    await deliverClientInvite({
      to: link.client.email,
      token,
      practiceName: m.practice.name,
      inviterName: m.name,
      clientUserId: link.client.id,
      linkId: link.id,
    });
    return reply.send({ data: { ok: true } });
  });

  // ── Client list ─────────────────────────────────────────────────────────
  app.get("/clients", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const m = request.practiceMember!;
    const q = periodQuery.safeParse(request.query);
    const now = new Date();
    const result = await loadClientList(m.practice, q.success ? q.data.period : undefined, now);

    // The list shows each client's totals, so it is a read too. Logged
    // once per client per day, not on every refresh, so the driver's log
    // stays readable.
    const ids = result.clients.map((c) => c.clientId);
    if (ids.length) {
      const dayStart = ukBoundsFromKeys(ukDateKey(now), ukDateKey(now)).start;
      const already = await prisma.practiceAccessLog.findMany({
        where: { practiceId: m.practice.id, action: "viewed_list", clientUserId: { in: ids }, createdAt: { gte: dayStart } },
        select: { clientUserId: true },
      });
      const done = new Set(already.map((a) => a.clientUserId));
      const fresh = ids.filter((id) => !done.has(id));
      if (fresh.length) {
        await prisma.practiceAccessLog.createMany({
          data: fresh.map((clientUserId) => ({
            practiceId: m.practice.id,
            practiceName: m.practice.name,
            memberId: m.memberId,
            actorName: m.name,
            clientUserId,
            action: "viewed_list",
          })),
        });
      }
    }

    return reply.send({
      data: {
        period: result.period,
        quarter: result.quarter,
        clients: result.clients,
        waiting: result.waiting,
        ended: result.ended,
      },
    });
  });

  // ── Client page ─────────────────────────────────────────────────────────
  app.get("/clients/:clientId", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    const { link, clientId } = gate;
    const period = periodFor(request);
    const logged = await log(request, clientId, "viewed_client", { period: period.key, taxYear: period.taxYear });

    const now = new Date();
    const todayKey = ukDateKey(now);
    const bounds = ukBoundsFromKeys(period.start, period.end);
    const tyStartYear = taxYearStartYear(period.end);
    const quarters = mtdQuarters(tyStartYear);
    const tyBounds = ukBoundsFromKeys(quarters[0].start, quarters[3].end);
    const dateRange = { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) };

    await refreshAutoRequests([clientId], now);

    const [user, figures, expenses, unsorted, recentTrips, businessCount, hmrc, sent, requests] = await Promise.all([
      prisma.user.findUnique({
        where: { id: clientId },
        select: {
          fullName: true,
          displayName: true,
          workType: true,
          lastTripAt: true,
          vehicles: { select: { vehicleType: true, isPrimary: true } },
        },
      }),
      loadPeriodFigures(clientId, bounds),
      link.shareExpenses
        ? prisma.expense.aggregate({ where: { userId: clientId, date: dateRange }, _sum: { amountPence: true }, _count: { _all: true } })
        : null,
      prisma.trip.aggregate({
        where: {
          userId: clientId,
          isPhantomTrip: false,
          classification: "unclassified",
          startedAt: { gte: tyBounds.start, lte: tyBounds.end },
        },
        _count: { _all: true },
        _min: { startedAt: true },
        _max: { startedAt: true },
      }),
      prisma.trip.findMany({
        where: { userId: clientId, isPhantomTrip: false, classification: "business", startedAt: { gte: bounds.start, lte: bounds.end } },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: tripRowSelect,
      }),
      prisma.trip.count({
        where: { userId: clientId, isPhantomTrip: false, classification: "business", startedAt: { gte: bounds.start, lte: bounds.end } },
      }),
      prisma.hmrcConnection.findFirst({ where: { userId: clientId, disconnectedAt: null }, select: { id: true } }),
      loadMtdSent([clientId], tyBounds.start),
      prisma.practiceRequest.findMany({
        where: { practiceId: link.practiceId!, clientUserId: clientId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: requestSelect,
      }),
    ]);
    if (!user) return reply.status(404).send({ error: "This client's account was closed.", code: "account_closed" });

    const employee = user.workType === "employee";
    const earningsShared = link.shareEarnings && !employee;
    const primary = user.vehicles.find((v) => v.isPrimary) ?? user.vehicles[0];
    const daysQuiet = user.lastTripAt ? Math.floor((now.getTime() - user.lastTripAt.getTime()) / DAY_MS) : null;

    const chase: Array<Record<string, unknown>> = [];
    if (unsorted._count._all > 0) {
      chase.push({
        kind: "sort_trips",
        count: unsorted._count._all,
        from: unsorted._min.startedAt?.toISOString() ?? null,
        to: unsorted._max.startedAt?.toISOString() ?? null,
      });
    }
    if (earningsShared && figures.earningsCount === 0) chase.push({ kind: "no_earnings" });
    if (daysQuiet !== null && daysQuiet >= 14) chase.push({ kind: "quiet", days: daysQuiet });

    return reply.send({
      data: {
        client: {
          id: clientId,
          name: clientName(user),
          workType: user.workType,
          vehicleType: primary?.vehicleType ?? null,
          lastTripAt: user.lastTripAt?.toISOString() ?? null,
        },
        link: shapeLink(link),
        period,
        figures: {
          businessMiles: Math.round(figures.businessMiles * 10) / 10,
          businessTrips: businessCount,
          claimPence: figures.claimPence,
          earningsShared,
          earningsPence: earningsShared ? figures.earningsPence : null,
          earningsCount: earningsShared ? figures.earningsCount : null,
          expensesShared: link.shareExpenses,
          expensesPence: expenses ? expenses._sum.amountPence ?? 0 : null,
          expensesCount: expenses ? expenses._count._all : null,
          toSort: unsorted._count._all,
          toSortFrom: unsorted._min.startedAt?.toISOString() ?? null,
          toSortTo: unsorted._max.startedAt?.toISOString() ?? null,
        },
        quarters: quarters.map((q) => ({
          ...q,
          update: updateState({
            connected: !!hmrc,
            sentAt: sentForQuarter(sent.get(clientId), q),
            quarter: q,
            todayKey,
          }),
        })),
        recentTrips: recentTrips.map(shapeTrip),
        chase,
        requests: requests.map(shapeRequest),
        accessLoggedAt: logged.createdAt.toISOString(),
      },
    });
  });

  app.get("/clients/:clientId/trips", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    const { link, clientId } = gate;
    const period = periodFor(request);
    const q = z
      .object({ show: z.enum(["business", "personal", "all"]).optional(), page: z.coerce.number().int().min(1).max(1000).optional() })
      .safeParse(request.query);
    const show = q.success ? q.data.show ?? "business" : "business";
    const page = q.success ? q.data.page ?? 1 : 1;
    const classes = visibleClassifications(link, show);
    await log(request, clientId, "viewed_trips", { period: period.key, taxYear: period.taxYear, show: classes.join(",") });

    const bounds = ukBoundsFromKeys(period.start, period.end);
    const where = {
      userId: clientId,
      isPhantomTrip: false,
      classification: { in: classes },
      startedAt: { gte: bounds.start, lte: bounds.end },
    };
    const PAGE = 50;
    const [total, rows, unsorted] = await Promise.all([
      prisma.trip.count({ where }),
      prisma.trip.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, select: tripRowSelect }),
      // Unsorted trips: a count and dates, never addresses.
      prisma.trip.aggregate({
        where: { userId: clientId, isPhantomTrip: false, classification: "unclassified", startedAt: { gte: bounds.start, lte: bounds.end } },
        _count: { _all: true },
        _min: { startedAt: true },
        _max: { startedAt: true },
      }),
    ]);
    return reply.send({
      data: {
        period,
        show: link.sharePersonalTrips ? show : "business",
        personalShared: link.sharePersonalTrips,
        unsorted: {
          count: unsorted._count._all,
          from: unsorted._min.startedAt?.toISOString() ?? null,
          to: unsorted._max.startedAt?.toISOString() ?? null,
        },
        trips: rows.map(shapeTrip),
        page,
        pageSize: PAGE,
        total,
      },
    });
  });

  app.get("/clients/:clientId/earnings", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    const { link, clientId } = gate;
    const period = periodFor(request);
    if (!link.shareEarnings) {
      return reply.send({ data: { period, shared: false, earnings: [], byPlatform: [], byMonth: [], totalPence: 0 } });
    }
    await log(request, clientId, "viewed_earnings", { period: period.key, taxYear: period.taxYear });
    const rows = await prisma.earning.findMany({
      where: {
        userId: clientId,
        periodStart: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) },
      },
      orderBy: { periodStart: "desc" },
      select: { id: true, platform: true, amountPence: true, periodStart: true, periodEnd: true, source: true },
      take: 2000,
    });
    const label = (p: string) => GIG_PLATFORMS.find((g) => g.value === p)?.label ?? p;
    const byPlatform = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const e of rows) {
      byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + e.amountPence);
      const month = e.periodStart.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + e.amountPence);
    }
    return reply.send({
      data: {
        period,
        shared: true,
        earnings: rows.map((e) => ({
          id: e.id,
          date: e.periodStart.toISOString().slice(0, 10),
          periodEnd: e.periodEnd.toISOString().slice(0, 10),
          platform: e.platform,
          platformLabel: label(e.platform),
          amountPence: e.amountPence,
          source: e.source,
        })),
        byPlatform: [...byPlatform.entries()]
          .map(([platform, totalPence]) => ({ platform, label: label(platform), totalPence }))
          .sort((a, b) => b.totalPence - a.totalPence),
        byMonth: [...byMonth.entries()].map(([month, totalPence]) => ({ month, totalPence })).sort((a, b) => a.month.localeCompare(b.month)),
        totalPence: rows.reduce((n, e) => n + e.amountPence, 0),
      },
    });
  });

  app.get("/clients/:clientId/expenses", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    const { link, clientId } = gate;
    const period = periodFor(request);
    if (!link.shareExpenses) {
      return reply.send({ data: { period, shared: false, expenses: [], byCategory: [], totalPence: 0 } });
    }
    await log(request, clientId, "viewed_expenses", { period: period.key, taxYear: period.taxYear });
    const rows = await prisma.expense.findMany({
      where: {
        userId: clientId,
        date: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T00:00:00Z`) },
      },
      orderBy: { date: "desc" },
      select: { id: true, category: true, amountPence: true, date: true, description: true, vendor: true },
      take: 2000,
    });
    const meta = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c);
    const byCategory = new Map<string, number>();
    for (const e of rows) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountPence);
    return reply.send({
      data: {
        period,
        shared: true,
        expenses: rows.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          category: e.category,
          label: meta(e.category)?.label ?? e.category,
          amountPence: e.amountPence,
          description: e.description,
          vendor: e.vendor,
          deductibleWithMileage: meta(e.category)?.deductibleWithMileage ?? true,
        })),
        byCategory: [...byCategory.entries()]
          .map(([category, totalPence]) => ({
            category,
            label: meta(category)?.label ?? category,
            totalPence,
            deductibleWithMileage: meta(category)?.deductibleWithMileage ?? true,
          }))
          .sort((a, b) => b.totalPence - a.totalPence),
        totalPence: rows.reduce((n, e) => n + e.amountPence, 0),
      },
    });
  });

  app.get("/clients/:clientId/details", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    const { link, clientId } = gate;
    await log(request, clientId, "viewed_details");
    const [user, hmrc] = await Promise.all([
      prisma.user.findUnique({
        where: { id: clientId },
        select: {
          email: true,
          fullName: true,
          displayName: true,
          workType: true,
          vehicles: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              registrationPlate: true,
              vehicleType: true,
              fuelType: true,
              isPrimary: true,
              providedByOthers: true,
            },
          },
        },
      }),
      prisma.hmrcConnection.findFirst({ where: { userId: clientId, disconnectedAt: null }, select: { id: true } }),
    ]);
    if (!user) return reply.status(404).send({ error: "This client's account was closed.", code: "account_closed" });
    return reply.send({
      data: {
        name: clientName(user),
        email: user.email,
        workType: user.workType,
        vehicles: user.vehicles,
        usesMtd: !!hmrc,
        link: shapeLink(link),
      },
    });
  });

  app.get("/clients/:clientId/requests", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const gate = await clientGate(request, reply);
    if (!gate) return;
    await refreshAutoRequests([gate.clientId]);
    const rows = await prisma.practiceRequest.findMany({
      where: { practiceId: gate.link.practiceId!, clientUserId: gate.clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: requestSelect,
    });
    return reply.send({ data: rows.map(shapeRequest) });
  });

  // ── Exports ─────────────────────────────────────────────────────────────
  // Business trips only, always: the personal switch shows personal trips
  // on screen, but downloads stay business records.
  const exportQuery = z.object({
    format: z.enum(["csv", "pdf", "summary"]),
    period: z.enum(["due", "current", "tax_year", "last_tax_year"]).optional(),
  });

  async function buildExport(
    request: FastifyRequest,
    link: LiveLink,
    clientId: string,
    name: string,
    format: "csv" | "pdf" | "summary",
    period: PracticePeriod
  ): Promise<{ filename: string; data: Buffer; contentType: string }> {
    const bounds = ukBoundsFromKeys(period.start, period.end);
    const stem = fileStem(name, period);
    if (format === "csv") {
      await log(request, clientId, "exported_csv", { taxYear: period.taxYear, period: period.key });
      const csv = await generateTripsCsv(clientId, { from: bounds.start, to: bounds.end, classification: "business" });
      return { filename: `${stem}-trips.csv`, data: Buffer.from(csv, "utf8"), contentType: "text/csv" };
    }
    if (format === "pdf") {
      await log(request, clientId, "exported_pdf", { taxYear: period.taxYear, period: period.key });
      const pdf = await generateTripsPdf(clientId, { from: bounds.start, to: bounds.end, classification: "business" });
      return { filename: `${stem}-trips.pdf`, data: pdf, contentType: "application/pdf" };
    }
    await log(request, clientId, "exported_summary", { taxYear: period.taxYear });
    const pdf = await generateSelfAssessmentPdf(clientId, period.taxYear, {
      businessOnly: true,
      includeEarnings: link.shareEarnings,
    });
    return {
      filename: `mileclear-${fileSlug(name)}-${period.taxYear}-summary.pdf`,
      data: pdf,
      contentType: "application/pdf",
    };
  }

  app.get(
    "/clients/:clientId/export",
    { preHandler: active, config: rateLimitByCaller("practice-export", 60, "1 minute") },
    async (request, reply) => {
      const q = exportQuery.safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: "format must be csv, pdf or summary" });
      const gate = await clientGate(request, reply);
      if (!gate) return;
      const user = await prisma.user.findUnique({ where: { id: gate.clientId }, select: { fullName: true, displayName: true } });
      const name = user ? clientName(user) : "client";
      const period = practicePeriod(ukDateKey(new Date()), q.data.period);
      const file = await buildExport(request, gate.link, gate.clientId, name, q.data.format, period);
      return reply
        .header("Content-Type", file.contentType)
        .header("Content-Disposition", `attachment; filename="${file.filename}"`)
        .send(file.data);
    }
  );

  // POST /practice/export: selected clients as one zip.
  app.post(
    "/export",
    { preHandler: active, config: rateLimitByCaller("practice-export-zip", 6, "1 minute") },
    async (request, reply) => {
      const parsed = z
        .object({
          clientIds: z.array(z.string().uuid()).min(1).max(100),
          format: z.enum(["csv", "pdf", "summary"]),
          period: z.enum(["due", "current", "tax_year", "last_tax_year"]).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "Choose up to 100 clients and a format." });
      const m = request.practiceMember!;
      const period = practicePeriod(ukDateKey(new Date()), parsed.data.period);
      const files: { name: string; data: Buffer }[] = [];
      let skipped = 0;
      const usedNames = new Set<string>();
      for (const clientId of [...new Set(parsed.data.clientIds)]) {
        const res = await resolveClientLink(m, clientId);
        if (!res.ok) {
          skipped++;
          continue;
        }
        const user = await prisma.user.findUnique({ where: { id: clientId }, select: { fullName: true, displayName: true } });
        if (!user) {
          skipped++;
          continue;
        }
        const file = await buildExport(request, res.link, clientId, clientName(user), parsed.data.format, period);
        let fname = file.filename;
        for (let i = 2; usedNames.has(fname); i++) fname = file.filename.replace(/(\.\w+)$/, `-${i}$1`);
        usedNames.add(fname);
        files.push({ name: fname, data: file.data });
      }
      if (files.length === 0) return reply.status(403).send({ error: "None of these clients are sharing with you." });
      const zip = buildZip(files.map((f) => ({ name: f.name, data: f.data })));
      const q = period.quarter ? `-q${period.quarter.index}` : "";
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="mileclear-clients-${period.taxYear}${q}.zip"`)
        .header("X-Skipped-Clients", String(skipped))
        .send(zip);
    }
  );

  // ── Requests ────────────────────────────────────────────────────────────
  const requestBody = z.object({
    clientIds: z.array(z.string().uuid()).min(1).max(500),
    type: z.enum(["sort_trips", "add_earnings", "add_expenses", "check_details", "other"]),
    note: z.string().trim().max(PRACTICE_NOTE_MAX).optional().nullable(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    period: z.enum(["due", "current", "tax_year", "last_tax_year"]).optional(),
  });

  app.post(
    "/requests",
    { preHandler: active, config: rateLimitByCaller("practice-request", 20, "1 minute") },
    async (request, reply) => {
      const parsed = requestBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const { type, note, dueDate } = parsed.data;
      if (type === "other" && !note) {
        return reply.status(400).send({ error: "Add a note so your client knows what you need." });
      }
      const m = request.practiceMember!;
      const now = new Date();
      const todayKey = ukDateKey(now);
      const period = practicePeriod(todayKey, parsed.data.period);
      const ty = mtdQuarters(taxYearStartYear(todayKey));

      const sent: string[] = [];
      const updated: string[] = [];
      const nothingToSort: string[] = [];
      const overLimit: string[] = [];
      const notSharing: string[] = [];
      const notShared: string[] = [];

      for (const clientId of [...new Set(parsed.data.clientIds)]) {
        const res = await resolveClientLink(m, clientId, now);
        if (!res.ok) {
          notSharing.push(clientId);
          continue;
        }
        if ((type === "add_earnings" && !res.link.shareEarnings) || (type === "add_expenses" && !res.link.shareExpenses)) {
          notShared.push(clientId);
          continue;
        }
        let countAtSend: number | null = null;
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        if (type === "sort_trips") {
          const tyBounds = ukBoundsFromKeys(ty[0].start, ty[3].end);
          countAtSend = await prisma.trip.count({
            where: {
              userId: clientId,
              isPhantomTrip: false,
              classification: "unclassified",
              startedAt: { gte: tyBounds.start, lte: tyBounds.end },
            },
          });
          if (countAtSend === 0) {
            nothingToSort.push(clientId);
            continue;
          }
          periodStart = ty[0].start;
          periodEnd = ty[3].end;
        } else if (type === "add_earnings" || type === "add_expenses") {
          periodStart = period.start;
          periodEnd = period.end;
        }

        // One open request of a type per client: sending again updates it.
        const existing = await prisma.practiceRequest.findFirst({
          where: { practiceId: m.practice.id, clientUserId: clientId, type, status: "open" },
          select: { id: true },
        });
        if (existing) {
          await prisma.practiceRequest.update({
            where: { id: existing.id },
            data: {
              note: note || null,
              dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
              ...(countAtSend !== null ? { countAtSend } : {}),
            },
          });
          updated.push(clientId);
          continue;
        }

        const lastWeek = await prisma.practiceRequest.count({
          where: { practiceId: m.practice.id, clientUserId: clientId, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
        });
        if (lastWeek >= PRACTICE_REQUESTS_PER_WEEK) {
          overLimit.push(clientId);
          continue;
        }

        const created = await prisma.practiceRequest.create({
          data: {
            practiceId: m.practice.id,
            clientUserId: clientId,
            type,
            note: note || null,
            dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
            periodStart: periodStart ? new Date(`${periodStart}T00:00:00Z`) : null,
            periodEnd: periodEnd ? new Date(`${periodEnd}T00:00:00Z`) : null,
            countAtSend,
            createdByMemberId: m.memberId,
            createdByName: m.name,
          },
          select: requestSelect,
        });
        await log(request, clientId, "sent_request", { type });
        const shaped = shapeRequest(created);
        sendPushToUser(
          clientId,
          m.practice.name,
          `${shaped.title}.${shaped.dueDate ? ` Due ${formatDue(shaped.dueDate)}.` : ""}`,
          { action: "practice_request", requestId: created.id }
        ).catch(() => {});
        sent.push(clientId);
      }

      return reply.send({
        data: { sent: sent.length, updated: updated.length, nothingToSort, overLimit, notSharing, notShared },
      });
    }
  );

  app.get("/requests", { preHandler: active, config: PRACTICE_READ_LIMIT }, async (request, reply) => {
    const m = request.practiceMember!;
    const status = (request.query as { status?: string }).status;
    const clients = await prisma.practiceLink.findMany({
      where: { practiceId: m.practice.id, clientUserId: { not: null } },
      select: { clientUserId: true },
    });
    await refreshAutoRequests(clients.map((c) => c.clientUserId!));
    const rows = await prisma.practiceRequest.findMany({
      where: {
        practiceId: m.practice.id,
        ...(status === "done" ? { status: "done" } : status === "all" ? {} : { status: "open" }),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { ...requestSelect, client: { select: { id: true, fullName: true, displayName: true } } },
    });
    return reply.send({
      data: rows.map((r) => ({ ...shapeRequest(r), client: { id: r.client.id, name: clientName(r.client) } })),
    });
  });

  const requestParams = z.object({ requestId: z.string().uuid() });

  app.post("/requests/:requestId/cancel", { preHandler: member }, async (request, reply) => {
    const p = requestParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid request" });
    const res = await prisma.practiceRequest.updateMany({
      where: { id: p.data.requestId, practiceId: request.practiceMember!.practice.id, status: "open" },
      data: { status: "cancelled" },
    });
    if (res.count === 0) return reply.status(404).send({ error: "No open request found." });
    return reply.send({ data: { ok: true } });
  });

  app.post("/requests/:requestId/remind", { preHandler: active }, async (request, reply) => {
    const p = requestParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid request" });
    const m = request.practiceMember!;
    const r = await prisma.practiceRequest.findFirst({
      where: { id: p.data.requestId, practiceId: m.practice.id, status: "open" },
      select: requestSelect,
    });
    if (!r) return reply.status(404).send({ error: "No open request found." });
    const last = r.lastRemindedAt ?? r.createdAt;
    if (Date.now() - last.getTime() < 3 * DAY_MS) {
      const next = new Date(last.getTime() + 3 * DAY_MS);
      return reply.status(429).send({ error: "You can remind once every 3 days.", nextAt: next.toISOString() });
    }
    const live = await resolveClientLink(m, r.clientUserId);
    if (!live.ok) return reply.status(403).send(problemResponse(live.code));
    await prisma.practiceRequest.update({ where: { id: r.id }, data: { lastRemindedAt: new Date() } });
    const shaped = shapeRequest(r);
    sendPushToUser(r.clientUserId, m.practice.name, `Reminder: ${shaped.title}.`, {
      action: "practice_request",
      requestId: r.id,
    }).catch(() => {});
    return reply.send({ data: { ok: true } });
  });

  // ── Staff ───────────────────────────────────────────────────────────────
  app.get("/staff", { preHandler: member }, async (request, reply) => {
    const rows = await prisma.practiceMember.findMany({
      where: { practiceId: request.practiceMember!.practice.id, status: { in: ["active", "invited"] } },
      orderBy: [{ role: "asc" }, { invitedAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        invitedEmail: true,
        invitedAt: true,
        acceptedAt: true,
        inviteExpiresAt: true,
        user: { select: { fullName: true, displayName: true, email: true } },
      },
    });
    return reply.send({
      data: rows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        name: r.user ? r.user.fullName || r.user.displayName || null : null,
        email: r.user?.email ?? r.invitedEmail,
        invitedAt: r.invitedAt.toISOString(),
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        inviteExpired: r.status === "invited" && (!r.inviteExpiresAt || r.inviteExpiresAt.getTime() <= Date.now()),
        isYou: r.id === request.practiceMember!.memberId,
      })),
    });
  });

  app.post(
    "/staff",
    { preHandler: [...active, requireOwner], config: rateLimitByCaller("practice-staff", 10, "1 hour") },
    async (request, reply) => {
      const parsed = z.object({ email: z.string().trim().email("Enter a valid email").max(255) }).safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
      const m = request.practiceMember!;
      const email = parsed.data.email.toLowerCase();
      const count = await prisma.practiceMember.count({
        where: { practiceId: m.practice.id, status: { in: ["active", "invited"] } },
      });
      const existing = await prisma.practiceMember.findUnique({
        where: { practiceId_invitedEmail: { practiceId: m.practice.id, invitedEmail: email } },
      });
      if (existing?.status === "active") return reply.status(409).send({ error: "They're already in your practice." });
      if (!existing && count >= PRACTICE_STAFF_CAP) {
        return reply.status(409).send({ error: `Up to ${PRACTICE_STAFF_CAP} people per practice for now.` });
      }
      const token = newInviteToken();
      const data = {
        role: "staff",
        status: "invited",
        userId: null,
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + PRACTICE_INVITE_DAYS * DAY_MS),
        invitedAt: new Date(),
        removedAt: null,
      };
      if (existing) {
        await prisma.practiceMember.update({ where: { id: existing.id }, data });
      } else {
        await prisma.practiceMember.create({ data: { ...data, practiceId: m.practice.id, invitedEmail: email } });
      }
      try {
        await sendPracticeStaffInviteEmail({
          to: email,
          practiceName: m.practice.name,
          inviterName: m.name,
          url: staffInviteUrl(token),
        });
      } catch (err) {
        request.log.error({ err: (err as Error)?.message }, "practice staff invite email failed");
      }
      return reply.status(201).send({ data: { ok: true } });
    }
  );

  app.delete("/staff/:memberId", { preHandler: [...member, requireOwner] }, async (request, reply) => {
    const p = z.object({ memberId: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid member" });
    const m = request.practiceMember!;
    if (p.data.memberId === m.memberId) return reply.status(409).send({ error: "You can't remove yourself." });
    const res = await prisma.practiceMember.updateMany({
      where: { id: p.data.memberId, practiceId: m.practice.id, role: "staff", status: { in: ["active", "invited"] } },
      data: { status: "removed", removedAt: new Date(), inviteTokenHash: null },
    });
    if (res.count === 0) return reply.status(404).send({ error: "Not found" });
    return reply.send({ data: { ok: true } });
  });

  // POST /practice/staff/accept: a colleague opens their invite link while
  // signed in. Not behind requireMember: they are not a member yet.
  app.post(
    "/staff/accept",
    { preHandler: [authMiddleware], config: rateLimitByCaller("practice-staff-accept", 20, "1 minute") },
    async (request, reply) => {
      const parsed = z.object({ token: z.string().regex(INVITE_TOKEN_RE) }).safeParse(request.body);
      if (!parsed.success) return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
      const invite = await prisma.practiceMember.findUnique({
        where: { inviteTokenHash: hashToken(parsed.data.token) },
        select: { id: true, status: true, inviteExpiresAt: true, practiceId: true, practice: { select: { name: true } } },
      });
      if (!invite || invite.status !== "invited") {
        return reply.status(404).send({ error: "This invite is not recognised.", code: "not_found" });
      }
      if (!invite.inviteExpiresAt || invite.inviteExpiresAt.getTime() <= Date.now()) {
        return reply.status(410).send({ error: "This invite has run out. Ask for a new one.", code: "expired" });
      }
      const already = await loadMember(request.userId!);
      if (already) {
        return reply.status(409).send({
          error: `You're already part of ${already.practice.name}. One practice per account for now.`,
          code: "already_member",
        });
      }
      await prisma.practiceMember.update({
        where: { id: invite.id },
        data: { userId: request.userId!, status: "active", acceptedAt: new Date(), inviteTokenHash: null },
      });
      const joiner = await prisma.user.findUnique({ where: { id: request.userId! }, select: { email: true } });
      if (joiner) await attachDriverInvites(invite.practiceId, [joiner.email]);
      logEvent("practice.staff_joined", request.userId!, { practiceId: invite.practiceId });
      return reply.send({ data: { practiceName: invite.practice.name } });
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const tripRowSelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  distanceMiles: true,
  classification: true,
  platformTag: true,
  startAddress: true,
  endAddress: true,
  isManualEntry: true,
  vehicle: { select: { make: true, model: true, registrationPlate: true } },
} as const;

function shapeTrip(t: {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
  startAddress: string | null;
  endAddress: string | null;
  isManualEntry: boolean;
  vehicle: { make: string; model: string; registrationPlate: string | null } | null;
}) {
  return {
    id: t.id,
    startedAt: t.startedAt.toISOString(),
    endedAt: t.endedAt?.toISOString() ?? null,
    miles: Math.round(t.distanceMiles * 10) / 10,
    classification: t.classification,
    platform: t.platformTag ? GIG_PLATFORMS.find((g) => g.value === t.platformTag)?.label ?? t.platformTag : null,
    from: t.startAddress,
    to: t.endAddress,
    vehicle: t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}`.trim() : null,
    recorded: t.isManualEntry ? "added_by_hand" : "tracked",
  };
}

function shapeLink(link: LiveLink) {
  return {
    id: link.id,
    startedBy: link.startedBy,
    startedAt: link.startedAt?.toISOString() ?? null,
    endsAt: link.endsAt?.toISOString() ?? null,
    renewalAskedAt: link.renewalAskedAt?.toISOString() ?? null,
    shareEarnings: link.shareEarnings,
    shareExpenses: link.shareExpenses,
    sharePersonalTrips: link.sharePersonalTrips,
  };
}

function formatDue(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]}`;
}

/**
 * Drivers who invited this accountant's email before the practice existed:
 * attach them to the new practice, waiting for it to accept.
 */
async function attachDriverInvites(practiceId: string, emails: string[]): Promise<void> {
  const lower = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  const dangling = await prisma.practiceLink.findMany({
    where: { practiceId: null, invitedPracticeEmail: { in: lower }, status: "pending_practice" },
    select: { id: true, clientUserId: true },
  });
  for (const d of dangling) {
    if (!d.clientUserId) continue;
    const clash = await prisma.practiceLink.findUnique({
      where: { practiceId_clientUserId: { practiceId, clientUserId: d.clientUserId } },
      select: { id: true },
    });
    if (clash) {
      await prisma.practiceLink.delete({ where: { id: d.id } });
      continue;
    }
    await prisma.practiceLink.update({ where: { id: d.id }, data: { practiceId } });
  }
}
