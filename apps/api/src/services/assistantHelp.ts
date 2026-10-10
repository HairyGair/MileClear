/**
 * EmSee's "how does MileClear work" knowledge.
 *
 * The written answers live in packages/shared/src/data/help.ts, the same
 * source the app's Help and how-tos screen and the website's help page read,
 * so EmSee, the app and the website always give the same menu paths and the
 * same free/Pro facts. When a screen moves or a feature ships, change it
 * there. This file only shapes the answers for the mileclear_help tool.
 */
import {
  HELP_AREAS,
  HELP_AREA_LABELS,
  HELP_ENTRIES,
  buildHelpIndex,
  type HelpArea,
  type HelpEntry,
} from "@mileclear/shared";

export { HELP_AREAS, HELP_AREA_LABELS, HELP_ENTRIES };
export type { HelpArea, HelpEntry };

interface ToolAnswer {
  q: string;
  a: string;
  /** Present when the steps differ on Android. */
  on_android?: string;
  /** Only on iPhone, or only on Android. */
  only_on?: "iPhone" | "Android";
}

function toAnswer(e: HelpEntry): ToolAnswer {
  return {
    q: e.q,
    a: e.a,
    ...(e.android ? { on_android: e.android } : {}),
    ...(e.iosOnly ? { only_on: "iPhone" as const } : e.androidOnly ? { only_on: "Android" as const } : {}),
  };
}

const INDEX = buildHelpIndex(HELP_ENTRIES);

/** The written answers that best match a driver's question, best first. */
export function searchHelp(question: string, limit = 4): (ToolAnswer & { area: HelpArea })[] {
  return INDEX.search(question, limit).map(({ item }) => ({ area: item.area, ...toAnswer(item) }));
}

/** Everything written for one area, plus the list of areas to try next. */
export function helpForArea(area: HelpArea): {
  area: HelpArea;
  covers: string;
  answers: ToolAnswer[];
  other_areas: Record<string, string>;
} {
  return {
    area,
    covers: HELP_AREA_LABELS[area],
    answers: HELP_ENTRIES.filter((e) => e.area === area).map(toAnswer),
    other_areas: Object.fromEntries(HELP_AREAS.filter((x) => x !== area).map((x) => [x, HELP_AREA_LABELS[x]])),
  };
}

/**
 * The mileclear_help tool: the best matches for the driver's question, and
 * the whole of one area when the model names it.
 */
export function mileclearHelpLookup(input: { question?: string; area?: HelpArea }) {
  const best = input.question ? searchHelp(input.question) : [];
  if (input.area) return { best_matches: best, ...helpForArea(input.area) };
  return {
    best_matches: best,
    areas: HELP_AREA_LABELS,
    note: best.length
      ? "If none of these answers the question, call again with the most likely area."
      : "Nothing matched those words. Call again with the most likely area.",
  };
}
