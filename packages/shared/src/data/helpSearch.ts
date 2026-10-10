// Deterministic search over the help answers (data/help.ts).
//
// Used by the app's Help screen search box, the website's help page and
// EmSee's mileclear_help tool, so a driver's own words ("how do i stop it
// tracking on holiday") land on the same written answer everywhere. Plain
// word matching with a few synonyms and one-letter typo tolerance; no model.

export interface SearchableHelp {
  id: string;
  q: string;
  a: string;
  keywords?: string[];
}

const STOP = new Set(
  "a an the i im i'm ive i've my me mine we our you your it its it's is are was were be been am do does did doing to of in on at for from by with and or but if so as this that these those there here what whats what's how hows where wheres when why who which can could would should will shall may might must just get got have has had not no yes any some all please mileclear app thing things way there's then than also too very really still want need know tell about into out up off one".split(
    " "
  )
);

/** Each group's words count as the same word. Keep groups small and literal. */
const SYNONYMS: string[][] = [
  ["vehicle", "car", "van", "motorbike", "motorcycle", "bike", "motor", "cars", "vans", "vehicles"],
  ["trip", "trips", "journey", "journeys", "drive", "drives", "drove", "driving"],
  ["record", "recording", "track", "tracking", "tracked", "log", "logging", "logged", "capture", "detect", "detection"],
  ["delete", "remove", "erase", "bin", "rid"],
  ["cancel", "unsubscribe", "stop"],
  ["subscription", "subscribe", "pro", "premium", "plan", "upgrade"],
  ["price", "cost", "costs", "much", "pay", "fee"],
  ["earnings", "earning", "income", "pay", "wages", "paid", "money"],
  ["expense", "expenses", "receipt", "receipts", "parking", "toll", "tolls"],
  ["business", "work"],
  ["classify", "classification", "sort", "mark", "tag", "label"],
  ["missing", "missed", "lost", "gone", "disappeared"],
  ["notification", "notifications", "alert", "alerts", "push", "reminder", "reminders"],
  ["battery", "power", "drain"],
  ["rate", "rates", "pence", "45p", "55p", "25p", "24p", "ppm"],
  ["tax", "hmrc", "taxman"],
  ["return", "self", "assessment", "sa", "sa103"],
  ["export", "download", "downloads", "csv", "pdf", "spreadsheet"],
  ["accountant", "bookkeeper"],
  ["employer", "boss", "company", "job", "employed", "employee"],
  ["place", "places", "location", "locations", "address", "home", "depot"],
  ["account", "login", "signin", "sign", "password", "email"],
  ["fuel", "petrol", "diesel"],
  ["help", "support", "contact", "team", "speak", "someone"],
  ["pause", "holiday", "break"],
  ["merge", "join", "combine"],
  ["split", "separate"],
  ["odometer", "mileometer", "reading", "readings", "clock"],
  ["mot", "roadtax"],
  ["website", "laptop", "computer", "web", "browser", "pc"],
  ["android", "samsung", "google", "pixel"],
  ["iphone", "ios", "apple"],
  ["settings", "setting", "options"],
  ["stats", "statistics", "insights", "trends", "numbers"],
  ["fine", "ticket", "pcn", "speeding"],
  ["bank", "banking", "statement"],
  ["free", "freebie"],
];

const CANON = new Map<string, string>();
for (const group of SYNONYMS) for (const w of group) if (!CANON.has(w)) CANON.set(w, group[0]);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Words of a text, lower-cased, stop words dropped, each with its canonical twin. */
export function helpTokens(text: string): string[] {
  const out: string[] = [];
  const words = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9£]+/g, " ")
    .split(" ")
    .filter(Boolean);
  for (const w of words) {
    if (STOP.has(w)) continue;
    const canon = CANON.get(w) ?? CANON.get(stem(w));
    out.push(stem(w));
    if (canon) out.push(`~${canon}`);
  }
  return out;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      // allow one swap of neighbours ("rceord")
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
        i += 2;
        j += 2;
        continue;
      }
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Indexed<T> {
  item: T;
  title: Set<string>;
  body: Set<string>;
}

export interface HelpIndex<T extends SearchableHelp> {
  search(query: string, limit?: number): { item: T; score: number }[];
}

/** Build a search index once; call `search` as often as needed. */
export function buildHelpIndex<T extends SearchableHelp>(items: readonly T[]): HelpIndex<T> {
  const docs: Indexed<T>[] = items.map((item) => ({
    item,
    title: new Set([...helpTokens(item.q), ...helpTokens((item.keywords ?? []).join(" "))]),
    body: new Set(helpTokens(item.a)),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.title, ...d.body])) df.set(t, (df.get(t) ?? 0) + 1);
  const vocab = [...df.keys()].filter((t) => !t.startsWith("~"));
  const idf = (t: string) => Math.log(1 + docs.length / (df.get(t) ?? 0.5));

  function expand(query: string): { token: string; weight: number }[] {
    const tokens = helpTokens(query);
    const out: { token: string; weight: number }[] = [];
    for (const t of tokens) {
      if (df.has(t)) {
        out.push({ token: t, weight: 1 });
        continue;
      }
      if (t.startsWith("~")) continue;
      // Typo: one letter wrong, missing, extra or swapped, words of 4+ letters.
      if (t.length >= 4) {
        const near = vocab.find((v) => v.length >= 4 && editDistanceAtMostOne(t, v));
        if (near) out.push({ token: near, weight: 0.8 });
      }
    }
    return out;
  }

  return {
    search(query: string, limit = 5) {
      const terms = expand(query);
      if (terms.length === 0) return [];
      const scored = docs.map((d) => {
        let score = 0;
        for (const { token, weight } of terms) {
          const w = idf(token) * weight * (token.startsWith("~") ? 0.6 : 1);
          if (d.title.has(token)) score += 3 * w;
          else if (d.body.has(token)) score += w;
        }
        return { item: d.item, score };
      });
      return scored
        .filter((s) => s.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, limit);
    },
  };
}
