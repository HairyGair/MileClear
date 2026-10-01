import { FastifyInstance } from "fastify";
import { z } from "zod";
import { logEvent } from "../../services/appEvents.js";

// QR code scans, reported by the website's own server (route /app, the Tyne
// Tunnel billboard, 1 Oct 2026). One event per scan: which link, and which
// store the phone was sent to. No IP, no user agent, no person.

const scanSchema = z.object({
  link: z.enum(["app"]),
  store: z.enum(["ios", "android", "other"]),
});

/** Only the website, calling from this machine, may report a scan. Requests
 *  from outside arrive through Apache, which always adds X-Forwarded-For, so
 *  a direct loopback call without that header is the website and nothing
 *  else. (trustProxy is on, so request.ip alone could be spoofed.) */
export function isLocalDirectCall(call: {
  headers: Record<string, unknown>;
  remoteAddress: string | undefined;
}): boolean {
  if (call.headers["x-forwarded-for"]) return false;
  const addr = call.remoteAddress ?? "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export async function marketingRoutes(app: FastifyInstance) {
  app.post("/scan", async (request, reply) => {
    if (!isLocalDirectCall({ headers: request.headers, remoteAddress: request.raw.socket?.remoteAddress })) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const parsed = scanSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Bad request" });
    logEvent("marketing.qr_scan", null, parsed.data);
    return reply.status(204).send();
  });
}
