import { describe, expect, it } from "vitest";
import {
  MAX_PAUSE_MS,
  reportPauseDiagnosis,
  reportSelfAdded,
  reportTimeWindow,
} from "../../services/adminObservability.js";

const HOUR = 60 * 60 * 1000;
const t = (s: string) => Date.parse(s);
const REPORTED = new Date("2026-09-26T10:00:00Z");
const ev = (at: string, event: string, data?: Record<string, unknown>) => ({
  recorded_at: at,
  event,
  data: data ? JSON.stringify(data) : null,
});

describe("reportTimeWindow", () => {
  it("uses the departure time when the app sent one", () => {
    expect(reportTimeWindow(REPORTED, { departAt: "2026-09-24T12:40:00.000Z" })).toEqual({
      from: t("2026-09-24T12:40:00Z"),
      to: t("2026-09-24T12:40:00Z"),
      exact: true,
    });
  });

  it("widens a reported day by an hour each side", () => {
    const w = reportTimeWindow(REPORTED, { reportedDate: "2026-09-24" });
    expect(w.from).toBe(t("2026-09-23T23:00:00Z"));
    expect(w.to).toBe(t("2026-09-25T01:00:00Z"));
    expect(w.exact).toBe(false);
  });

  it("falls back to the report time", () => {
    expect(reportTimeWindow(REPORTED, {}).from).toBe(REPORTED.getTime());
  });
});

describe("reportPauseDiagnosis", () => {
  it("is null with nothing to go on", () => {
    expect(reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { note: "x" } })).toBeNull();
    expect(reportPauseDiagnosis({ reportedAt: REPORTED, metadata: null, dump: null })).toBeNull();
  });

  it("trusts the report's pause when it covers the departure", () => {
    const d = reportPauseDiagnosis({
      reportedAt: REPORTED,
      metadata: {
        departAt: "2026-09-25T08:00:00.000Z",
        pausedUntil: t("2026-10-01T05:00:00Z"),
        pauseStartedAt: t("2026-09-24T19:00:00Z"),
      },
    });
    expect(d?.source).toBe("report");
    expect(d?.until).toBe(t("2026-10-01T05:00:00Z"));
  });

  it("ignores the report's pause when it began after the drive", () => {
    expect(
      reportPauseDiagnosis({
        reportedAt: REPORTED,
        metadata: {
          departAt: "2026-09-24T08:00:00.000Z",
          pausedUntil: t("2026-10-01T05:00:00Z"),
          pauseStartedAt: t("2026-09-25T19:00:00Z"),
        },
      })
    ).toBeNull();
  });

  it("bounds an unknown pause start to a week and a day", () => {
    const until = t("2026-10-01T05:00:00Z");
    const inside = new Date(until - MAX_PAUSE_MS + HOUR).toISOString();
    const outside = new Date(until - MAX_PAUSE_MS - HOUR).toISOString();
    expect(reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: inside, pausedUntil: until } })).not.toBeNull();
    expect(reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: outside, pausedUntil: until } })).toBeNull();
  });

  it("finds a refused drive near the departure in the dump", () => {
    const d = reportPauseDiagnosis({
      reportedAt: REPORTED,
      metadata: { departAt: "2026-09-25T08:00:00.000Z" },
      dump: {
        capturedAt: REPORTED,
        statusJson: {},
        eventsJson: [ev("2026-09-25T08:20:00Z", "detection_skipped", { reason: "paused", until: t("2026-09-26T05:00:00Z") })],
      },
    });
    expect(d?.source).toBe("dump_skip");
    expect(d?.until).toBe(t("2026-09-26T05:00:00Z"));
  });

  it("does not blame a skip for another reason", () => {
    expect(
      reportPauseDiagnosis({
        reportedAt: REPORTED,
        metadata: { departAt: "2026-09-25T08:00:00.000Z" },
        dump: {
          capturedAt: REPORTED,
          statusJson: {},
          eventsJson: [ev("2026-09-25T08:20:00Z", "detection_skipped", { reason: "disabled" })],
        },
      })
    ).toBeNull();
  });

  it("uses pause spans from the dump, closed early by a resume", () => {
    const dump = {
      capturedAt: REPORTED,
      statusJson: {},
      eventsJson: [
        ev("2026-09-24T19:00:00Z", "drive_paused", { until: t("2026-09-25T05:00:00Z"), choice: "tomorrow" }),
        ev("2026-09-24T21:00:00Z", "drive_resumed", { reason: "manual" }),
      ],
    };
    expect(
      reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: "2026-09-24T20:00:00.000Z" }, dump })?.source
    ).toBe("dump_events");
    expect(
      reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: "2026-09-24T22:00:00.000Z" }, dump })
    ).toBeNull();
  });

  it("matches a pause span against a reported day", () => {
    const d = reportPauseDiagnosis({
      reportedAt: REPORTED,
      metadata: { reportedDate: "2026-09-25" },
      dump: {
        capturedAt: REPORTED,
        statusJson: {},
        eventsJson: [ev("2026-09-24T19:00:00Z", "drive_paused", { until: t("2026-09-25T05:00:00Z") })],
      },
    });
    expect(d?.source).toBe("dump_events");
  });

  it("reads a pause running at dump time from tracking_state", () => {
    const until = t("2026-10-01T05:00:00Z");
    const dump = {
      capturedAt: new Date("2026-09-25T07:00:00Z"),
      statusJson: { trackingState: [{ key: "drive_pause_until", value: String(until) }] },
      eventsJson: [],
    };
    expect(
      reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: "2026-09-25T09:00:00.000Z" }, dump })?.source
    ).toBe("dump_state");
    // The drive was before the dump: tracking_state cannot say the pause was on then.
    expect(
      reportPauseDiagnosis({ reportedAt: REPORTED, metadata: { departAt: "2026-09-25T06:00:00.000Z" }, dump })
    ).toBeNull();
  });
});

describe("reportSelfAdded", () => {
  it("counts a self-add within a day after the report", () => {
    expect(
      reportSelfAdded(REPORTED, [{ type: "trip.report_missing_self_added", createdAt: new Date(REPORTED.getTime() + 60_000) }])
    ).toBe(true);
    expect(
      reportSelfAdded(REPORTED, [{ type: "trip.report_missing_self_added", createdAt: new Date(REPORTED.getTime() - 60_000) }])
    ).toBe(false);
    expect(reportSelfAdded(REPORTED, [{ type: "support.reply_sent", createdAt: REPORTED }])).toBe(false);
  });
});
