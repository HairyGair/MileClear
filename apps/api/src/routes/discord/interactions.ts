// Discord interaction endpoint.
//
// Discord POSTs here whenever a user runs a slash command in the
// MileClear server. We verify the Ed25519 signature against
// DISCORD_PUBLIC_KEY, dispatch to a command handler, and return an
// ephemeral embed.
//
// Phase 1B of the community roadmap (21 May 2026). Personal data
// commands so drivers can check their miles / tax / streak / savings
// without leaving Discord.

import type { FastifyInstance } from "fastify";
import nacl from "tweetnacl";
import { handleSlashCommand } from "../../services/discordCommands.js";

const PUBLIC_KEY = () => process.env.DISCORD_PUBLIC_KEY || "";

// Discord interaction types we handle.
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;

// Response types Discord recognises (we only use these two).
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE_WITH_SOURCE = 4;

// Flag bit 6 = EPHEMERAL — only the invoking user sees the message.
export const EPHEMERAL_FLAG = 1 << 6;

function hexToUint8(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function verifySignature(
  signature: string,
  timestamp: string,
  rawBody: string
): boolean {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToUint8(signature),
      hexToUint8(PUBLIC_KEY())
    );
  } catch {
    return false;
  }
}

export async function discordInteractionsRoutes(app: FastifyInstance) {
  // Read the raw body off Node's underlying IncomingMessage BEFORE
  // any Fastify content-type parser runs. Discord signs the exact
  // bytes it sent, so any JSON re-serialisation (different key order,
  // whitespace, etc.) breaks signature verification.
  //
  // We don't use `app.addContentTypeParser("application/json", ...)`
  // because Fastify silently falls back to its default JSON parser
  // when plugin-scoped overrides collide with other plugins'
  // application/json parsers in the same app (Stripe + Apple webhooks
  // both register one). The preParsing hook below catches the raw
  // bytes guaranteed-cleanly.
  //
  // The hook is plugin-scoped (Fastify only fires it for routes
  // registered inside this plugin), so we don't need a route-URL
  // filter inside the hook. We rebuild the stream from the captured
  // buffer and return it so Fastify's downstream JSON parser still
  // sees the same bytes (in case anything wants request.body too).
  const { Readable } = await import("node:stream");
  app.addHook("preParsing", async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      payload.on("data", (chunk: Buffer | string) => {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      payload.on("end", () => resolve());
      payload.on("error", (err: Error) => reject(err));
    });
    const raw = Buffer.concat(chunks);
    (request as unknown as { rawDiscordBody?: Buffer }).rawDiscordBody = raw;
    request.log.debug(
      { bodyLen: raw.length, contentType: request.headers["content-type"] },
      "Discord interaction raw body captured"
    );
    // Hand Fastify a fresh stream containing the same bytes so the
    // JSON parser still works downstream.
    return Readable.from(raw);
  });

  app.post("/interactions", async (request, reply) => {
    if (!PUBLIC_KEY()) {
      return reply.status(503).send({ error: "Discord interactions not configured" });
    }

    const signature = request.headers["x-signature-ed25519"];
    const timestamp = request.headers["x-signature-timestamp"];
    if (typeof signature !== "string" || typeof timestamp !== "string") {
      return reply.status(401).send({ error: "Missing signature headers" });
    }

    const rawBuf = (request as unknown as { rawDiscordBody?: Buffer })
      .rawDiscordBody;
    const rawBody = rawBuf ? rawBuf.toString("utf8") : "";

    if (!verifySignature(signature, timestamp, rawBody)) {
      request.log.warn(
        { sigLen: signature.length, bodyLen: rawBody.length, timestamp },
        "Discord signature verification failed"
      );
      return reply.status(401).send({ error: "Bad signature" });
    }

    let interaction: any;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return reply.status(400).send({ error: "Bad JSON" });
    }

    // Type 1 — Discord pings the endpoint at registration time and
    // periodically to verify it's alive. Reply with PONG.
    if (interaction.type === INTERACTION_TYPE_PING) {
      return reply.send({ type: RESPONSE_TYPE_PONG });
    }

    // Type 2 — slash command invocation
    if (interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND) {
      const commandName: string = interaction.data?.name ?? "";
      const discordUserId: string | undefined =
        interaction.member?.user?.id ?? interaction.user?.id;

      // Build a name→value map from the command's options array.
      // Each option arrives as { name, type, value } in the payload.
      const optionsArr: Array<{ name: string; value?: unknown }> =
        interaction.data?.options ?? [];
      const options: Record<string, string | number | boolean> = {};
      for (const opt of optionsArr) {
        if (opt.value !== undefined) {
          options[opt.name] = opt.value as string | number | boolean;
        }
      }

      const result = await handleSlashCommand({
        commandName,
        discordUserId,
        options,
      });

      return reply.send({
        type: RESPONSE_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: EPHEMERAL_FLAG,
          ...result,
        },
      });
    }

    // Unknown interaction type — friendly fallback so Discord stops
    // retrying. Logging only for now; we can add component/modal
    // handlers in a later phase.
    request.log.warn({ type: interaction.type }, "Unhandled Discord interaction type");
    return reply.send({
      type: RESPONSE_TYPE_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: EPHEMERAL_FLAG,
        content: "Sorry, I don't know how to handle that yet.",
      },
    });
  });
}
