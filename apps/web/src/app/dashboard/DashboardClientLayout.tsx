"use client";

import { AuthProvider } from "../../lib/auth-context";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ToastProvider } from "../../components/ui/Toast";
import "./dashboard.css";

export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ToastProvider>
        <DashboardShell>{children}</DashboardShell>
      </ToastProvider>
    </AuthProvider>
  );
}
