import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { authMiddleware } from "../../middleware/auth.js";
import { logEvent } from "../../services/appEvents.js";
import { sendMilesheetWaitlistEmail } from "../../services/email.js";
import {
  countActiveSeats,
  getOrCreateOrgCustomer,
  getSeatBilling,
} from "../../services/teamBilling.js";
import { SELF_SERVE_WAITLIST_MESSAGE, newTeamsMode } from "../../services/milesheetNewTeams.js";
import { creatorHadTrial, recordWaitlistRequest } from "../../services/milesheetTeams.js";
import {
  TEAM_TRIAL_SEAT_CAP,
  stripeTrialEndFor,
  trialEndsAtForNewTeam,
} from "../../services/teamTrial.js";
import { TEAM_DRIVER_BANDS } from "../teamInterest/index.js";

// Milesheet Phase 3 (24 Aug 2026) - self-serve org creation + per-seat
// billing. Sits alongside routes/team/index.ts (Phase 1/2, MileClear-admin
// org creation + invites/members) under the same /team prefix; route paths
// here (self-serve, billing, billing/checkout, billing/portal) don't
// collide with anything there.
//
// Stripe is LIVE in production. Every money-moving route below fails
// closed: missing price id -> 503, pilot org -> refused, zero seats ->
// refused, 20+ seats -> refused (invoicing is a human conversation, not a
// self-serve flow yet).
//
// Waiting list (4 Oct 2026): while MILESHEET_NEW_TEAMS is not "open" (the
// default), POST /self-serve does not create a team. It records the request
// in team_interest (waitlistSource "self_serve"), emails the manager a short
// confirmation and answers { data: { waitlisted: true, message } } with a
// 200. POST /waitlist is the same for someone who is not signed in. When
// new teams are open, a new team gets a 30-day free trial (teamTrial.ts).

const TEAM_SEAT_PRICE_ENV = "STRIPE_TEAM_SEAT_PRICE_ID";
const SELF_SERVE_CHECKOUT_SEAT_CAP = 20; // matches the "get in touch" threshold in the UI
const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";

const waitlistSchema = z.object({
  company: z.string().trim().min(2, "Enter your company's name").max(160),
  email: z.string().trim().email("Enter a valid work email").max(254),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  drivers: z.enum(TEAM_DRIVER_BANDS).optional(),
  // Honeypot, as on /team-interest.
  website: z.string().max(500).optional(),
});

async function requireOrgAdmin(userId: string) {
  return prisma.orgMembership.findFirst({
    where: { userId, role: "admin", status: "active" },
    select: { orgId: true, id: true },
  });
}

export async function teamSelfServeRoutes(app: FastifyInstance) {
  // ── Logged-in user: create their own org and become its admin ─────────
  // ── Anyone: are new teams open, or on the waiting list? ───────────────
  app.get("/availability", async (_request, reply) => {
    return reply.send({ data: { newTeams: newTeamsMode() } });
  });

  // ── Anyone (signed out): join the waiting list from the website ────────
  app.post(
    "/waitlist",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const parsed = waitlistSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const d = parsed.data;
      // Honeypot: say yes and do nothing.
      if (d.website) return reply.send({ data: { waitlisted: true, message: SELF_SERVE_WAITLIST_MESSAGE } });
      if (newTeamsMode() === "open") {
        return reply.status(409).send({ error: "New teams are open. Sign in to set your company up." });
      }
      const { id, duplicate } = await recordWaitlistRequest({
        source: "self_serve",
        email: d.email,
        company: d.company,
        contactName: d.contactName || null,
        drivers: d.drivers ?? null,
        page: "milesheet",
      });
      if (!duplicate) {
        try {
          await sendMilesheetWaitlistEmail(d.email.toLowerCase(), d.contactName || null, d.company);
        } catch (err) {
          request.log.error({ err }, "milesheet waitlist confirmation email failed (row saved)");
        }
      }
      logEvent("team.waitlisted", null, {
        interestId: id,
        source: "self_serve",
        duplicate,
        signedIn: false,
        emailDomain: d.email.split("@")[1]?.toLowerCase() ?? null,
      });
      return reply.send({ data: { waitlisted: true, message: SELF_SERVE_WAITLIST_MESSAGE } });
    }
  );

  app.post(
    "/self-serve",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const parsed = z
        .object({
          name: z.string().trim().min(2).max(160),
          contactName: z.string().trim().max(120).optional().or(z.literal("")),
          drivers: z.enum(TEAM_DRIVER_BANDS).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      // One org per user, same rule /team/me and the invite-accept flow
      // already assume.
      const existing = await prisma.orgMembership.findFirst({
        where: { userId: request.userId!, status: "active" },
        select: { id: true },
      });
      if (existing) {
        return reply.status(409).send({ error: "You are already in a team." });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { email: true },
      });
      if (!user) return reply.status(404).send({ error: "User not found" });

      const mode = newTeamsMode();
      if (mode === "waitlist") {
        const { id, duplicate } = await recordWaitlistRequest({
          source: "self_serve",
          email: user.email,
          company: parsed.data.name,
          contactName: parsed.data.contactName || null,
          drivers: parsed.data.drivers ?? null,
          page: "milesheet/portal",
        });
        if (!duplicate) {
          try {
            await sendMilesheetWaitlistEmail(user.email.toLowerCase(), parsed.data.contactName || null, parsed.data.name);
          } catch (err) {
            request.log.error({ err }, "milesheet waitlist confirmation email failed (row saved)");
          }
        }
        logEvent("team.waitlisted", request.userId!, {
          interestId: id,
          source: "self_serve",
          duplicate,
          signedIn: true,
          name: parsed.data.name,
        });
        return reply.send({ data: { waitlisted: true, message: SELF_SERVE_WAITLIST_MESSAGE } });
      }

      const trialEndsAt = trialEndsAtForNewTeam(mode, new Date(), {
        creatorHadTrial: await creatorHadTrial(request.userId!),
      });

      const org = await prisma.organisation.create({
        data: {
          name: parsed.data.name,
          pilotFree: false,
          trialEndsAt,
          // A trial is free, so it gets the same ceiling as a free pilot.
          seatCap: trialEndsAt ? TEAM_TRIAL_SEAT_CAP : null,
          billingEmail: user.email,
          createdByUserId: request.userId!,
          memberships: {
            create: {
              role: "admin",
              status: "active",
              invitedEmail: user.email.toLowerCase(),
              acceptedAt: new Date(),
              userId: request.userId!,
            },
          },
        },
        select: { id: true, name: true },
      });

      logEvent("team.self_serve_org_created", request.userId!, {
        orgId: org.id,
        name: org.name,
        trialEndsAt: trialEndsAt?.toISOString() ?? null,
      });
      return reply.status(201).send({ data: { ...org, waitlisted: false } });
    }
  );

  // ── Org admin: seat billing summary for the portal card ────────────────
  app.get("/billing", { preHandler: [authMiddleware] }, async (request, reply) => {
    const admin = await requireOrgAdmin(request.userId!);
    if (!admin) return reply.status(403).send({ error: "You are not a team admin." });

    const billing = await getSeatBilling(admin.orgId);
    return reply.send({ data: billing });
  });

  // ── Org admin: start seat billing via Stripe Checkout ──────────────────
  app.post(
    "/billing/checkout",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const admin = await requireOrgAdmin(request.userId!);
      if (!admin) return reply.status(403).send({ error: "You are not a team admin." });

      if (!stripe) {
        return reply.status(503).send({ error: "Billing not configured" });
      }
      const priceId = process.env[TEAM_SEAT_PRICE_ENV];
      if (!priceId) {
        return reply.status(503).send({ error: "Team seat price not configured" });
      }

      const org = await prisma.organisation.findUnique({
        where: { id: admin.orgId },
        select: { id: true, name: true, pilotFree: true, stripeSubscriptionId: true, trialEndsAt: true },
      });
      if (!org) return reply.status(404).send({ error: "Organisation not found" });
      if (org.pilotFree) {
        return reply.status(400).send({
          error: "This organisation is on a free pilot and cannot start paid billing.",
        });
      }
      if (org.stripeSubscriptionId) {
        return reply.status(400).send({ error: "Billing is already active for this team." });
      }

      const seats = await countActiveSeats(org.id);
      if (seats < 1) {
        return reply.status(400).send({
          error: "Invite at least one active driver before starting billing.",
        });
      }
      if (seats >= SELF_SERVE_CHECKOUT_SEAT_CAP) {
        return reply.status(400).send({
          error: `Teams of ${SELF_SERVE_CHECKOUT_SEAT_CAP}+ drivers use invoicing - contact gair@mileclear.com to set that up.`,
        });
      }

      const customerId = await getOrCreateOrgCustomer(org.id);
      if (!customerId) {
        return reply.status(503).send({ error: "Billing not configured" });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: seats }],
        // A team that subscribes part-way through its free trial is not
        // charged until the trial it was promised is over.
        subscription_data: {
          metadata: { orgId: org.id },
          trial_end: stripeTrialEndFor(org.trialEndsAt, new Date()),
        },
        metadata: { orgId: org.id },
        success_url: `${WEB_BASE_URL}/milesheet/portal?checkout=success`,
        cancel_url: `${WEB_BASE_URL}/milesheet/portal?checkout=cancelled`,
      });

      logEvent("team.checkout_created", request.userId!, { orgId: org.id, seats });
      return reply.send({ data: { url: session.url } });
    }
  );

  // ── Org admin: Stripe Billing Portal (change card / cancel) ────────────
  app.post(
    "/billing/portal",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const admin = await requireOrgAdmin(request.userId!);
      if (!admin) return reply.status(403).send({ error: "You are not a team admin." });

      if (!stripe) {
        return reply.status(503).send({ error: "Billing not configured" });
      }

      const org = await prisma.organisation.findUnique({
        where: { id: admin.orgId },
        select: { stripeCustomerId: true },
      });
      if (!org?.stripeCustomerId) {
        return reply.status(400).send({ error: "No billing account yet for this team." });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${WEB_BASE_URL}/milesheet/portal`,
      });

      logEvent("team.billing_portal_opened", request.userId!, { orgId: admin.orgId });
      return reply.send({ data: { url: session.url } });
    }
  );
}
