"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { Sidebar } from "./Sidebar";
import { DashboardSkeleton } from "../ui/LoadingSkeleton";

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  // The admin area brings its own sidebar; two side by side wasted a third of the screen.
  const isAdmin = pathname?.startsWith("/dashboard/admin") ?? false;

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

  if (isAdmin) {
    return (
      <div className="dash dash--admin">
        <main className="dash__main">{children}</main>
      </div>
    );
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
