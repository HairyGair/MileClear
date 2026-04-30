import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import UnsubscribeClient from "./UnsubscribeClient";
import "../legal.css";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Manage your MileClear email preferences.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://mileclear.com/unsubscribe" },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as "ok" | "invalid" | "error" | undefined) ?? null;
  const token = params.token ?? null;

  return (
    <>
      <Navbar />
      <main className="legal">
        <div className="container">
          <div className="legal__header">
            <h1 className="heading">Email preferences</h1>
          </div>
          <UnsubscribeClient initialStatus={status} token={token} />
        </div>
      </main>
      <Footer />
    </>
  );
}
