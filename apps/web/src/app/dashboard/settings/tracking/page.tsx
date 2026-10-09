"use client";

import { PhoneOnlyPage } from "@/components/dashboard/shell/PhoneOnlyPage";

export default function Page() {
  return (
    <PhoneOnlyPage
      pageTitle="Tracking"
      back={{ href: "/dashboard/settings", label: "Settings" }}
      icon="phone-portrait-outline"
      title="Tracking is set on your phone"
      body="How MileClear records trips (automatic trips, classification rules, Bluetooth and battery settings) lives in the app, because it runs on your phone."
    />
  );
}
