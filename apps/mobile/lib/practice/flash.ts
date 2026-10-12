// One-shot confirmation line handed from the consent sheet to the screen
// beneath ("Shared with Smith & Co. You can see what they look at in More >
// Your accountant."). In memory only: it is for the next screen, not later.

let pending: string | null = null;

export function setPracticeFlash(message: string): void {
  pending = message;
}

export function takePracticeFlash(): string | null {
  const m = pending;
  pending = null;
  return m;
}
