import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendWaitlistConfirmation } from "../../services/email.js";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email(),
  driverType: z.string().optional(),
  /** "android" = a request to join the Google Play closed test. Anthony adds
   *  the address to the tester list by hand, so it has to reach him. */
  source: z.enum(["android"]).optional(),
});

export async function waitlistRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = waitlistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const body = parsed.data;

    const entry = await prisma.waitlistEntry.upsert({
      where: { email: body.email },
      update: { driverType: body.driverType ?? undefined },
      create: {
        email: body.email,
        driverType: body.driverType ?? null,
      },
    });

    await sendWaitlistConfirmation(body.email, { android: body.source === "android" });

    // The Android closed test ended when MileClear went public on Google Play
    // (21 Sep 2026), so tester requests no longer alert the team with the
    // driver's email address (the last Discord/Slack post that carried one).

    return { data: { id: entry.id }, message: "You're on the list!" };
  });
}
