import type { Metadata } from "next";
import MilesheetClientLayout from "./MilesheetClientLayout";

export const metadata: Metadata = {
  title: {
    default: "Milesheet by MileClear - staff mileage claims, ready for payroll",
    template: "%s - Milesheet by MileClear",
  },
  description:
    "Milesheet is the company side of MileClear. It records your staff's business mileage automatically, lets you approve it once a month, and gives you one file for payroll at HMRC approved rates.",
};

export default function MilesheetLayout({ children }: { children: React.ReactNode }) {
  return <MilesheetClientLayout>{children}</MilesheetClientLayout>;
}
