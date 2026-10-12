"use client";

import { AuthProvider } from "../../lib/auth-context";
import { ToastProvider } from "../../components/dashboard/kit";

export default function PracticeClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="mc-app pc-app">
        <ToastProvider>{children}</ToastProvider>
      </div>
    </AuthProvider>
  );
}
