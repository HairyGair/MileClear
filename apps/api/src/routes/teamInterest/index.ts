import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { sendTeamInterestEmail } from "../../services/email.js";
import { logEvent } from "../../services/appEvents.js";

// The five answers that decide whether an employer tier is worth building.
// Kept as closed enums so the admin view can add them up.
export const TEAM_DRIVER_BANDS = ["1-5", "6-20", "21-50", "50+"] as const;
export const TEAM_APPROVAL_KINDS = ["monthly_signoff", "line_by_line", "view_only"] as const;
export const TEAM_DESTINATIONS = ["payroll", "expenses_system", "spreadsheet", "accountant", "other"] as const;

const teamInterestSchema = z.object({
  email: z.string().trim().email("A valid work email is required").max(254),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  drivers: z.enum(TEAM_DRIVER_BANDS),
  approval: z.enum(TEAM_APPROVAL_KINDS),
  destination: z.enum(TEAM_DESTINATIONS),
  destinationDetail: z.string().trim().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(64).optional().or(z.literal("")),
  // Honeypot: real visitors never see it, bots fill it.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function teamInterestRoutes(app: FastifyInstance) {
  // POST /team-interest - public "MileClear for teams" register. Same
  // posture as /contact: unauthenticated, rate-limited, stores the row
  // first and treats the founder email as best-effort so a mail outage
  // cannot lose a lead.
  app.post(
    "/",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const parsed = teamInterestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const d = parsed.data;
      if (d.website) {
        // Honeypot tripped. Say yes and do nothing.
        return { data: { ok: true } };
      }

      const row = await prisma.teamInterest.create({
        data: {
          email: d.email,
          company: d.company || null,
          drivers: d.drivers,
          approval: d.approval,
          destination: d.destination,
          destinationDetail: d.destinationDetail || null,
          notes: d.notes || null,
          source: d.source || null,
        },
        select: { id: true },
      });

      logEvent("team_interest.submitted", null, {
        id: row.id,
        drivers: d.drivers,
        approval: d.approval,
        destination: d.destination,
        source: d.source || null,
        emailDomain: d.email.split("@")[1] ?? null,
      });

      try {
        await sendTeamInterestEmail({
          email: d.email,
          company: d.company || null,
          drivers: d.drivers,
          approval: d.approval,
          destination: d.destination,
          destinationDetail: d.destinationDetail || null,
          notes: d.notes || null,
          source: d.source || null,
        });
      } catch (err) {
        request.log.error(err, "team interest email failed (row saved)");
      }

      return { data: { ok: true } };
    }
  );
}
