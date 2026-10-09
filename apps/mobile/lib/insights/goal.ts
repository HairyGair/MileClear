// Weekly mileage goal: parsing what the driver types in the goal dialog.
// The goal lives on this phone (tracking_state key personal_goal_miles), the
// same field Settings > Work & tax and the onboarding step write.

export type GoalInput = { ok: true; miles: number } | { ok: false };

/** "50", " 62.46 " -> 62.5. Blank, zero, negative or non-numeric is not a goal. */
export function parseGoalInput(text: string): GoalInput {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false };
  const n = parseFloat(t);
  if (!isFinite(n) || n <= 0 || n > 100000) return { ok: false };
  return { ok: true, miles: Math.round(n * 10) / 10 };
}

export function goalRowText(goal: number | null, mode: "work" | "personal"): { title: string; sub: string; spoken: string } {
  if (goal !== null) {
    const g = Math.round(goal).toLocaleString("en-GB");
    return {
      title: `Weekly goal: ${g} miles`,
      sub: "Tap to change or remove it.",
      spoken: `Weekly goal, ${g} miles. Opens a box to change or remove it`,
    };
  }
  return {
    title: "Set a weekly goal",
    sub: mode === "personal" ? "Your goal shows on the dial above." : "A weekly mileage target for yourself.",
    spoken: "Set a weekly goal. Opens a box to type it in",
  };
}
