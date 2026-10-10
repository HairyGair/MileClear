// The app's help topics. The words live in @mileclear/shared (data/help.ts),
// the one source the Help and how-tos screen, the (i) help sheets
// (ContextualHelp), the website's help page and EmSee all read. Change the
// text there, not here; this file only picks the right words for this phone.

import type { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import {
  HELP_AREAS,
  HELP_AREA_SECTIONS,
  HELP_ENTRIES,
  buildHelpIndex,
  helpAnswerFor,
  type HelpEntry,
} from "@mileclear/shared";

export interface HelpTopic {
  id: string;
  q: string;
  a: string;
  /** Screen this topic is about, for a "Go there" button. */
  goTo?: string;
  externalUrl?: string;
}

export interface HelpSection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  topics: HelpTopic[];
}

const platform = Platform.OS === "android" ? "android" : "ios";

function shownOnThisPhone(e: HelpEntry): boolean {
  if (e.iosOnly && platform !== "ios") return false;
  if (e.androidOnly && platform !== "android") return false;
  return true;
}

function toTopic(e: HelpEntry): HelpTopic {
  return {
    id: e.id,
    q: e.q,
    a: helpAnswerFor(e, platform),
    ...(e.goTo ? { goTo: e.goTo } : {}),
    ...(e.externalUrl ? { externalUrl: e.externalUrl } : {}),
  };
}

const VISIBLE = HELP_ENTRIES.filter(shownOnThisPhone);

export const HELP_SECTIONS: HelpSection[] = HELP_AREAS.map((area) => ({
  title: HELP_AREA_SECTIONS[area].title,
  icon: HELP_AREA_SECTIONS[area].icon as keyof typeof Ionicons.glyphMap,
  topics: VISIBLE.filter((e) => e.area === area).map(toTopic),
})).filter((s) => s.topics.length > 0);

const TOPIC_INDEX = new Map<string, HelpTopic>(VISIBLE.map((e) => [e.id, toTopic(e)]));

/** One topic by its stable id, or null (call sites hide their help icon). */
export function getHelpTopic(id: string): HelpTopic | null {
  return TOPIC_INDEX.get(id) ?? null;
}

/** The sections for this phone (iPhone-only topics are left out on Android and the other way round). */
export function getVisibleHelpSections(): HelpSection[] {
  return HELP_SECTIONS;
}

const SEARCH = buildHelpIndex(VISIBLE);

/** Topics matching a search, best first. */
export function searchHelpTopics(query: string, limit = 8): HelpTopic[] {
  return SEARCH.search(query, limit).map(({ item }) => toTopic(item));
}
