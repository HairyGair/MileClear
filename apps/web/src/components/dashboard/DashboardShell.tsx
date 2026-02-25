"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { Sidebar } from "./Sidebar";
import { DashboardSkeleton } from "../ui/LoadingSkeleton";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="dash">
        <div className="sidebar" />
        <main className="dash__main">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="dash">
      <button
        className="dash__burger"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <span />
      </button>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="dash__main">{children}</main>
    </div>
  );
}
