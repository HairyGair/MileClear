import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { PaywallModal } from "./PaywallModal";
import { ChallengeModal } from "./ChallengeModal";
import { useUser } from "../../lib/user/context";
import { getDatabase } from "../../lib/db/index";

interface PaywallContextValue {
  showPaywall: (source?: string) => void;
}

const PaywallContext = createContext<PaywallContextValue>({
  showPaywall: () => {},
});

export function usePaywall() {
  return useContext(PaywallContext);
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<string | undefined>();
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [challengeOffered, setChallengeOffered] = useState<boolean | null>(null);
  const { user } = useUser();
  const isFree = !user?.isPremium;

  // Load challenge state on mount
  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'challenge_offered'"
        );
        setChallengeOffered(row?.value === "true");
      } catch {
        setChallengeOffered(true); // Don't show on error
      }
    })();
  }, []);

  const showPaywall = useCallback((src?: string) => {
    setSource(src);
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    // Offer challenge on paywall dismiss (free users only, once ever)
    if (isFree && challengeOffered === false) {
      setChallengeOffered(true);
      setChallengeVisible(true);
    }
    setSource(undefined);
  }, [isFree, challengeOffered]);

  const handleChallengeClose = useCallback(() => {
    setChallengeVisible(false);
  }, []);

  return (
    <PaywallContext.Provider value={{ showPaywall }}>
      {children}
      <PaywallModal visible={visible} onClose={handleClose} source={source} />
      <ChallengeModal visible={challengeVisible} onClose={handleChallengeClose} />
    </PaywallContext.Provider>
  );
}
