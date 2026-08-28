import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendWaitlistConfirmation } from "../../services/email.js";
import { postFounderAlert } from "../../services/discord.js";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email(),
  driverType: z.string().optional(),
  /** "android" = a request to join the Google Play closed test. Anthony adds
   *  the address to the tester list by hand, so it has to reach him. */
  source: z.enum(["android"]).optional(),
});

const PLAY_TESTERS_URL =
  "https://play.google.com/console/u/1/developers/5127901537284136681/app/4974202483934431375/tracks/4699958973638701224?tab=testers";

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

    await sendWaitlistConfirmation(body.email);

    if (body.source === "android") {
      postFounderAlert({
        severity: "info",
        title: "Android tester request",
        detail: `${body.email}${body.driverType ? ` · ${body.driverType}` : ""}\nAdd to Play Console › Closed testing › Beta Testers.`,
        link: PLAY_TESTERS_URL,
      }).catch((err) => console.error("[waitlist] founder alert failed:", err));
    }

    return { data: { id: entry.id }, message: "You're on the list!" };
  });
}
