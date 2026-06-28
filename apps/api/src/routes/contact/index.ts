import { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendContactEmail } from "../../services/email.js";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().email("A valid email is required"),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export async function contactRoutes(app: FastifyInstance) {
  // POST /contact — public website contact form. Unauthenticated, so it's
  // rate-limited to blunt spam/abuse. Emails the support inbox with the
  // visitor's address as Reply-To.
  app.post(
    "/",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const parsed = contactSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const { name, email, message } = parsed.data;

      try {
        await sendContactEmail(name, email, message);
      } catch (err) {
        request.log.error(err, "contact form send failed");
        return reply
          .status(502)
          .send({ error: "Couldn't send your message. Please email support@mileclear.com directly." });
      }

      return { data: { ok: true }, message: "Message sent" };
    }
  );
}
