// How a street name is said out loud (docs/navigation-1.4.0/DESIGN.md 3.5).
//
//   "A1" -> "A one", "M62" -> "M sixty-two", "A1(M)" -> "A one M",
//   "A184" -> "A one eight four", "B1301" -> "B one three oh one".
// One or two digits are said as a number, three or more digit by digit with
// zero as "oh". A road number on its own gets "the": "onto the A19".
// "Coast Road (A1058)" is shown in full but said as "Coast Road". "&" is
// "and". Other bracketed text is dropped.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function twoDigits(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
}

function digits(s: string): string {
  if (s.length <= 2) return twoDigits(Number(s));
  return s
    .split("")
    .map((d) => (d === "0" ? "oh" : ONES[Number(d)]))
    .join(" ");
}

const ROAD_NUMBER = /^([ABM])(\d{1,4})(\(M\))?$/i;

/** "A1(M)" -> "A one M"; null when it is not a road number. */
export function spokenRoadNumber(token: string): string | null {
  const m = ROAD_NUMBER.exec(token.trim());
  if (!m) return null;
  return `${m[1].toUpperCase()} ${digits(m[2])}${m[3] ? " M" : ""}`;
}

export function isRoadNumber(name: string): boolean {
  return ROAD_NUMBER.test(name.trim());
}

/**
 * The street as spoken, or null when there is nothing to say. A bare road
 * number comes back with "the" in front.
 */
export function spokenStreet(name: string | null | undefined): string | null {
  if (!name) return null;
  const clean = name.replace(/&/g, " and ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (isRoadNumber(clean)) return `the ${spokenRoadNumber(clean)}`;
  // Bracketed text is not said ("Coast Road (A1058)" -> "Coast Road"),
  // unless it is all there is.
  let s = clean.replace(/\s*\([^)]*\)/g, "").trim();
  if (!s) {
    s = clean.replace(/[()]/g, "").trim();
    if (isRoadNumber(s)) return `the ${spokenRoadNumber(s)}`;
  }
  return s
    .split(" ")
    .map((w) => spokenRoadNumber(w) ?? w)
    .join(" ");
}
