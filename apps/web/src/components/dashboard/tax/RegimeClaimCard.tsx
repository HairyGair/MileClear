"use client";

import { useState } from "react";
import { regimeClaimView, regimeFor, type RegimeClaimQuestion, type RegimeSummary } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, CardError, Figure, Skeleton, useData } from "@/components/dashboard/kit";
import { useCountryFeatures } from "@/lib/dashboard/country";
import "./tax.css";

/**
 * The mileage claim under the driver's country's rules, outside the UK (New
 * Zealand first, 23 Oct 2026). Figures from GET /tax/regime-summary, words from
 * regimeClaimView in shared, so the website says what the app says. Renders
 * nothing for UK drivers and for countries with no rules yet. It also asks
 * what IRD's rules need per vehicle (logbook or not, which kind of hybrid)
 * and saves the answer on the vehicle.
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

  const [answering, setAnswering] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const answer = async (q: RegimeClaimQuestion, value: string) => {
    setAnswering(`${q.vehicleId}-${q.field}`);
    setAnswerError(null);
    try {
      await api.patch(`/vehicles/${q.vehicleId}`, { [q.field]: value });
      reload();
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Couldn't save your answer.");
    } finally {
      setAnswering(null);
    }
  };

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
        {view.basisNote && <p className="mc-tax-note">{view.basisNote}</p>}
        {view.ratesNote && <p className="mc-tax-note">{view.ratesNote}</p>}
        {view.unsortedNote && <p className="mc-tax-note">{view.unsortedNote}</p>}
        {view.questions.map((q) => {
          const key = `${q.vehicleId}-${q.field}`;
          return (
            <div key={key} className="mc-tax-stack" data-testid={`claim-question-${q.field}`}>
              <p className="mc-tax-text">
                <strong>{view.questions.length > 1 || view.vehicles.length > 1 ? `${q.vehicleName}: ${q.prompt}` : q.prompt}</strong>
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {q.options.map((o) => (
                  <Button
                    key={o.value}
                    variant="secondary"
                    size="sm"
                    loading={answering === key}
                    onClick={() => answer(q, o.value)}
                    aria-label={`${o.label}, ${q.vehicleName}`}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
        {answerError && <p className="mc-tax-note" role="alert">{answerError}</p>}
        {(view.vehicles.length > 0 || view.notes.length > 0) && (
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
              {view.notes.map((n, i) => (
                <p key={i} className="mc-tax-note">
                  {n}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
