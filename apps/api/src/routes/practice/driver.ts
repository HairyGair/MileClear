// Practice accounts: the driver's side (Accountant mode phase 1, Oct 2026).
//
// The driver has the final say, always, in the app: a practice's invite
// creates nothing it can read until the driver taps "Share with Smith & Co"
// here. Sharing is free for every driver (no Pro gate). The driver sees
// every look and download, can change what is shared, and can stop at any
// time. Only the driver can turn on personal trips.

import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { logEvent } from "../../services/appEvents.js";
import { sendPracticeAccountantInviteEmail } from "../../services/email.js";
import {
  PRACTICE_JOIN_CODE_RE,
  PRACTICE_REPLY_MAX,
  accessLogSentence,
  linkEndsAt,
  renewedEndsAt,
} from "@mileclear/shared";
import { hashToken, INVITE_TOKEN_RE, logPracticeAccess } from "../../services/practice/access.js";
import { refreshAutoRequests, requestSelect, shapeRequest } from "../../services/practice/requests.js";
import { noticeToPractice } from "../../services/practice/invites.js";
import {
  DAY_MS,
  WEB_BASE_URL,
  practiceForDriver,
  practiceIdentitySelect,
  rateLimitByCaller,
} from "./shared.js";

const scopesSchema = z.object({
  shareEarnings: z.boolean(),
  shareExpenses: z.boolean(),
  sharePersonalTrips: z.boolean(),
});

const linkSelect = {
  id: true,
  practiceId: true,
  clientUserId: true,
  status: true,
  startedBy: true,
  invitedEmail: true,
  invitedPracticeEmail: true,
  inviteExpiresAt: true,
  invitedAt: true,
  consentedAt: true,
  startedAt: true,
  endsAt: true,
  endedAt: true,
  endedBy: true,
  renewalAskedAt: true,
  createdByMemberId: true,
  shareEarnings: true,
  shareExpenses: true,
  sharePersonalTrips: true,
  practice: { select: practiceIdentitySelect },
} as const;

type DriverLink = NonNullable<Awaited<ReturnType<typeof findLink>>>;

async function findLink(where: { id: string; clientUserId: string }) {
  return prisma.practiceLink.findFirst({ where, select: linkSelect });
}

/** The driver-facing state of one link. */
export function driverLinkState(
  l: Pick<DriverLink, "status" | "endsAt" | "inviteExpiresAt" | "endedBy" | "consentedAt"> & {
    practice: { suspendedAt: Date | null } | null;
  },
  now: Date = new Date()
):
  | "asking"
  | "asking_expired"
  | "waiting_for_practice"
  | "sharing"
  | "paused"
  | "ended"
  | "stopped"
  | "declined" {
  switch (l.status) {
    case "invited":
      return l.inviteExpiresAt && l.inviteExpiresAt.getTime() > now.getTime() ? "asking" : "asking_expired";
    case "pending_practice":
      return "waiting_for_practice";
    case "active":
      if (!l.endsAt || l.endsAt.getTime() <= now.getTime()) return "ended";
      return l.practice?.suspendedAt ? "paused" : "sharing";
    case "ended":
      return l.endedBy === "driver" || l.endedBy === "report" ? "stopped" : "ended";
    default:
      return "declined";
  }
}

function shapeDriverLink(l: DriverLink, now: Date = new Date()) {
  const state = driverLinkState(l, now);
  return {
    id: l.id,
    state,
    startedBy: l.startedBy,
    practice: l.practice
      ? practiceForDriver(l.practice)
      : // The driver invited an accountant who has no practice yet.
        { id: null, name: l.invitedPracticeEmail ?? "Your accountant", contactName: null, professionalBody: null, checked: false, paused: false, initials: "?", logoPath: null },
    awaitingSignup: !l.practiceId,
    shareEarnings: l.shareEarnings,
    shareExpenses: l.shareExpenses,
    sharePersonalTrips: l.sharePersonalTrips,
    invitedAt: l.invitedAt?.toISOString() ?? null,
    consentedAt: l.consentedAt?.toISOString() ?? null,
    startedAt: l.startedAt?.toISOString() ?? null,
    // What sharing would last until if they said yes today.
    endsAt: (l.endsAt ?? (state === "asking" ? linkEndsAt(now) : null))?.toISOString() ?? null,
    endedAt: (l.endedAt ?? (state === "ended" ? l.endsAt : null))?.toISOString() ?? null,
    endedBy: l.endedBy,
    renewalAskedAt: l.renewalAskedAt?.toISOString() ?? null,
    // The keep-sharing card shows from 30 days before the end.
    renewalDue:
      state === "sharing" && !!l.endsAt && l.endsAt.getTime() - now.getTime() <= 30 * DAY_MS,
  };
}

/** Practice invites sent to this driver's email before they had an account. */
async function bindInvitesByEmail(userId: string, email: string): Promise<void> {
  const loose = await prisma.practiceLink.findMany({
    where: { clientUserId: null, invitedEmail: email.toLowerCase(), status: "invited", practiceId: { not: null } },
    select: { id: true, practiceId: true },
  });
  for (const l of loose) {
    const clash = await prisma.practiceLink.findUnique({
      where: { practiceId_clientUserId: { practiceId: l.practiceId!, clientUserId: userId } },
      select: { id: true },
    });
    if (clash) continue;
    await prisma.practiceLink.update({ where: { id: l.id }, data: { clientUserId: userId } });
  }
}

function driverName(u: { fullName: string | null; displayName: string | null } | null): string {
  return u?.fullName?.trim() || u?.displayName?.trim() || "A MileClear driver";
}

/** Make a link live after the driver said yes (practice-started) or wait for the practice. */
async function recordConsent(
  link: DriverLink,
  userId: string,
  scopes: z.infer<typeof scopesSchema>,
  now: Date
) {
  const goesLive = link.startedBy === "practice" || link.status === "invited";
  await prisma.practiceLink.update({
    where: { id: link.id },
    data: {
      ...scopes,
      consentedAt: now,
      status: goesLive ? "active" : "pending_practice",
      startedAt: goesLive ? now : null,
      endsAt: goesLive ? linkEndsAt(now) : null,
      endedAt: null,
      endedBy: null,
      inviteTokenHash: null,
      renewalAskedAt: null,
      renewalRemindedAt: null,
    },
  });
  if (goesLive && link.practice) {
    await logPracticeAccess({
      member: null,
      practice: link.practice,
      clientUserId: userId,
      action: "started_sharing",
      detail: { ...scopes },
    });
    // A15: the old token link to the same accountant is retired once the
    // driver shares through the practice.
    await retireOldLinks(userId, link.practiceId!);
  }
  return goesLive;
}

/** Revoke old AccountantAccess rows for any email of this practice. */
async function retireOldLinks(userId: string, practiceId: string): Promise<void> {
  const [practice, members] = await Promise.all([
    prisma.practice.findUnique({ where: { id: practiceId }, select: { email: true } }),
    prisma.practiceMember.findMany({
      where: { practiceId, status: "active" },
      select: { user: { select: { email: true } } },
    }),
  ]);
  const emails = [practice?.email, ...members.map((m) => m.user?.email)].filter(Boolean).map((e) => e!.toLowerCase());
  if (emails.length === 0) return;
  const old = await prisma.accountantAccess.findMany({
    where: { userId, accountantEmail: { in: emails } },
    select: { id: true, accountantEmail: true },
  });
  for (const a of old) {
    await prisma.accountantAccess.delete({ where: { id: a.id } });
    await prisma.accountantInvite.updateMany({
      where: { userId, email: a.accountantEmail, status: "accepted" },
      data: { status: "revoked" },
    });
  }
  if (old.length) logEvent("practice.old_link_retired", userId, { practiceId, count: old.length });
}

export async function practiceDriverRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /practice-links: everything "Your accountant" shows.
  app.get("/", async (request, reply) => {
    const userId = request.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, workType: true, accountantName: true, accountantContact: true, accountantAnnualFeePence: true },
    });
    if (!user) return reply.status(401).send({ error: "Sign in again." });
    await bindInvitesByEmail(userId, user.email);
    await refreshAutoRequests([userId]);

    const now = new Date();
    const [links, requests, log] = await Promise.all([
      prisma.practiceLink.findMany({
        where: { clientUserId: userId, status: { not: "cancelled" } },
        orderBy: { updatedAt: "desc" },
        select: linkSelect,
      }),
      prisma.practiceRequest.findMany({
        where: {
          clientUserId: userId,
          OR: [{ status: "open" }, { status: "done", doneAt: { gte: new Date(now.getTime() - DAY_MS) } }],
        },
        orderBy: { createdAt: "asc" },
        select: { ...requestSelect, practice: { select: { name: true } } },
      }),
      prisma.practiceAccessLog.findMany({
        where: { clientUserId: userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, action: true, practiceName: true, actorName: true, detail: true, createdAt: true },
      }),
    ]);

    // Requests only from practices the driver is sharing with now.
    const liveIds = new Set(
      links.filter((l) => driverLinkState(l, now) === "sharing").map((l) => l.practiceId)
    );
    return reply.send({
      data: {
        isEmployee: user.workType === "employee",
        links: links
          .map((l) => shapeDriverLink(l, now))
          // Old declined/expired asks are noise.
          .filter((l) => l.state !== "declined" && l.state !== "asking_expired"),
        requests: requests
          .filter((r) => liveIds.has(r.practiceId))
          .map((r) => ({ ...shapeRequest(r), practiceName: r.practice.name })),
        log: log.map((r) => ({
          id: r.id,
          action: r.action,
          sentence: accessLogSentence({
            action: r.action,
            practiceName: r.practiceName,
            actorName: r.actorName,
            detail: (r.detail as Record<string, unknown> | null) ?? null,
          }),
          at: r.createdAt.toISOString(),
        })),
        fee: {
          accountantName: user.accountantName,
          accountantContact: user.accountantContact,
          accountantAnnualFeePence: user.accountantAnnualFeePence,
        },
      },
    });
  });

  // GET /practice-links/log?before=ISO: the full access log, 50 at a time.
  app.get("/log", async (request, reply) => {
    const q = z.object({ before: z.string().datetime().optional() }).safeParse(request.query);
    const before = q.success && q.data.before ? new Date(q.data.before) : undefined;
    const rows = await prisma.practiceAccessLog.findMany({
      where: { clientUserId: request.userId!, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, practiceName: true, actorName: true, detail: true, createdAt: true },
    });
    return reply.send({
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        sentence: accessLogSentence({
          action: r.action,
          practiceName: r.practiceName,
          actorName: r.actorName,
          detail: (r.detail as Record<string, unknown> | null) ?? null,
        }),
        at: r.createdAt.toISOString(),
      })),
    });
  });

  // GET /practice-links/lookup?code=|invite=|linkId= : the consent sheet.
  app.get("/lookup", { config: rateLimitByCaller("practice-lookup", 30, "1 minute") }, async (request, reply) => {
    const q = z
      .object({
        code: z.string().trim().toUpperCase().optional(),
        invite: z.string().optional(),
        linkId: z.string().uuid().optional(),
      })
      .safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: "Invalid lookup" });
    const userId = request.userId!;
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, workType: true } });
    if (!user) return reply.status(401).send({ error: "Sign in again." });
    await bindInvitesByEmail(userId, user.email);

    let link: DriverLink | null = null;
    let practice = null as Awaited<ReturnType<typeof practiceByCode>>;
    if (q.data.linkId) {
      link = await findLink({ id: q.data.linkId, clientUserId: userId });
    } else if (q.data.invite) {
      if (!INVITE_TOKEN_RE.test(q.data.invite)) return reply.status(404).send({ error: "This request is not recognised.", code: "not_found" });
      const byToken = await prisma.practiceLink.findUnique({
        where: { inviteTokenHash: hashToken(q.data.invite) },
        select: { id: true, clientUserId: true, practiceId: true },
      });
      if (!byToken) return reply.status(404).send({ error: "This request is not recognised.", code: "not_found" });
      if (byToken.clientUserId && byToken.clientUserId !== userId) {
        // An invite sent to someone else's account.
        return reply.status(404).send({ error: "This request is for a different account.", code: "other_account" });
      }
      if (!byToken.clientUserId) {
        // Invited before they signed up, under another email: the link in
        // the email is the proof. One row per (practice, driver).
        const clash = await prisma.practiceLink.findUnique({
          where: { practiceId_clientUserId: { practiceId: byToken.practiceId!, clientUserId: userId } },
          select: { id: true },
        });
        if (!clash) await prisma.practiceLink.update({ where: { id: byToken.id }, data: { clientUserId: userId } });
        link = await findLink({ id: clash?.id ?? byToken.id, clientUserId: userId });
      } else {
        link = await findLink({ id: byToken.id, clientUserId: userId });
      }
    } else if (q.data.code) {
      if (!PRACTICE_JOIN_CODE_RE.test(q.data.code)) return reply.status(404).send({ error: "No practice has that code.", code: "not_found" });
      practice = await practiceByCode(q.data.code);
      if (!practice || practice.suspendedAt) return reply.status(404).send({ error: "No practice has that code.", code: "not_found" });
      const existing = await prisma.practiceLink.findUnique({
        where: { practiceId_clientUserId: { practiceId: practice.id, clientUserId: userId } },
        select: { id: true },
      });
      if (existing) link = await findLink({ id: existing.id, clientUserId: userId });
    } else {
      return reply.status(400).send({ error: "Nothing to look up" });
    }

    if (link) {
      return reply.send({ data: { isEmployee: user.workType === "employee", link: shapeDriverLink(link, now) } });
    }
    if (!practice) return reply.status(404).send({ error: "This request is not recognised.", code: "not_found" });
    return reply.send({
      data: {
        isEmployee: user.workType === "employee",
        link: null,
        practice: practiceForDriver(practice),
        endsAt: linkEndsAt(now).toISOString(),
      },
    });
  });

  // POST /practice-links/consent: the driver says yes.
  //   { linkId, ...scopes } answers a practice's ask (goes live now), or
  //   { code, ...scopes } shares through a join link (waits for the practice).
  app.post("/consent", { config: rateLimitByCaller("practice-consent", 20, "1 minute") }, async (request, reply) => {
    const parsed = scopesSchema
      .extend({ linkId: z.string().uuid().optional(), code: z.string().trim().toUpperCase().optional() })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Choose what to share." });
    const { linkId, code, ...scopes } = parsed.data;
    const userId = request.userId!;
    const now = new Date();

    let link: DriverLink | null = null;
    if (linkId) {
      link = await findLink({ id: linkId, clientUserId: userId });
      if (!link || !link.practice) return reply.status(404).send({ error: "This request is not recognised.", code: "not_found" });
      const state = driverLinkState(link, now);
      if (state === "asking_expired") {
        return reply.status(410).send({ error: "This request has expired. Ask your accountant to send a new one.", code: "expired" });
      }
      if (state !== "asking" && state !== "ended" && state !== "stopped") {
        return reply.status(409).send({ error: "There is nothing to answer here.", code: "not_asking" });
      }
    } else if (code) {
      const practice = PRACTICE_JOIN_CODE_RE.test(code) ? await practiceByCode(code) : null;
      if (!practice || practice.suspendedAt) return reply.status(404).send({ error: "No practice has that code.", code: "not_found" });
      const existing = await prisma.practiceLink.findUnique({
        where: { practiceId_clientUserId: { practiceId: practice.id, clientUserId: userId } },
        select: { id: true },
      });
      if (existing) {
        link = await findLink({ id: existing.id, clientUserId: userId });
        const state = link ? driverLinkState(link, now) : null;
        if (state === "sharing" || state === "waiting_for_practice") {
          return reply.send({ data: { state, practiceName: practice.name } });
        }
        // An unanswered ask from this practice: answering it goes live.
        if (state !== "asking") {
          await prisma.practiceLink.update({
            where: { id: existing.id },
            data: { status: "pending_practice", startedBy: "driver" },
          });
          link = await findLink({ id: existing.id, clientUserId: userId });
        }
      } else {
        const created = await prisma.practiceLink.create({
          data: { practiceId: practice.id, clientUserId: userId, status: "pending_practice", startedBy: "driver" },
          select: { id: true },
        });
        link = await findLink({ id: created.id, clientUserId: userId });
      }
    } else {
      return reply.status(400).send({ error: "Nothing to answer." });
    }
    if (!link || !link.practice) return reply.status(404).send({ error: "This request is not recognised." });

    // Sharing again after it ended: if the driver stopped it, or the date
    // passed, the practice had them before, so it goes straight back live.
    const restart = link.status === "ended" || (link.status === "active" && driverLinkState(link, now) === "ended");
    if (restart) {
      await prisma.practiceLink.update({ where: { id: link.id }, data: { status: "invited", startedBy: "practice" } });
      link = (await findLink({ id: link.id, clientUserId: userId }))!;
    }

    const live = await recordConsent(link, userId, scopes, now);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, displayName: true } });
    const name = driverName(user);
    if (live) {
      await noticeToPractice({
        practiceId: link.practiceId!,
        memberId: link.createdByMemberId,
        subject: `${name} is now sharing with you`,
        title: `${name} is now sharing with you`,
        lines: [`${name} said yes. Their business records are in your client list now.`],
      });
    } else {
      await noticeToPractice({
        practiceId: link.practiceId!,
        subject: `${name} wants to share with you`,
        title: `${name} wants to share with you`,
        lines: [`${name} would like to share their MileClear records with you. Accept them to see their business trips, earnings and expenses.`],
      });
    }
    logEvent("practice.driver_consented", userId, { practiceId: link.practiceId, live });
    return reply.send({
      data: { state: live ? "sharing" : "waiting_for_practice", practiceName: link.practice?.name ?? "" },
    });
  });

  // POST /practice-links/invite { value }: "Their email or practice code".
  // Typing it in and pressing Send is the driver's yes, with the default
  // scopes (business, earnings, expenses; never personal trips).
  app.post("/invite", { config: rateLimitByCaller("practice-driver-invite", 10, "1 hour") }, async (request, reply) => {
    const parsed = z.object({ value: z.string().trim().min(3).max(255) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Enter their email or practice code." });
    const userId = request.userId!;
    const value = parsed.data.value;
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, displayName: true } });
    if (!user) return reply.status(401).send({ error: "Sign in again." });

    const isEmail = value.includes("@");
    let practice: Awaited<ReturnType<typeof practiceByCode>> = null;
    if (isEmail) {
      const email = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.status(400).send({ error: "That email doesn't look right." });
      if (email === user.email.toLowerCase()) return reply.status(400).send({ error: "That's your own email." });
      const byPractice = await prisma.practice.findFirst({ where: { email }, select: { id: true } });
      const byMember = byPractice
        ? null
        : await prisma.practiceMember.findFirst({
            where: { status: "active", user: { email } },
            select: { practiceId: true },
          });
      const pid = byPractice?.id ?? byMember?.practiceId;
      if (pid) practice = await prisma.practice.findUnique({ where: { id: pid }, select: practiceIdentitySelect });

      if (!practice) {
        // No practice yet: remember the ask and email them about a free
        // practice account. One open ask per accountant email.
        const existing = await prisma.practiceLink.findFirst({
          where: { clientUserId: userId, practiceId: null, invitedPracticeEmail: email },
          select: { id: true },
        });
        if (!existing) {
          await prisma.practiceLink.create({
            data: {
              practiceId: null,
              clientUserId: userId,
              status: "pending_practice",
              startedBy: "driver",
              invitedPracticeEmail: email,
              consentedAt: now,
              invitedAt: now,
            },
          });
          try {
            await sendPracticeAccountantInviteEmail({
              to: email,
              driverName: driverName(user),
              url: `${WEB_BASE_URL}/accountants`,
            });
          } catch (err) {
            request.log.error({ err: (err as Error)?.message }, "accountant invite email failed");
          }
        }
        logEvent("practice.driver_invited_accountant", userId, { hadPractice: false });
        return reply.send({ data: { outcome: "emailed_accountant" } });
      }
    } else {
      const code = value.toUpperCase().replace(/\s+/g, "");
      if (!PRACTICE_JOIN_CODE_RE.test(code)) return reply.status(404).send({ error: "No practice has that code.", code: "not_found" });
      practice = await practiceByCode(code);
      if (!practice) return reply.status(404).send({ error: "No practice has that code.", code: "not_found" });
    }
    if (practice.suspendedAt) return reply.status(409).send({ error: "That practice can't take new clients right now." });

    const existing = await prisma.practiceLink.findUnique({
      where: { practiceId_clientUserId: { practiceId: practice.id, clientUserId: userId } },
      select: linkSelect,
    });
    const state = existing ? driverLinkState(existing, now) : null;
    if (state === "sharing") return reply.send({ data: { outcome: "already_sharing", practiceName: practice.name } });
    if (state === "waiting_for_practice") return reply.send({ data: { outcome: "asked_practice", practiceName: practice.name } });
    if (state === "asking") {
      // They already asked us: open the consent sheet for that ask.
      return reply.send({ data: { outcome: "practice_asked_you", practiceName: practice.name, linkId: existing!.id } });
    }
    const scopes = { shareEarnings: true, shareExpenses: true, sharePersonalTrips: false };
    if (existing) {
      await prisma.practiceLink.update({
        where: { id: existing.id },
        data: {
          ...scopes,
          status: "pending_practice",
          startedBy: "driver",
          consentedAt: now,
          startedAt: null,
          endsAt: null,
          endedAt: null,
          endedBy: null,
        },
      });
    } else {
      await prisma.practiceLink.create({
        data: { ...scopes, practiceId: practice.id, clientUserId: userId, status: "pending_practice", startedBy: "driver", consentedAt: now },
      });
    }
    const name = driverName(user);
    await noticeToPractice({
      practiceId: practice.id,
      subject: `${name} wants to share with you`,
      title: `${name} wants to share with you`,
      lines: [`${name} would like to share their MileClear records with you. Accept them to see their business trips, earnings and expenses.`],
    });
    logEvent("practice.driver_invited_accountant", userId, { hadPractice: true, practiceId: practice.id });
    return reply.send({ data: { outcome: "asked_practice", practiceName: practice.name } });
  });

  const linkParams = z.object({ linkId: z.string().uuid() });

  // PATCH /practice-links/:linkId/scopes: what they can see. Only the driver
  // can change this, including personal trips.
  app.patch("/:linkId/scopes", async (request, reply) => {
    const p = linkParams.safeParse(request.params);
    const body = scopesSchema.safeParse(request.body);
    if (!p.success || !body.success) return reply.status(400).send({ error: "Invalid request" });
    const userId = request.userId!;
    const link = await findLink({ id: p.data.linkId, clientUserId: userId });
    if (!link) return reply.status(404).send({ error: "Not found" });
    await prisma.practiceLink.update({ where: { id: link.id }, data: body.data });
    if (link.practice && driverLinkState(link) === "sharing") {
      await logPracticeAccess({
        member: null,
        practice: link.practice,
        clientUserId: userId,
        action: "changed_sharing",
        detail: { ...body.data },
      });
    }
    return reply.send({ data: { ok: true } });
  });

  // POST /practice-links/:linkId/stop: stop sharing now.
  app.post("/:linkId/stop", async (request, reply) => {
    const p = linkParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid request" });
    const userId = request.userId!;
    const link = await findLink({ id: p.data.linkId, clientUserId: userId });
    if (!link) return reply.status(404).send({ error: "Not found" });
    const now = new Date();
    const wasLive = ["sharing", "paused", "waiting_for_practice"].includes(driverLinkState(link, now));
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: { status: "ended", endedAt: now, endedBy: "driver", inviteTokenHash: null },
    });
    // Their open requests go with it.
    await prisma.practiceRequest.updateMany({
      where: { clientUserId: userId, practiceId: link.practiceId ?? undefined, status: "open" },
      data: { status: "cancelled" },
    });
    if (link.practice && wasLive) {
      await logPracticeAccess({ member: null, practice: link.practice, clientUserId: userId, action: "stopped_sharing" });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, displayName: true } });
      const name = driverName(user);
      await noticeToPractice({
        practiceId: link.practiceId!,
        memberId: link.createdByMemberId,
        subject: `${name} stopped sharing with you`,
        title: `${name} stopped sharing with you`,
        lines: [`${name} stopped sharing their MileClear records with you. Anything you downloaded before stays with you.`],
      });
    }
    logEvent("practice.driver_stopped", userId, { practiceId: link.practiceId });
    return reply.send({ data: { ok: true } });
  });

  // POST /practice-links/:linkId/keep-sharing: one more year.
  app.post("/:linkId/keep-sharing", async (request, reply) => {
    const p = linkParams.safeParse(request.params);
    if (!p.success) return reply.status(400).send({ error: "Invalid request" });
    const userId = request.userId!;
    const link = await findLink({ id: p.data.linkId, clientUserId: userId });
    if (!link || !link.practice) return reply.status(404).send({ error: "Not found" });
    if (driverLinkState(link) !== "sharing" || !link.endsAt) {
      return reply.status(409).send({ error: "There's nothing to keep sharing here." });
    }
    const endsAt = renewedEndsAt(link.endsAt);
    await prisma.practiceLink.update({
      where: { id: link.id },
      data: { endsAt, renewalAskedAt: null, renewalRemindedAt: null },
    });
    await logPracticeAccess({ member: null, practice: link.practice, clientUserId: userId, action: "kept_sharing" });
    return reply.send({ data: { endsAt: endsAt.toISOString() } });
  });

  // POST /practice-links/:linkId/report: "Don't know them? Report this".
  // Ends the ask and flags the practice for an admin.
  app.post("/:linkId/report", { config: rateLimitByCaller("practice-report", 10, "1 hour") }, async (request, reply) => {
    const p = linkParams.safeParse(request.params);
    const body = z.object({ note: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
    if (!p.success || !body.success) return reply.status(400).send({ error: "Invalid request" });
    const userId = request.userId!;
    const link = await findLink({ id: p.data.linkId, clientUserId: userId });
    if (!link || !link.practiceId) return reply.status(404).send({ error: "Not found" });
    const now = new Date();
    await prisma.$transaction([
      prisma.practiceLink.update({
        where: { id: link.id },
        data: { status: "declined", endedAt: now, endedBy: "report", inviteTokenHash: null },
      }),
      prisma.practice.update({
        where: { id: link.practiceId },
        data: { reportCount: { increment: 1 }, lastReportedAt: now },
      }),
    ]);
    // The note goes to admin through the event, never to the practice.
    logEvent("practice.reported", userId, { practiceId: link.practiceId, note: body.data.note ?? null });
    return reply.send({ data: { ok: true } });
  });

  // ── Requests ────────────────────────────────────────────────────────────
  const requestParams = z.object({ requestId: z.string().uuid() });

  async function ownRequest(request: FastifyRequest) {
    const p = requestParams.safeParse(request.params);
    if (!p.success) return null;
    return prisma.practiceRequest.findFirst({
      where: { id: p.data.requestId, clientUserId: request.userId! },
      select: { ...requestSelect, createdByMemberId: true, practice: { select: { name: true } } },
    });
  }

  app.post("/requests/:requestId/done", async (request, reply) => {
    const r = await ownRequest(request);
    if (!r) return reply.status(404).send({ error: "Not found" });
    if (r.status !== "open") return reply.send({ data: { ok: true } });
    await prisma.practiceRequest.update({
      where: { id: r.id },
      data: { status: "done", doneHow: "driver", doneAt: new Date() },
    });
    return reply.send({ data: { ok: true } });
  });

  app.post("/requests/:requestId/reply", { config: rateLimitByCaller("practice-reply", 20, "1 hour") }, async (request, reply) => {
    const r = await ownRequest(request);
    const body = z.object({ text: z.string().trim().min(1).max(PRACTICE_REPLY_MAX) }).safeParse(request.body);
    if (!r) return reply.status(404).send({ error: "Not found" });
    if (!body.success) return reply.status(400).send({ error: `One line, up to ${PRACTICE_REPLY_MAX} characters.` });
    await prisma.practiceRequest.update({
      where: { id: r.id },
      data: { driverReply: body.data.text, repliedAt: new Date() },
    });
    const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { fullName: true, displayName: true } });
    const name = driverName(user);
    await noticeToPractice({
      practiceId: r.practiceId,
      memberId: r.createdByMemberId,
      subject: `${name} replied to your request`,
      title: `${name} replied`,
      lines: [`"${body.data.text}"`, `About: ${shapeRequest(r).title}.`],
      path: "/practice/requests",
    });
    return reply.send({ data: { ok: true } });
  });
}

async function practiceByCode(code: string) {
  return prisma.practice.findUnique({ where: { joinCode: code }, select: practiceIdentitySelect });
}
