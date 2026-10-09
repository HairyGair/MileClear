"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { User } from "@mileclear/shared";
import { api } from "../api";
import { useAuth } from "../auth-context";
import { effectiveMode, readStoredMode, storeMode, type ViewMode } from "./mode";

export interface TeamMembership {
  orgId: string;
  orgName: string;
  role: string;
}

export interface Me {
  user: User | null;
  /** Effective Pro: subscription, referral credit, team or partner (the API merges them). */
  isPro: boolean;
  premiumSource: User["premiumSource"] | "partner";
  /** Non-null when the driver is on a company's Milesheet team. */
  team: TeamMembership | null;
  /** False until GET /team/me has answered, so rows don't flash. */
  teamReady: boolean;
  isCompanyDriver: boolean;
  isGigDriver: boolean;
  isEmployee: boolean;
  isAdmin: boolean;
  /** Effective view: work or personal. */
  mode: ViewMode;
  /** The base setting from Settings. Only "both" lets the driver switch. */
  baseMode: User["dashboardMode"];
  setMode: (mode: ViewMode) => void;
  refresh: () => Promise<void>;
}

const MeContext = createContext<Me | null>(null);

interface UnclassifiedValue {
  count: number;
  refresh: () => void;
}
const UnclassifiedContext = createContext<UnclassifiedValue>({ count: 0, refresh: () => {} });

/**
 * Wraps the signed-in dashboard. Reads the profile the AuthProvider already
 * loaded, adds the team lookup, and owns the Trips badge count.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const [stored, setStored] = useState<ViewMode>("work");
  const [team, setTeam] = useState<TeamMembership | null>(null);
  const [teamReady, setTeamReady] = useState(false);
  const [unclassified, setUnclassified] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setStored(readStoredMode());
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .get<{ data: TeamMembership | null }>("/team/me")
      .then((res) => {
        if (!cancelled) setTeam(res.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setTeam(null);
      })
      .finally(() => {
        if (!cancelled) setTeamReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Trips badge: refetch on route change and when the window regains focus.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      api
        .get<{ data?: { count?: number } | number; count?: number }>("/trips/unclassified/count")
        .then((res) => {
          if (cancelled) return;
          const raw = res as { count?: number; data?: { count?: number } | number };
          const n =
            typeof raw.data === "number"
              ? raw.data
              : typeof raw.data?.count === "number"
                ? raw.data.count
                : typeof raw.count === "number"
                  ? raw.count
                  : 0;
          setUnclassified(n);
        })
        .catch(() => {
          // Keep the last number. A badge is not worth an error.
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [userId, pathname, nonce]);

  const setMode = useCallback((m: ViewMode) => {
    setStored(m);
    storeMode(m);
  }, []);

  const me = useMemo<Me>(() => {
    const isCompanyDriver = team !== null;
    const workType = (user?.workType ?? null) as string | null;
    return {
      user,
      isPro: !!user?.isPremium,
      premiumSource: (user?.premiumSource ?? "none") as Me["premiumSource"],
      team,
      teamReady,
      isCompanyDriver,
      isGigDriver: (workType === "gig" || workType === "both") && !isCompanyDriver,
      isEmployee: workType === "employee" || workType === "both",
      isAdmin: !!user?.isAdmin,
      mode: effectiveMode(user?.dashboardMode, stored),
      baseMode: user?.dashboardMode ?? "both",
      setMode,
      refresh: refreshUser,
    };
  }, [user, team, teamReady, stored, setMode, refreshUser]);

  const unclassifiedValue = useMemo<UnclassifiedValue>(
    () => ({ count: unclassified, refresh: () => setNonce((n) => n + 1) }),
    [unclassified]
  );

  return (
    <MeContext.Provider value={me}>
      <UnclassifiedContext.Provider value={unclassifiedValue}>{children}</UnclassifiedContext.Provider>
    </MeContext.Provider>
  );
}

export function useMe(): Me {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used inside the dashboard shell");
  return ctx;
}

/** Unclassified trip count for the Trips badge. `refresh()` after sorting trips. */
export function useUnclassifiedCount(): UnclassifiedValue {
  return useContext(UnclassifiedContext);
}
