import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { sendWaitlistConfirmation } from "../../services/email.js";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email(),
  driverType: z.string().optional(),
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
      update: {},
      create: {
        email: body.email,
        driverType: body.driverType ?? null,
      },
    });

    await sendWaitlistConfirmation(body.email);

    return { data: { id: entry.id }, message: "You're on the list!" };
  });
}
