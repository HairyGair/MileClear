"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "../../lib/auth-context";
import { MeProvider } from "../../lib/dashboard/useMe";
import { Shell, ShellSkeleton } from "../../components/dashboard/shell/Shell";
import { PageMetaProvider } from "../../components/dashboard/shell/pageMeta";
import { ToastProvider as KitToastProvider } from "../../components/dashboard/kit";
import { ToastProvider as LegacyToastProvider } from "../../components/ui/Toast";
import { DashboardSkeleton } from "../../components/ui/LoadingSkeleton";
import "./dashboard.css";

/** Sends a signed-out visitor to /login, remembering where they were going. */
function useAuthGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user) return;
    const here = `${pathname ?? "/dashboard"}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [loading, user, router, pathname]);

  return { user, loading };
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user, loading } = useAuthGuard();
  // The admin area brings its own shell (AdminShell). It is left exactly as it was.
  const isAdminArea = pathname.startsWith("/dashboard/admin");

  if (isAdminArea) {
    if (loading || !user) {
      return (
        <div className="dash">
          <div className="sidebar" />
          <main className="dash__main">
            <DashboardSkeleton />
          </main>
        </div>
      );
    }
    return (
      <div className="dash dash--admin">
        <main className="dash__main">{children}</main>
      </div>
    );
  }

  if (loading || !user) {
    return (
      <div className="mc-app">
        <ShellSkeleton />
      </div>
    );
  }

  return (
    <div className="mc-app">
      <MeProvider>
        <PageMetaProvider>
          <KitToastProvider>
            <Shell>{children}</Shell>
          </KitToastProvider>
        </PageMetaProvider>
      </MeProvider>
    </div>
  );
}

export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LegacyToastProvider>
        <Frame>{children}</Frame>
      </LegacyToastProvider>
    </AuthProvider>
  );
}
