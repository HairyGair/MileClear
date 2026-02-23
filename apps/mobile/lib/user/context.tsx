import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { fetchProfile } from "../api/user";
import { useAuth } from "../auth/context";
import type { User } from "@mileclear/shared";

interface UserContextValue {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  clearUser: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchProfile();
      setUser(res.data);
    } catch {
      // Silently fail — user stays null
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    } else {
      setUser(null);
    }
  }, [isAuthenticated, refreshUser]);

  return (
    <UserContext.Provider value={{ user, isLoading, refreshUser, clearUser }}>
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
