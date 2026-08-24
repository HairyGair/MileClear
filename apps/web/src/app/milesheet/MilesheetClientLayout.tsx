"use client";

import { AuthProvider } from "../../lib/auth-context";
import { ToastProvider } from "../../components/ui/Toast";
import "../dashboard/dashboard.css";
import "./milesheet.css";

/**
 * Milesheet's shell. Provides auth and toasts but does NOT gate on a logged-in
 * user, because the overview page is public marketing. The portal does its own
 * gating.
 *
 * dashboard.css is imported for the shared component classes (cards, tables,
 * badges); milesheet.css then re-points the accent tokens, so those components
 * arrive in Milesheet's colours rather than MileClear's.
 */
export default function MilesheetClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="milesheet">{children}</div>
      </ToastProvider>
    </AuthProvider>
  );
}
