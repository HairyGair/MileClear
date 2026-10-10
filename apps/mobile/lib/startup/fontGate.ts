// Cold-start font gate. A screen opened straight from a deep link or a
// notification used to draw before Plus Jakarta Sans had loaded, so its text
// was measured in the fallback font and stayed clipped for the whole session
// ("You drive fo"). The root layout now draws nothing until this resolves.
// It never rejects and never waits longer than timeoutMs, so a font failure
// cannot leave the app stuck on the splash screen.

export const FONT_GATE_TIMEOUT_MS = 3000;

export type FontGateResult = "loaded" | "failed" | "timeout";

export function waitForFonts(
  load: () => Promise<unknown>,
  timeoutMs: number = FONT_GATE_TIMEOUT_MS,
): Promise<FontGateResult> {
  return new Promise<FontGateResult>((resolve) => {
    let done = false;
    const finish = (r: FontGateResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    try {
      load().then(
        () => finish("loaded"),
        () => finish("failed"),
      );
    } catch {
      finish("failed");
    }
  });
}
