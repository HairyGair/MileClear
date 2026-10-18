import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { stopReasonLabel, verifyStopReasonToken } from "../../services/stopReasons.js";

// "Why did you stop?" links from the win-back email (18 Oct 2026).
// GET shows the choice with a button and records nothing; POST records it.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#030712;color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}main{max-width:440px;margin:0 auto;padding:56px 20px}h1{font-size:22px;margin:0 0 12px}p{color:#c0c8d4;font-size:16px;line-height:1.6}strong{color:#f0f2f5}button{margin-top:12px;width:100%;padding:14px;border:0;border-radius:10px;background:#f5a623;color:#0a0e1a;font-size:16px;font-weight:700;cursor:pointer}a{color:#f5a623}</style></head>
<body><main><p style="font-weight:800;font-size:18px;color:#f0f2f5">Mile<span style="color:#f5a623">Clear</span></p>${inner}</main></body></html>`;
}

const INVALID = page("Link not recognised", "<h1>That link didn't work</h1><p>It may have been copied only in part. You can reply to our email instead and tell us there.</p>");

export async function stopReasonRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  // GET /why-stopped?t=<token>&r=<reason code>
  app.get("/", async (request, reply) => {
    const { t, r } = request.query as { t?: string; r?: string };
    const who = verifyStopReasonToken(t);
    const label = who && r ? stopReasonLabel(who.group, r) : null;
    reply.type("text/html; charset=utf-8");
    if (!who || !label || !t || !r) return reply.status(400).send(INVALID);
    return reply.send(
      page(
        "Why did you stop?",
        `<h1>Thanks for telling us</h1><p>You picked: <strong>${esc(label)}</strong></p>
<form method="post" action=""><input type="hidden" name="t" value="${esc(t)}"><input type="hidden" name="r" value="${esc(r)}"><button type="submit">Send</button></form>`
      )
    );
  });

  // POST /why-stopped  (form: t, r)
  app.post("/", async (request, reply) => {
    const { t, r } = (request.body ?? {}) as { t?: string; r?: string };
    const who = verifyStopReasonToken(t);
    const label = who && r ? stopReasonLabel(who.group, r) : null;
    reply.type("text/html; charset=utf-8");
    if (!who || !label) return reply.status(400).send(INVALID);
    const exists = await prisma.user.findUnique({ where: { id: who.userId }, select: { id: true } }).catch(() => null);
    if (exists) logEvent("winback.reason", who.userId, { group: who.group, reason: r });
    return reply.send(
      page(
        "Thank you",
        `<h1>Got it, thank you</h1><p>That helps us decide what to fix next. If you'd like to tell us more, just reply to the email.</p>`
      )
    );
  });
}
