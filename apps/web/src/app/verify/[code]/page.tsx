import type { Metadata } from "next";
import Link from "next/link";
import {
  CERTIFICATE_STATEMENT,
  certificatePurposeLine,
  formatCertificateCode,
  formatCertificateDate,
  formatCertificateMonth,
  normaliseCertificateCode,
  type PublicCertificate,
} from "@mileclear/shared";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import "../verify.css";

// Public check of a mileage certificate: mileclear.com/verify/<code>.
// Reads GET /certificates/verify/:code fresh on every visit (a withdrawal must
// show at once). The API returns only the frozen snapshot, with the plate
// masked, and no figures once the owner withdraws it. Never indexed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check a MileClear mileage certificate",
  description: "Check the figures on a MileClear mileage certificate, as they were when it was issued.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

type Result =
  | { status: "ok"; data: PublicCertificate }
  | { status: "missing" }
  | { status: "error" };

async function fetchCertificate(code: string): Promise<Result> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
  try {
    const res = await fetch(`${base}/certificates/verify/${encodeURIComponent(code)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 400) return { status: "missing" };
    if (!res.ok) return { status: "error" };
    const body = (await res.json()) as { data?: PublicCertificate };
    return body.data ? { status: "ok", data: body.data } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

const miles = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const isoDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const isoMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="vf">
        <div className="container vf__inner">{children}</div>
      </main>
      <Footer />
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <section className="vf-card vf-card--notice" aria-labelledby="vf-title">
        <span className="label">Mileage certificate</span>
        <h1 id="vf-title" className="vf-title">{title}</h1>
        <p className="vf-lead">{body}</p>
      </section>
    </Shell>
  );
}

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normaliseCertificateCode(decodeURIComponent(raw));
  if (!code) {
    return (
      <Notice
        title="We couldn't find that certificate"
        body="Check the code against the certificate. It is 20 letters and numbers, printed in groups of four."
      />
    );
  }

  const result = await fetchCertificate(code);
  if (result.status === "missing") {
    return (
      <Notice
        title="We couldn't find that certificate"
        body={`No certificate has the code ${formatCertificateCode(code)}. Check it against the certificate.`}
      />
    );
  }
  if (result.status === "error") {
    return <Notice title="We couldn't check this right now" body="Please try again in a minute." />;
  }

  const c = result.data;
  if (c.status === "revoked") {
    return (
      <Shell>
        <section className="vf-card vf-card--withdrawn" aria-labelledby="vf-title">
          <span className="vf-status vf-status--withdrawn">Withdrawn</span>
          <h1 id="vf-title" className="vf-title">This certificate was withdrawn by its owner</h1>
          <p className="vf-lead">
            Certificate {formatCertificateCode(c.code)} was issued on {isoDay(c.issuedAt)} and withdrawn on{" "}
            {isoDay(c.revokedAt)}. Its figures are no longer shown.
          </p>
        </section>
      </Shell>
    );
  }

  const f = c.figures;
  const purpose = certificatePurposeLine(c.purpose);
  const maxMonth = Math.max(1, ...f.months.map((m) => m.miles));

  return (
    <Shell>
      <section className="vf-card" aria-labelledby="vf-title">
        <div className="vf-head">
          <span className="vf-status vf-status--valid">Valid</span>
          <span className="vf-code">{formatCertificateCode(c.code)}</span>
        </div>
        <span className="label">{purpose ?? "Mileage record"}</span>
        <h1 id="vf-title" className="vf-title">
          {c.driverName} recorded <em>{miles(f.totalMiles)}</em> in MileClear
        </h1>
        <p className="vf-lead">
          {formatCertificateDate(c.periodStart)} to {formatCertificateDate(c.periodEnd)}
          {c.taxYear ? ` (tax year ${c.taxYear})` : ""}. These are the figures as issued on {isoDay(c.issuedAt)}; later
          changes to the account do not change them.
        </p>

        <dl className="vf-facts">
          <div>
            <dt>{c.vehicles.length > 1 ? "Vehicles" : "Vehicle"}</dt>
            <dd>
              {c.vehicles.length === 0
                ? "No vehicle set on these trips"
                : c.vehicles.map((v) => (
                    <span key={`${v.make}-${v.model}-${v.registration ?? ""}`} className="vf-vehicle">
                      {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                      {v.registration ? <span className="vf-plate">{v.registration}</span> : null}
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt>Covers</dt>
            <dd>{c.singleVehicle ? "Trips in this vehicle only" : "All trips on the account"}</dd>
          </div>
          <div>
            <dt>Trips</dt>
            <dd>{plural(f.trips, "trip", "trips")}</dd>
          </div>
          <div>
            <dt>First and last trip</dt>
            <dd>{f.firstTripAt && f.lastTripAt ? `${isoDay(f.firstTripAt)} to ${isoDay(f.lastTripAt)}` : "None"}</dd>
          </div>
          <div>
            <dt>MileClear account since</dt>
            <dd>{isoMonth(c.accountCreatedAt)}</dd>
          </div>
        </dl>

        <div className="vf-grid">
          <div className="vf-block">
            <h2 className="vf-h2">How the miles were used</h2>
            <dl className="vf-rows">
              <div><dt>Business</dt><dd>{miles(f.businessMiles)}</dd></div>
              <div><dt>Personal</dt><dd>{miles(f.personalMiles)}</dd></div>
              <div><dt>Not yet marked business or personal</dt><dd>{miles(f.unclassifiedMiles)}</dd></div>
            </dl>
          </div>
          <div className="vf-block">
            <h2 className="vf-h2">How the trips were recorded</h2>
            <dl className="vf-rows">
              <div><dt>Automatically by the phone&apos;s GPS</dt><dd>{plural(f.gpsTrips, "trip", "trips")}, {miles(f.gpsMiles)}</dd></div>
              <div><dt>Added by hand by the driver</dt><dd>{plural(f.manualTrips, "trip", "trips")}, {miles(f.manualMiles)}</dd></div>
              <div><dt>Share of miles recorded by GPS</dt><dd>{f.gpsMilesPercent}%</dd></div>
            </dl>
          </div>
        </div>

        <div className="vf-block">
          <h2 className="vf-h2">Miles by month</h2>
          <ul className="vf-months">
            {f.months.map((m) => (
              <li key={m.month}>
                <span className="vf-months__name">{formatCertificateMonth(m.month)}</span>
                <span className="vf-months__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((m.miles / maxMonth) * 100)}%` }} />
                </span>
                <span className="vf-months__value">{miles(m.miles)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="vf-small">
          {CERTIFICATE_STATEMENT} No routes or addresses are shared, and the registration is partly hidden here. The
          owner can withdraw this certificate at any time; this page would then say so.
        </p>
      </section>
      <p className="vf-foot">
        <Link href="/">What is MileClear?</Link>
      </p>
    </Shell>
  );
}
