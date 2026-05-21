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
import { lookupExpense, type ExpenseStatus } from "./expenseBank.js";
import { nextOccurrences } from "./hmrcDeadlines.js";
import { TAX_TIPS } from "./taxTips.js";
import {
  getWeeklyLeaderboard,
  getPlatformStats,
  normalisePlatformKey,
  platformLabel,
} from "./communityStats.js";

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
  /** Option name → value map. Empty for commands that don't take args. */
  options?: Record<string, string | number | boolean>;
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
  const { commandName, discordUserId, options = {} } = input;

  // Commands that don't need a linked account work for anyone in the
  // server — useful for new joiners exploring before they connect.
  if (commandName === "help") return helpReply();
  if (commandName === "expense") return expenseReply(options);
  if (commandName === "deadline") return deadlineReply();
  if (commandName === "find") return findReply(options);
  if (commandName === "leaderboard") return leaderboardReply();
  if (commandName === "stats") return statsReply(options);

  // Personal-data commands require a linked account.
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
        description: "Ask the bot anything tax-related. Only you see the replies.",
        color: COLOUR_AMBER,
        fields: [
          {
            name: "📊 Personal stats (link your account first)",
            value:
              "`/miles` — business miles + AMAP deduction\n" +
              "`/tax` — live HMRC estimate + this week's set-aside\n" +
              "`/streak` — current + longest streak\n" +
              "`/savings` — tax saved through MileClear this year",
            inline: false,
          },
          {
            name: "🧾 Tax tools (no login needed)",
            value:
              "`/expense <thing>` — can I claim this on tax?\n" +
              "`/deadline` — the next 3 HMRC deadlines\n" +
              "`/find <keyword>` — search the tax tip bank",
            inline: false,
          },
          {
            name: "🏆 Community (anonymised)",
            value:
              "`/leaderboard` — this week's top drivers by business miles\n" +
              "`/stats <platform>` — community benchmark for Uber, Deliveroo, etc.",
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

// ── /expense ────────────────────────────────────────────────────────

const STATUS_META: Record<
  ExpenseStatus,
  { emoji: string; label: string; color: number }
> = {
  yes: { emoji: "✅", label: "Yes — fully deductible", color: COLOUR_EMERALD },
  partial: { emoji: "🟡", label: "Partial — business-use portion", color: COLOUR_AMBER },
  no: { emoji: "❌", label: "No — not deductible", color: 0xef4444 },
  depends: { emoji: "🤔", label: "Depends on your setup", color: COLOUR_SKY },
};

function expenseReply(options: Record<string, string | number | boolean>): SlashCommandResult {
  const query = typeof options.item === "string" ? options.item : "";
  if (!query.trim()) {
    return {
      content: "Tell me what you spent money on, e.g. `/expense parking` or `/expense phone bill`.",
    };
  }
  const entry = lookupExpense(query);
  if (!entry) {
    return {
      embeds: [
        {
          title: `🤔 I don't have "${query}" in the bank`,
          description:
            "Try a different phrasing — `parking`, `phone bill`, `accountant`, `breakdown cover`. Or open the app and ask in **#tax-and-hmrc** for community input.",
          color: COLOUR_DIM,
          footer: FOOTER,
        },
      ],
    };
  }

  const meta = STATUS_META[entry.status];
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (entry.note) {
    fields.push({ name: "Also worth knowing", value: entry.note });
  }
  return {
    embeds: [
      {
        title: `${meta.emoji} ${entry.name}`,
        description: `**${meta.label}**\n\n${entry.explanation}`,
        color: meta.color,
        fields: fields.length ? fields : undefined,
        footer: { text: "General guidance only — your specifics may differ. Ask an accountant." },
      },
    ],
  };
}

// ── /deadline ──────────────────────────────────────────────────────

function deadlineReply(): SlashCommandResult {
  const upcoming = nextOccurrences(new Date(), 3);
  const lines = upcoming.map((d) => {
    const dateStr = d.date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const countdown =
      d.daysAway === 0
        ? "**Today**"
        : d.daysAway === 1
          ? "**Tomorrow**"
          : d.daysAway <= 30
            ? `**${d.daysAway} days** — ${dateStr}`
            : `${d.daysAway} days — ${dateStr}`;
    return `${countdown}\n${d.label}\n_${d.what}_`;
  });
  return {
    embeds: [
      {
        title: "📅 Next HMRC deadlines",
        description: lines.join("\n\n"),
        color: COLOUR_AMBER,
        footer: FOOTER,
      },
    ],
  };
}

// ── /find ──────────────────────────────────────────────────────────

function findReply(options: Record<string, string | number | boolean>): SlashCommandResult {
  const query = typeof options.query === "string" ? options.query.toLowerCase() : "";
  if (!query.trim()) {
    return {
      content:
        "Tell me what to search, e.g. `/find pension` or `/find self assessment`.",
    };
  }
  // Score each tip on substring matches in title/body.
  const scored = TAX_TIPS.map((tip) => {
    const haystack = (tip.title + " " + tip.body).toLowerCase();
    let score = 0;
    if (haystack.includes(query)) score += 50;
    // Bonus for each individual word match
    for (const word of query.split(/\s+/)) {
      if (word.length >= 3 && haystack.includes(word)) score += 10;
    }
    return { tip, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return {
      embeds: [
        {
          title: `No tips matching "${query}"`,
          description:
            "Try a broader keyword — `pension`, `mileage`, `expenses`, `deadline`. The full tip bank covers 65 topics.",
          color: COLOUR_DIM,
          footer: FOOTER,
        },
      ],
    };
  }

  return {
    embeds: [
      {
        title: `🔍 ${scored.length} matching tip${scored.length === 1 ? "" : "s"}`,
        description: scored
          .map(({ tip }) => `**${tip.title}**\n${tip.body}`)
          .join("\n\n"),
        color: COLOUR_AMBER,
        footer: FOOTER,
      },
    ],
  };
}

// ── /leaderboard ────────────────────────────────────────────────────

async function leaderboardReply(): Promise<SlashCommandResult> {
  const board = await getWeeklyLeaderboard();
  if (board.entries.length === 0) {
    return {
      embeds: [
        {
          title: "🏆 Weekly leaderboard",
          description:
            "Not enough drivers tracking yet to show a leaderboard. The community needs at least 5 active drivers in the week before we surface rankings (privacy floor).",
          color: COLOUR_DIM,
          footer: FOOTER,
        },
      ],
    };
  }
  const lines = board.entries.map((e) => {
    const medal = e.position === 1 ? "🥇" : e.position === 2 ? "🥈" : "🥉";
    return `${medal} **${formatMiles(e.miles)}**`;
  });
  return {
    embeds: [
      {
        title: "🏆 Top drivers this week",
        description:
          lines.join("\n") +
          `\n\n_${board.totalActiveDrivers} drivers tracked at least one business trip this week. All anonymised._`,
        color: COLOUR_AMBER,
        footer: FOOTER,
      },
    ],
  };
}

// ── /stats <platform> ──────────────────────────────────────────────

async function statsReply(
  options: Record<string, string | number | boolean>
): Promise<SlashCommandResult> {
  const raw = typeof options.platform === "string" ? options.platform : "";
  if (!raw.trim()) {
    return {
      content:
        "Tell me which platform, e.g. `/stats uber` or `/stats deliveroo`.",
    };
  }
  const key = normalisePlatformKey(raw);
  if (!key) {
    return {
      embeds: [
        {
          title: `Don't recognise "${raw}"`,
          description:
            "Try one of: `uber`, `deliveroo`, `just_eat`, `amazon_flex`, `stuart`, `gophr`, `dpd`, `yodel`, `evri`, `freelance`.",
          color: COLOUR_DIM,
          footer: FOOTER,
        },
      ],
    };
  }
  const stats = await getPlatformStats(key);
  if (!stats) {
    return {
      embeds: [
        {
          title: `${platformLabel(key)} stats`,
          description:
            "Not enough drivers tagging trips with this platform yet (privacy floor of 5 contributors). Check back as the community grows.",
          color: COLOUR_DIM,
          footer: FOOTER,
        },
      ],
    };
  }
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Trips logged (30d)",
      value: stats.trips.toString(),
      inline: true,
    },
    {
      name: "Average per trip",
      value: formatMiles(stats.avgTripMiles),
      inline: true,
    },
    {
      name: "Contributing drivers",
      value: stats.contributors.toString(),
      inline: true,
    },
  ];
  if (stats.earningsPerMilePence != null) {
    const ppm = stats.earningsPerMilePence;
    fields.push({
      name: "Community average",
      value: `${formatPence(ppm)} per mile`,
      inline: false,
    });
  }
  return {
    embeds: [
      {
        title: `📊 ${platformLabel(key)} community stats`,
        description: `Last 30 days across MileClear drivers. Anonymised aggregates.`,
        color: COLOUR_SKY,
        fields,
        footer: FOOTER,
      },
    ],
  };
}
