import type { Metadata } from "next";
import MilesheetClientLayout from "./MilesheetClientLayout";

export const metadata: Metadata = {
  title: {
    default: "Milesheet - staff mileage claims, ready for payroll",
    template: "%s - Milesheet",
  },
  description:
    "Milesheet records your staff's business mileage automatically, lets you approve it once a month, and gives you one file for payroll at HMRC approved rates.",
};

export default function MilesheetLayout({ children }: { children: React.ReactNode }) {
  return <MilesheetClientLayout>{children}</MilesheetClientLayout>;
}
