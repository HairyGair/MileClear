"use client";

import { PhoneOnlyPage } from "@/components/dashboard/shell/PhoneOnlyPage";

export default function Page() {
  return (
    <PhoneOnlyPage
      pageTitle="Work schedule"
      back={{ href: "/dashboard/more", label: "More" }}
      icon="calendar-outline"
      title="Set your work schedule in the app"
      body="Your working days and hours sort trips on your phone as you drive, so they're kept there."
    />
  );
}
