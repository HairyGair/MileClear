import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { fetchProfile } from "../api/user";
import { fetchTeamMe, type TeamMembership } from "../api/team";
import { useAuth } from "../auth/context";
import type { User } from "@mileclear/shared";

interface UserContextValue {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  clearUser: () => void;
  /** The company this person drives for on Milesheet, if any. */
  company: TeamMembership | null;
  /**
   * Company mode. An employee claiming mileage back from their employer is
   * not a gig worker: earnings, platform tags and streaks are noise to them,
   * so the screens that carry that stuff hide it when this is true.
   */
  isCompanyDriver: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState<TeamMembership | null>(null);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchProfile();
      setUser(res.data);
      // Never let a team lookup failure blank the profile: company mode is a
      // presentation detail, the profile is not.
      try {
        setCompany(await fetchTeamMe());
      } catch {
        // Leave whatever we had; absent means "not in a company", which is
        // the safe default for a personal user.
      }
    } catch {
      // Silently fail — user stays null
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    } else {
      setUser(null);
      setCompany(null);
    }
  }, [isAuthenticated, refreshUser]);

  return (
    <UserContext.Provider
      value={{ user, isLoading, refreshUser, clearUser, company, isCompanyDriver: !!company }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
