// Lets the onboarding screen tell the root layout it has finished.
//
// The layout holds onboardingComplete in React state and uses it in the
// Stack's redirect props. Finishing onboarding only wrote the flag to SQLite,
// so the layout never heard: "go to dashboard" was redirected straight back
// to onboarding, which remounted at step 1. From the outside, the last page
// would not let you past (26 Sep 2026).

type Listener = () => void;
const listeners = new Set<Listener>();

export function onOnboardingComplete(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markOnboardingComplete(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // one bad listener must not stop the others
    }
  }
}
