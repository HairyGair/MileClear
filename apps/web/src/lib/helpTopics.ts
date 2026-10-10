// Help topics for the website. The words live in @mileclear/shared
// (data/help.ts), the one source the app's Help and how-tos screen, the
// website and EmSee all read. Change the text there, not here.

import { HELP_AREAS, HELP_AREA_SECTIONS, HELP_ENTRIES, buildHelpIndex, type HelpEntry } from "@mileclear/shared";

export interface HelpTopic {
  id: string;
  q: string;
  a: string;
  externalUrl?: string;
  /** Only on iPhone (Live Activities, Siri). */
  iosOnly?: boolean;
  androidOnly?: boolean;
  /** Something only the phone app does. */
  appOnly?: boolean;
}

export interface HelpSection {
  title: string;
  icon: string;
  topics: HelpTopic[];
}

function toTopic(e: HelpEntry): HelpTopic {
  return {
    id: e.id,
    q: e.q,
    a: e.android ? `${e.a}\n\nOn Android: ${e.android}` : e.a,
    ...(e.externalUrl ? { externalUrl: e.externalUrl } : {}),
    ...(e.iosOnly ? { iosOnly: true } : {}),
    ...(e.androidOnly ? { androidOnly: true } : {}),
    ...(e.appOnly ? { appOnly: true } : {}),
  };
}

export const HELP_SECTIONS: HelpSection[] = HELP_AREAS.map((area) => ({
  title: HELP_AREA_SECTIONS[area].title,
  icon: HELP_AREA_SECTIONS[area].icon,
  topics: HELP_ENTRIES.filter((e) => e.area === area).map(toTopic),
}));

/** Topics about something only the phone app does get an "In the app" tag. */
export function isPhoneTopic(topic: HelpTopic): boolean {
  return !!(topic.appOnly || topic.iosOnly || topic.androidOnly);
}

const INDEX = buildHelpIndex(HELP_ENTRIES);

/** Sections filtered by a search: plain text match first, then the shared word search. */
export function filterHelpSections(query: string): HelpSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_SECTIONS;
  const matched = new Set(INDEX.search(q, 12).map((r) => r.item.id));
  return HELP_SECTIONS.map((section) => ({
    ...section,
    topics: section.topics.filter((t) => matched.has(t.id) || `${t.q} ${t.a}`.toLowerCase().includes(q)),
  })).filter((section) => section.topics.length > 0);
}
