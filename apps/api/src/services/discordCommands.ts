// Slash command handlers for the MileClear Discord server.
//
// Each command formats an ephemeral embed reply for the user who
// invoked it. The Discord user → MileClear user mapping is the
// User.discordUserId column set by the OAuth link flow (Phase 1A).
//
// Responses are intentionally short — Discord embeds need to be
// readable in a side panel + on mobile. Always end with a deep link
// back into the app so the command is a gateway, not a replacement.

import { prisma } from "../lib/prisma.js";
import { buildTaxSnapshot } from "./taxSnapshot.js";
import { getStats } from "./gamification.js";
import { formatPence, formatMiles } from "@mileclear/shared";

const COLOUR_AMBER = 0xfbbf24;
const COLOUR_EMERALD = 0x10b981;
const COLOUR_SKY = 0x38bdf8;
const COLOUR_DIM = 0x64748b;

// All ephemeral replies share this footer so the user knows where to
// go for the full picture.
const FOOTER = { text: "MileClear · open the app for more" };

export interface SlashCommandInput {
  commandName: string;
  discordUserId: string | undefined;
}

export interface SlashCommandResult {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
}

/**
 * Top-level router. Looks up the MileClear user from the Discord ID,
 * shunts unlinked users to a friendly "link first" reply, otherwise
 * dispatches to the per-command handler.
 */
export async function handleSlashCommand(
  input: SlashCommandInput
): Promise<SlashCommandResult> {
  const { commandName, discordUserId } = input;

  // /help is the one command that works without a linked account —
  // useful for new joiners exploring what's possible.
  if (commandName === "help") return helpReply();

  if (!discordUserId) {
    return unlinkedReply();
  }

  const user = await prisma.user.findUnique({
    where: { discordUserId },
    select: { id: true, displayName: true },
  });
  if (!user) return unlinkedReply();

  try {
    switch (commandName) {
      case "miles":
        return milesReply(user.id);
      case "tax":
        return taxReply(user.id);
      case "streak":
        return streakReply(user.id);
      case "savings":
        return savingsReply(user.id);
      default:
        return {
          content: `Unknown command \`/${commandName}\`. Try \`/help\` for the list.`,
        };
    }
  } catch (err) {
    console.warn(`[discordCommands] /${commandName} failed:`, err);
    return {
      content:
        "Something went wrong looking that up. Try again in a moment, or open the app.",
    };
  }
}

// ── /help ────────────────────────────────────────────────────────────

function helpReply(): SlashCommandResult {
  return {
    embeds: [
      {
        title: "MileClear commands",
        description:
          "Quick personal stats from the app. Only you see the replies.",
        color: COLOUR_AMBER,
        fields: [
          {
            name: "/miles",
            value: "Business miles this tax year + AMAP deduction",
            inline: false,
          },
          {
            name: "/tax",
            value: "Live HMRC estimate and the set-aside for this week",
            inline: false,
          },
          {
            name: "/streak",
            value: "Current streak, longest streak, and personal records",
            inline: false,
          },
          {
            name: "/savings",
            value: "Tax saved through MileClear so far this year",
            inline: false,
          },
          {
            name: "Need to link?",
            value:
              "Open MileClear → Settings → Community → **Connect Discord**.",
            inline: false,
          },
        ],
        footer: FOOTER,
      },
    ],
  };
}

// ── unlinked fallback ────────────────────────────────────────────────

function unlinkedReply(): SlashCommandResult {
  return {
    embeds: [
      {
        title: "Link your account first",
        description:
          "Open MileClear → **Settings → Community → Connect Discord**.\n\nOnce linked, your slash commands will show your own data.",
        color: COLOUR_DIM,
        footer: FOOTER,
      },
    ],
  };
}

// ── /miles ───────────────────────────────────────────────────────────

async function milesReply(userId: string): Promise<SlashCommandResult> {
  const stats = await getStats(userId);
  return {
    embeds: [
      {
        title: `📏 ${formatMiles(stats.businessMiles)} business miles · ${stats.taxYear}`,
        description: stats.businessMiles === 0
          ? "No business miles classified yet. Tracked trips need a Business tag to count."
          : `That's a **${formatPence(stats.deductionPence)}** deduction at HMRC's AMAP rates.`,
        color: COLOUR_AMBER,
        fields: [
          {
            name: "Total miles tracked",
            value: formatMiles(stats.totalMiles),
            inline: true,
          },
          {
            name: "Trips",
            value: stats.totalTrips.toString(),
            inline: true,
          },
          {
            name: "This week",
            value: formatMiles(stats.weekMiles),
            inline: true,
          },
        ],
        footer: FOOTER,
      },
    ],
  };
}

// ── /tax ─────────────────────────────────────────────────────────────

async function taxReply(userId: string): Promise<SlashCommandResult> {
  const snap = await buildTaxSnapshot(userId);
  const setAside = snap.setAsideThisWeek.suggestedSetAsidePence;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Gross earnings",
      value: formatPence(snap.ytd.grossEarningsPence),
      inline: true,
    },
    {
      name: "Mileage deduction",
      value: formatPence(snap.ytd.mileageDeductionPence),
      inline: true,
    },
    {
      name: "Effective rate",
      value: `${snap.ytd.effectiveRatePercent}%`,
      inline: true,
    },
  ];
  if (setAside > 0) {
    fields.push({
      name: "Set aside this week",
      value: `${formatPence(setAside)} (${snap.setAsideThisWeek.rateUsedPercent}% of last 7 days)`,
      inline: false,
    });
  }
  const days = snap.daysToFilingDeadline;
  const deadlineLine =
    days < 0
      ? `🚨 Self Assessment is **${Math.abs(days)} days overdue**.`
      : days <= 30
        ? `⏰ Self Assessment due in **${days} days**.`
        : `📅 ${days} days to the Self Assessment deadline.`;

  return {
    embeds: [
      {
        title: `💷 ${formatPence(snap.ytd.estimatedTaxPence)} estimated tax · ${snap.taxYear}`,
        description: deadlineLine,
        color: days <= 30 ? 0xef4444 : COLOUR_AMBER,
        fields,
        footer: FOOTER,
      },
    ],
  };
}

// ── /streak ──────────────────────────────────────────────────────────

async function streakReply(userId: string): Promise<SlashCommandResult> {
  const stats = await getStats(userId);
  const records = stats.personalRecords;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Longest streak",
      value: `${stats.longestStreakDays} ${stats.longestStreakDays === 1 ? "day" : "days"}`,
      inline: true,
    },
    {
      name: "Total trips",
      value: stats.totalTrips.toString(),
      inline: true,
    },
    {
      name: "Total shifts",
      value: stats.totalShifts.toString(),
      inline: true,
    },
  ];
  if (records?.longestSingleTrip != null && records.longestSingleTrip > 0) {
    fields.push({
      name: "Longest single trip",
      value: formatMiles(records.longestSingleTrip),
      inline: true,
    });
  }
  if (records?.mostMilesInDay != null && records.mostMilesInDay > 0) {
    fields.push({
      name: "Best day",
      value: formatMiles(records.mostMilesInDay),
      inline: true,
    });
  }

  return {
    embeds: [
      {
        title: stats.currentStreakDays > 0
          ? `🔥 ${stats.currentStreakDays}-day streak`
          : "Streak's on pause",
        description:
          stats.currentStreakDays > 0
            ? `Keep at least one tracked trip a day to keep it going.`
            : "Track any business trip today to start a fresh streak.",
        color: stats.currentStreakDays > 0 ? COLOUR_AMBER : COLOUR_DIM,
        fields,
        footer: FOOTER,
      },
    ],
  };
}

// ── /savings ─────────────────────────────────────────────────────────

async function savingsReply(userId: string): Promise<SlashCommandResult> {
  // Tax-savings proxy: business mileage deduction × the user's
  // effective rate. Not perfectly accurate (real savings depend on
  // marginal rate + NI bands), but close enough for a feel-good
  // command and uses figures already calculated by buildTaxSnapshot.
  const snap = await buildTaxSnapshot(userId);
  const deductionPence = snap.ytd.mileageDeductionPence;
  const effectiveRate = snap.ytd.effectiveRatePercent;
  // Reasonable floor: 20% (basic rate) — if effective rate hasn't
  // settled yet (early in tax year), don't undersell the saving.
  const rateUsed = Math.max(effectiveRate, 20);
  const savedPence = Math.round((deductionPence * rateUsed) / 100);

  return {
    embeds: [
      {
        title: `💰 ${formatPence(savedPence)} saved at tax time`,
        description:
          deductionPence === 0
            ? "Once you start classifying trips as business, your AMAP deduction shows up here."
            : `Estimated saving from claiming **${formatPence(deductionPence)}** in mileage deductions at a ${rateUsed}% effective rate.`,
        color: COLOUR_EMERALD,
        fields: [
          {
            name: "Tax year",
            value: snap.taxYear,
            inline: true,
          },
          {
            name: "Deduction claimed",
            value: formatPence(deductionPence),
            inline: true,
          },
        ],
        footer: { text: "Estimate — see the app for the official breakdown." },
      },
    ],
  };
}
