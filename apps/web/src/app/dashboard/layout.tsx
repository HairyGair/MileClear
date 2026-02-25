"use client";

import { AuthProvider } from "../../lib/auth-context";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import "./dashboard.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
