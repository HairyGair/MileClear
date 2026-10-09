"use client";

import { useMemo, useState } from "react";
import {
  MAR_GOV_UK_URL,
  MAR_P87_POST_URL,
  P87_MAX_CLAIM_PENCE,
  calculateMileageAllowanceRelief,
  type MarKindResult,
  type MileageReliefData,
} from "@mileclear/shared";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Figure,
  PageHeader,
  Skeleton,
  TaxYearPicker,
  formatMiles,
  formatPence,
  useData,
  useMe,
} from "@/components/dashboard/kit";
import { longDate } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

const KIND: Record<MarKindResult["kind"], string> = { car_van: "Car or van", motorcycle: "Motorbike", cycle: "Bicycle" };

function claimBy(d: { year: number; month: number; day: number }): string {
  return longDate(`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`);
}

/**
 * Mileage Allowance Relief. GET /mileage-relief gives the business miles for each
 * claimable year and the employer rate. The relief itself is worked out by the
 * same shared function the app uses (calculateMileageAllowanceRelief).
 */
export default function MileageReliefPage() {
  const { isEmployee } = useMe();
  const { data, error, loading, reload } = useData<MileageReliefData>(isEmployee ? "mileage-relief" : null, () =>
    api.get<{ data: MileageReliefData }>("/mileage-relief").then((r) => r.data)
  );
  const [picked, setPicked] = useState<string | null>(null);
  const year = data ? (data.years.find((y) => y.taxYear === picked) ?? data.years[0]) : undefined;

  const result = useMemo(() => {
    if (!data || !year || data.employerMileageRatePence == null) return null;
    return calculateMileageAllowanceRelief({
      taxYear: year.taxYear,
      carVanMiles: year.carVanMiles,
      motorcycleMiles: year.motorcycleMiles,
      employerPaid: {
        kind: "rates",
        carVanFirst10kPence: data.employerMileageRatePence,
        carVanAfter10kPence: data.employerMileageRatePenceAfter10k,
      },
      filesSelfAssessment: null,
      taxRegion: null,
    });
  }, [data, year]);

  const back = { href: "/dashboard/tax", label: "Tax" };

  if (!isEmployee) {
    return (
      <>
        <PageHeader title="Mileage Allowance Relief" back={back} />
        <EmptyState
          icon="cash-outline"
          title="This is for employees"
          body="It's for people paid a mileage allowance by an employer."
          action={{ label: "Back to Tax", href: "/dashboard/tax" }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mileage Allowance Relief" back={back}>
        If your employer pays you less than the approved rate for business miles in your own vehicle, you can claim tax relief on the gap.
      </PageHeader>
      <div className="mc-tax-page">
        {loading && !data && <Skeleton variant="card" count={2} />}
        {error && !data && <ErrorState title="Couldn't load your miles" onRetry={reload} />}

        {data && data.employerMileageRatePence == null && (
          <EmptyState
            icon="cash-outline"
            title="Add your employer's rate"
            body="We need what your employer pays per mile to work out the gap."
            action={{ label: "Set it in Work and tax", href: "/dashboard/settings/work-tax" }}
          />
        )}

        {data && data.employerMileageRatePence != null && year && (
          <>
            <div className="mc-tax-picker">
              <TaxYearPicker value={year.taxYear} onChange={setPicked} years={data.years.map((y) => y.taxYear)} />
            </div>

            {result === null || (year.carVanMiles <= 0 && year.motorcycleMiles <= 0) ? (
              <EmptyState
                icon="car-outline"
                title={`No business miles for ${year.taxYear}`}
                body="Mark your work trips as Business and they count here."
                action={{ label: "Go to trips", href: "/dashboard/trips" }}
              />
            ) : (
              <>
                <Card>
                  <Figure
                    size="lg"
                    estimated
                    label={`The gap you can claim for ${year.taxYear}`}
                    value={formatPence(result.reliefPence)}
                    sub={`Claim by ${claimBy(year.claimBy)}. This reduces your taxable pay. It is not the tax you get back.`}
                  />
                </Card>

                <Card title="How we worked it out" padded={false}>
                  <ul className="mc-tax-kv mc-tax-pad">
                    {result.kinds.map((k) => (
                      <li key={k.kind}>
                        <span className="mc-tax-kv__label">
                          {KIND[k.kind]}: {formatMiles(k.miles)}
                          <span className="mc-tax-kv__sub">
                            Approved: {formatPence(k.approvedPence)}. Your employer paid: {formatPence(k.paidPence)}.
                            {k.taxableExcessPence > 0 ? ` Paid ${formatPence(k.taxableExcessPence)} over the approved amount.` : ""}
                          </span>
                        </span>
                        <span className="mc-tax-kv__value">{formatPence(k.reliefPence)}</span>
                      </li>
                    ))}
                    <li className="is-total">
                      <span className="mc-tax-kv__label">Approved amount {formatPence(result.approvedPence)} less paid {formatPence(result.paidPence)}</span>
                      <span className="mc-tax-kv__value">{formatPence(result.reliefPence)}</span>
                    </li>
                  </ul>
                  {!result.ratesPublished && (
                    <p className="mc-tax-note mc-tax-padded">The approved rates for this year are not published yet, so last year&apos;s are used.</p>
                  )}
                </Card>

                {result.taxBack.length > 0 && result.reliefPence > 0 && (
                  <Card title="Tax you could get back">
                    {result.taxBack.map((tb) => (
                      <ul className="mc-tax-kv" key={tb.region} aria-label={tb.region === "rUK" ? "England, Wales or Northern Ireland" : "Scotland"}>
                        {tb.bands.map((b) => (
                          <li key={`${tb.region}-${b.label}`}>
                            <span className="mc-tax-kv__label">
                              {tb.region === "rUK" ? "England, Wales, N. Ireland" : "Scotland"}: {b.label} ({b.ratePct}%)
                            </span>
                            <span className="mc-tax-kv__value">about {formatPence(b.pence)}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                    <p className="mc-tax-note">Your rate is the highest rate you pay on your wages that year.</p>
                  </Card>
                )}

                {(year.commuteMilesLeftOut > 0 || year.selfEmployedMilesLeftOut > 0 || year.unclassifiedTrips > 0) && (
                  <Card tone="quiet">
                    <div className="mc-tax-stack">
                      {year.commuteMilesLeftOut > 0 && (
                        <p className="mc-tax-note">{formatMiles(year.commuteMilesLeftOut)} tagged as commuting are left out.</p>
                      )}
                      {year.selfEmployedMilesLeftOut > 0 && (
                        <p className="mc-tax-note">
                          {formatMiles(year.selfEmployedMilesLeftOut)} on trips tagged with a gig platform are left out. Those are self-employed and go on your Self Assessment.
                        </p>
                      )}
                      {year.unclassifiedTrips > 0 && (
                        <p className="mc-tax-note">
                          {year.unclassifiedTrips} {year.unclassifiedTrips === 1 ? "trip is" : "trips are"} not yet marked Business or Personal ({formatMiles(year.unclassifiedMiles)}).{" "}
                          <Button variant="link" size="sm" href="/dashboard/trips?view=inbox">
                            Sort them
                          </Button>
                        </p>
                      )}
                    </div>
                  </Card>
                )}

                <Card title="How to claim">
                  <div className="mc-tax-stack">
                    <p className="mc-tax-text">
                      Check each journey was business travel. Driving between home and your normal workplace is commuting and does not count.
                    </p>
                    <p className="mc-tax-text">
                      If your job expenses for a year come to {formatPence(P87_MAX_CLAIM_PENCE)} or less and you do not fill in Self Assessment, claim online or by post on form P87. Over that, or if you already fill in Self Assessment, claim on your tax return.
                    </p>
                    <p className="mc-tax-note">MileClear does not send the claim for you. You claim with HMRC, and HMRC decides what you get.</p>
                    <div className="mc-tax-inline">
                      <Button variant="secondary" href={MAR_GOV_UK_URL} external icon="open-outline">
                        Claim on GOV.UK
                      </Button>
                      <Button variant="secondary" href={MAR_P87_POST_URL} external icon="open-outline">
                        Claim by post (form P87)
                      </Button>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
