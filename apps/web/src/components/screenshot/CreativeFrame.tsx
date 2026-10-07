import { ACCENT_THEMES, DeviceMockup } from "./ScreenshotFrame";

// App Store "creative assets" (Oct 2026): the product page header and the
// search result image. Shown on iOS 27 and later; older phones still see
// screenshots. Specs: developer.apple.com/help/app-store-connect/reference/
// app-information/creative-assets-specifications
//
//   header  3840 x 1646 (21:9)  - one idea, brand-led, focal point centred
//   search  3840 x 2560 (3:2)   - "state the obvious", show the real app
//
// No <header> element anywhere: the composer layout hides them.

export type CreativeKind = "header" | "search";

export const CREATIVE_DIMENSIONS: Record<CreativeKind, { width: number; height: number }> = {
  header: { width: 3840, height: 1646 },
  search: { width: 3840, height: 2560 },
};

const OCT = "/screenshot-source/iphone-oct";

interface CreativeVariant {
  headline: string;
  subline: string;
  // Phones, back to front. The last one is in front.
  phones: string[];
}

const VARIANTS: Record<CreativeKind, Record<string, CreativeVariant>> = {
  header: {
    main: {
      headline: "Every mile,\ncounted.",
      subline: "Automatic mileage tracking for UK drivers.",
      phones: [`${OCT}/trips-all.png`, `${OCT}/journey-map.png`, `${OCT}/home-work.png`],
    },
    gig: {
      headline: "Every drop,\nevery mile.",
      subline: "Mileage tracking for delivery drivers.",
      phones: [`${OCT}/d-tabsearnings.png`, `${OCT}/journey-map.png`, `${OCT}/d-trips-biz.png`],
    },
    tax: {
      headline: "Your tax,\nworked out.",
      subline: "Mileage and Self Assessment, in plain English.",
      phones: [`${OCT}/d-sa6.png`, `${OCT}/d-sa2.png`, `${OCT}/d-tax.png`],
    },
    employee: {
      headline: "Paid under\n55p a mile?",
      subline: "Work out the tax relief on your work miles.",
      phones: [`${OCT}/e-project-totals.png`, `${OCT}/e-home.png`, `${OCT}/e-mileage-relief.png`],
    },
    personal: {
      headline: "Every mile,\nmapped.",
      subline: "See where your driving goes.",
      phones: [`${OCT}/trip-summary.png`, `${OCT}/insights-trends.png`, `${OCT}/journey-map.png`],
    },
  },
  search: {
    main: {
      headline: "Mileage tracker\nfor UK drivers",
      subline: "Records your drives on its own.\nWorks out your mileage claim.",
      phones: [`${OCT}/trips-all.png`, `${OCT}/home-work.png`],
    },
    gig: {
      headline: "Mileage tracker\nfor delivery\ndrivers",
      subline: "Every drop recorded.\nEarnings by app.",
      phones: [`${OCT}/d-tabsearnings.png`, `${OCT}/d-trips-biz.png`],
    },
    tax: {
      headline: "Mileage and\ntax return,\nsorted",
      subline: "Your claim worked out.\nPlain English, step by step.",
      phones: [`${OCT}/d-sa2.png`, `${OCT}/d-tax.png`],
    },
    employee: {
      headline: "Mileage for\nwork drivers",
      subline: "Track your work miles.\nSee the relief you can claim.",
      phones: [`${OCT}/e-project-totals.png`, `${OCT}/e-mileage-relief.png`],
    },
    personal: {
      headline: "Track every\njourney",
      subline: "Your drives, routes and fuel costs,\nrecorded on their own.",
      phones: [`${OCT}/trips-all.png`, `${OCT}/journey-map.png`],
    },
  },
};

export function getCreative(kind: CreativeKind, variant: string): CreativeVariant | undefined {
  return VARIANTS[kind][variant];
}

export function creativeVariants(kind: CreativeKind): string[] {
  return Object.keys(VARIANTS[kind]);
}

export default function CreativeFrame({ kind, variant }: { kind: CreativeKind; variant: CreativeVariant }) {
  const { width, height } = CREATIVE_DIMENSIONS[kind];
  const theme = ACCENT_THEMES.amber;
  const isHeader = kind === "header";

  // Header: the copy and the phones share the centre ~70% so nothing
  // important is lost if the App Store crops the sides on a narrow phone.
  const phoneHeight = isHeader ? 1280 : 2000;
  const headlineSize = isHeader ? 190 : 230;
  const sublineSize = isHeader ? 64 : 80;
  const phones = variant.phones;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Sora', system-ui, sans-serif",
        color: "#f9fafb",
        background: `
          radial-gradient(ellipse ${width * 0.45}px ${height * 0.9}px at 68% 55%, ${theme.glow} 0%, transparent 60%),
          radial-gradient(ellipse ${width * 0.3}px ${height * 0.7}px at 15% 0%, ${theme.tint} 0%, transparent 60%),
          linear-gradient(180deg, #060a16 0%, #030712 60%, #0a1020 100%)
        `,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: isHeader ? 160 : 140,
      }}
    >
      {/* Road line: a soft amber curve behind everything, the brand's one motif */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={`M -100 ${height * 0.92} C ${width * 0.3} ${height * 0.7}, ${width * 0.45} ${height * 1.05}, ${width * 0.7} ${height * 0.55} S ${width * 1.05} ${height * 0.1}, ${width + 100} ${height * 0.2}`}
          fill="none"
          stroke={theme.primary}
          strokeWidth={isHeader ? 10 : 14}
          strokeLinecap="round"
          strokeDasharray={isHeader ? "2 40" : "2 52"}
        />
      </svg>

      {/* Copy */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: isHeader ? 1500 : 1500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: isHeader ? 56 : 80 }}>
          <img
            src="/branding/logo-120x120.png"
            alt=""
            style={{ width: isHeader ? 110 : 140, height: isHeader ? 110 : 140, borderRadius: isHeader ? 26 : 32 }}
          />
          <div style={{ fontSize: isHeader ? 84 : 104, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
            <span style={{ color: "#f9fafb" }}>Mile</span>
            <span style={{ color: theme.primary }}>Clear</span>
          </div>
        </div>
        <h1
          style={{
            fontSize: headlineSize,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            margin: 0,
            whiteSpace: "pre-line",
            background: `linear-gradient(180deg, #ffffff 0%, ${theme.primary} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {variant.headline}
        </h1>
        <p
          style={{
            marginTop: isHeader ? 56 : 80,
            marginBottom: 0,
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontSize: sublineSize,
            lineHeight: 1.3,
            color: "#cbd5e1",
            whiteSpace: "pre-line",
          }}
        >
          {variant.subline}
        </p>
      </div>

      {/* Phones: fanned, back to front */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
        {phones.map((src, i) => {
          const fromFront = phones.length - 1 - i;
          const scale = 1 - fromFront * 0.1;
          const rotate = phones.length === 1 ? -3 : (i - (phones.length - 1) / 2) * 6;
          return (
            <div
              key={src}
              style={{
                marginLeft: i === 0 ? 0 : isHeader ? -260 : -340,
                transform: `rotate(${rotate}deg) scale(${scale})`,
                transformOrigin: "center center",
                opacity: fromFront === 0 ? 1 : 0.9,
                zIndex: i,
              }}
            >
              <DeviceMockup src={src} device="iphone" accent={theme} height={phoneHeight} extraGlow={fromFront === 0} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
