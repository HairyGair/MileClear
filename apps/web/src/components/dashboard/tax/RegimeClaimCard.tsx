"use client";

import { regimeClaimView, regimeFor, type RegimeSummary } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Card, CardError, Figure, Skeleton, useData } from "@/components/dashboard/kit";
import { useCountryFeatures } from "@/lib/dashboard/country";
import "./tax.css";

/**
 * The mileage claim under the driver's country's rules, outside the UK (New
 * Zealand first, 23 Oct 2026). Figures from GET /tax/regime-summary, words from
 * regimeClaimView in shared, so the website says what the app says. Renders
 * nothing for UK drivers and for countries with no rules yet.
 *
 *   <RegimeClaimCard />
 */
export function RegimeClaimCard() {
  const { country } = useCountryFeatures();
  const regime = regimeFor(country);
  const enabled = !!regime && regime.id !== "uk-hmrc";
  const { data, error, loading, reload } = useData<RegimeSummary | null>(
    enabled ? `regime-summary-${country}` : null,
    () => api.get<{ data: RegimeSummary | null }>("/tax/regime-summary").then((r) => r.data)
  );

  if (!enabled) return null;
  if (loading && !data) return <Skeleton variant="card" count={1} height={160} />;
  if (error && !data) {
    return (
      <Card title="Your mileage claim">
        <CardError onRetry={reload} />
      </Card>
    );
  }
  if (!data) return null;
  const view = regimeClaimView(data);

  return (
    <Card title={view.title}>
      <div className="mc-tax-stack">
        {view.amount ? (
          <Figure size="lg" label={`This tax year, ${data.taxYear}`} value={view.amount} sub={view.subline} />
        ) : (
          <p className="mc-tax-text">{view.subline}</p>
        )}
        {view.ratesNote && <p className="mc-tax-note">{view.ratesNote}</p>}
        {view.unsortedNote && <p className="mc-tax-note">{view.unsortedNote}</p>}
        {(view.vehicles.length > 0 || view.footnote) && (
          <details>
            <summary className="mc-tax-text">How it&apos;s worked out</summary>
            <div className="mc-tax-stack" style={{ marginTop: 8 }}>
              {view.vehicles.map((v, i) => (
                <div key={`${v.name}-${i}`}>
                  <p className="mc-tax-text">
                    <strong>{v.name}</strong>
                  </p>
                  {v.lines.map((l, j) => (
                    <p key={j} className="mc-tax-note">
                      {l}
                    </p>
                  ))}
                </div>
              ))}
              {view.footnote && <p className="mc-tax-note">{view.footnote}</p>}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
