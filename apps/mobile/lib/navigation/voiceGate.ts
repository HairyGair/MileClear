// One prompt at a time (DESIGN.md 3.1). Pure.
//
// - Muted, or on a call: nothing.
// - Something is being said: a "now" prompt (or arrival) cuts it off and goes
//   straight away; anything else is dropped, never queued (a late prompt is a
//   wrong prompt).
// - At least 5 seconds between prompt starts, except "now".

export const MIN_GAP_MS = 5_000;

export type GateDecision = "speak" | "interrupt" | "drop";

export interface GateState {
  speaking: boolean;
  lastStartAtMs: number | null;
}

export function gate(
  state: GateState,
  prompt: { urgent: boolean },
  ctx: { muted: boolean; inCall: boolean; nowMs: number }
): GateDecision {
  if (ctx.muted || ctx.inCall) return "drop";
  if (state.speaking) return prompt.urgent ? "interrupt" : "drop";
  if (!prompt.urgent && state.lastStartAtMs != null && ctx.nowMs - state.lastStartAtMs < MIN_GAP_MS) return "drop";
  return "speak";
}
