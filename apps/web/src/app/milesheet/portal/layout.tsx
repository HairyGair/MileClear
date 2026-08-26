"use client";

import { AuthProvider } from "../../../lib/auth-context";
import { ToastProvider } from "../../../components/ui/Toast";

// Auth is scoped to the portal, not to all of /milesheet, so the public
// overview page cannot be bounced to /login by a profile fetch.
export default function MilesheetPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
