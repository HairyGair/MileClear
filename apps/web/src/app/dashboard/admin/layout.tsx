"use client";

import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/ui/AdminShell";
import "./admin.css";

// The admin area's frame (Oct 2026 rebuild): a grouped sidebar with every
// section, a top bar with the find-a-user search, and the page. The nav list
// lives in components/admin/ui/nav.ts. Every older admin URL still resolves
// and lights up the section it belongs to.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
