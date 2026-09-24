// A likely correction for a number plate the DVLA does not know (24 Sep 2026).
//
// The commonest typo is a look-alike character in the wrong place: "DL740NT"
// for DL74 ONT, a zero where the letter O belongs. Current UK plates (since
// September 2001) are two letters, two digits, three letters, so each
// position can only be one kind of character. This swaps look-alikes into the
// kind the position needs and returns the result if it now fits that shape.
//
// Only a suggestion: the caller checks it with the DVLA before showing it,
// and the driver decides. Older plate shapes (prefix, suffix, dateless) have
// variable-length parts, so a swap there cannot be placed with confidence and
// is not attempted.

const CURRENT_FORMAT = /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/;

const DIGIT_TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B" };
const LETTER_TO_DIGIT: Record<string, string> = { O: "0", I: "1", S: "5", B: "8" };

// Position kinds for a current-format plate: L = letter, D = digit.
const CURRENT_KINDS = "LLDDLLL";

/** Same normalisation the vehicles route applies before storing a plate. */
export function normalisePlate(plate: string): string {
  return plate.replace(/\s+/g, "").toUpperCase();
}

/**
 * The plate with look-alike characters swapped so it fits the current UK
 * format, or null when no swap is needed or none makes it fit.
 */
export function suggestPlateCorrection(plate: string): string | null {
  const p = normalisePlate(plate);
  if (p.length !== CURRENT_KINDS.length) return null;
  if (CURRENT_FORMAT.test(p)) return null; // already the right shape

  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    const wantLetter = CURRENT_KINDS[i] === "L";
    const isDigit = c >= "0" && c <= "9";
    if (wantLetter && isDigit) out += DIGIT_TO_LETTER[c] ?? c;
    else if (!wantLetter && !isDigit) out += LETTER_TO_DIGIT[c] ?? c;
    else out += c;
  }
  return CURRENT_FORMAT.test(out) ? out : null;
}

/** "DL74ONT" -> "DL74 ONT" for messages, when it is a current-format plate. */
export function displayPlate(plate: string): string {
  const p = normalisePlate(plate);
  return CURRENT_FORMAT.test(p) ? `${p.slice(0, 4)} ${p.slice(4)}` : p;
}
