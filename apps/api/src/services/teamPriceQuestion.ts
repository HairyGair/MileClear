import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { redactNinosDeep } from "../lib/redactUrl.js";
import { currentLondonMonth } from "./teamExport.js";

// Milesheet pricing (Oct 2026): one question to a manager straight after
// they approve a month, in the portal or from the emailed link. "Milesheet
// is free while it is in its pilot. When it isn't, what would you expect to
// pay per driver each month?"
//
// Asked once per org: any answer from anyone in the org closes it for good.
// A skip closes it for the rest of that London month only, so it comes back
// next month. Both are stored as AppEvents (no table of their own):
//   team.price_answer  {orgId, answer, comment, via}
//   team.price_skipped {orgId, month, via}

export const PRICE_ANSWERS = ["gbp_2", "gbp_4", "gbp_6_plus", "would_not_pay"] as const;
export type PriceAnswer = (typeof PRICE_ANSWERS)[number];

export const PRICE_ANSWER_EVENT = "team.price_answer";
export const PRICE_SKIPPED_EVENT = "team.price_skipped";

export const priceResponseSchema = z
  .object({
    answer: z.enum(PRICE_ANSWERS).optional(),
    comment: z.string().trim().max(1000).optional(),
    skip: z.boolean().optional(),
  })
  .refine((v) => v.skip === true || v.answer !== undefined, { message: "Pick an answer or skip." });

export async function shouldAskPrice(orgId: string, month: string = currentLondonMonth()): Promise<boolean> {
  const answered = await prisma.appEvent.findFirst({
    where: { type: PRICE_ANSWER_EVENT, metadata: { path: "$.orgId", equals: orgId } },
    select: { id: true },
  });
  if (answered) return false;
  const skipped = await prisma.appEvent.findFirst({
    where: {
      type: PRICE_SKIPPED_EVENT,
      AND: [
        { metadata: { path: "$.orgId", equals: orgId } },
        { metadata: { path: "$.month", equals: month } },
      ],
    },
    select: { id: true },
  });
  return !skipped;
}

export interface PriceResponseInput {
  orgId: string;
  /** The signed-in manager, or null from the emailed link. */
  userId: string | null;
  via: "portal" | "email_link";
  answer?: PriceAnswer;
  comment?: string;
  skip?: boolean;
}

export type PriceResponseOutcome = "recorded" | "skipped" | "already_answered";

export async function recordPriceResponse(input: PriceResponseInput): Promise<PriceResponseOutcome> {
  const month = currentLondonMonth();
  // Once per org: a second answer (another admin, a second tab, a replayed
  // request) is not stored, so the read-out counts each org once.
  if (!(await shouldAskPrice(input.orgId, month))) return "already_answered";

  if (input.skip || !input.answer) {
    await prisma.appEvent.create({
      data: { type: PRICE_SKIPPED_EVENT, userId: input.userId, metadata: { orgId: input.orgId, month, via: input.via } },
    });
    return "skipped";
  }

  const comment = input.comment?.trim() ? input.comment.trim() : null;
  // Awaited rather than logEvent() (fire-and-forget), so the very next
  // shouldAskPrice already sees it. Free text is scrubbed of NI numbers the
  // same way logEvent does it.
  await prisma.appEvent.create({
    data: {
      type: PRICE_ANSWER_EVENT,
      userId: input.userId,
      metadata: redactNinosDeep({
        orgId: input.orgId,
        answer: input.answer,
        comment,
        via: input.via,
        month,
      }) as Prisma.InputJsonValue,
    },
  });
  return "recorded";
}
