import type { ScreenshotSlot, AccentTheme, Callout } from "./slots";

interface FrameProps {
  slot: ScreenshotSlot;
  device: "iphone" | "ipad";
}

// Exact App Store-required dimensions. Apple auto-downscales for older
// device tiers, so these two cover the modern iPhone + iPad listings.
const DEVICE_DIMENSIONS = {
  iphone: { width: 1320, height: 2868 },
  ipad: { width: 2064, height: 2752 },
} as const;

// Per-accent gradient + glow tokens. Sourced from globals.css palette so
// the screenshots feel native to mileclear.com rather than a separate
// marketing language.
const ACCENT_THEMES: Record<
  AccentTheme,
  { primary: string; glow: string; tint: string; chipBg: string; chipText: string }
> = {
  amber: {
    primary: "#fbbf24",
    glow: "rgba(234,179,8,0.45)",
    tint: "rgba(251,191,36,0.18)",
    chipBg: "rgba(251,191,36,0.12)",
    chipText: "#fcd34d",
  },
  emerald: {
    primary: "#10b981",
    glow: "rgba(16,185,129,0.45)",
    tint: "rgba(16,185,129,0.18)",
    chipBg: "rgba(16,185,129,0.12)",
    chipText: "#34d399",
  },
  sky: {
    primary: "#38bdf8",
    glow: "rgba(56,189,248,0.45)",
    tint: "rgba(56,189,248,0.18)",
    chipBg: "rgba(56,189,248,0.12)",
    chipText: "#7dd3fc",
  },
  violet: {
    primary: "#a78bfa",
    glow: "rgba(167,139,250,0.45)",
    tint: "rgba(167,139,250,0.18)",
    chipBg: "rgba(167,139,250,0.12)",
    chipText: "#c4b5fd",
  },
  rose: {
    primary: "#fb7185",
    glow: "rgba(251,113,133,0.45)",
    tint: "rgba(251,113,133,0.18)",
    chipBg: "rgba(251,113,133,0.12)",
    chipText: "#fda4af",
  },
};

export default function ScreenshotFrame({ slot, device }: FrameProps) {
  const dims = DEVICE_DIMENSIONS[device];
  const theme = ACCENT_THEMES[slot.accent];
  const layout = slot.layout ?? "centered";
  const src = device === "iphone" ? slot.iphoneSrc : slot.ipadSrc;

  // Type ratio + spacing scales by device. iPad is wider but not as tall,
  // so we use a different typography rhythm.
  const isIpad = device === "ipad";

  return (
    <div
      style={{
        width: dims.width,
        height: dims.height,
        background: `radial-gradient(ellipse at 50% 0%, ${theme.tint}, transparent 60%), linear-gradient(180deg, #060a16 0%, #030712 60%, #0a1020 100%)`,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Sora', system-ui, sans-serif",
        color: "#f9fafb",
      }}
    >
      {/* Grain overlay — keeps the marketing image feeling tactile rather
          than flat. SVG noise filter, 4% opacity. */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.05,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      {/* Top eyebrow + badge row */}
      <div
        style={{
          position: "absolute",
          top: isIpad ? 88 : 120,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          padding: "0 80px",
        }}
      >
        {slot.eyebrow ? (
          <span
            style={{
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: isIpad ? 28 : 32,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.chipText,
            }}
          >
            {slot.eyebrow}
          </span>
        ) : null}
        {slot.badge ? (
          <span
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              background: theme.chipBg,
              border: `1.5px solid ${theme.primary}`,
              color: theme.primary,
              fontSize: isIpad ? 22 : 26,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "'Sora', system-ui, sans-serif",
            }}
          >
            {slot.badge}
          </span>
        ) : null}
      </div>

      {/* Headline + subline */}
      <div
        style={{
          position: "absolute",
          top: isIpad ? 180 : 230,
          left: 0,
          right: 0,
          padding: "0 100px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: isIpad ? 132 : 124,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            margin: 0,
            whiteSpace: "pre-line",
            background: `linear-gradient(180deg, #ffffff 0%, ${theme.primary} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: `0 0 80px ${theme.glow}`,
          }}
        >
          {slot.headline}
        </h1>
        {slot.subline ? (
          <p
            style={{
              marginTop: 40,
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: isIpad ? 36 : 38,
              lineHeight: 1.35,
              color: "#cbd5e1",
              maxWidth: isIpad ? 1400 : 1100,
              marginLeft: "auto",
              marginRight: "auto",
              fontWeight: 400,
            }}
          >
            {slot.subline}
          </p>
        ) : null}
      </div>

      {/* Device frame area. Positioned bottom-half, optional tilt. */}
      <div
        style={{
          position: "absolute",
          bottom: isIpad ? 80 : 100,
          left: "50%",
          transform: `translateX(-50%) ${layout === "tilted" ? "rotate(-2.5deg)" : ""}`,
          width: isIpad ? 1200 : 800,
          height: isIpad ? 1480 : 1500,
          perspective: 2000,
        }}
      >
        <DeviceMockup src={src} device={device} accent={theme} />
        {slot.callouts?.map((c, i) => (
          <CalloutMarker key={i} callout={c} accent={theme} isIpad={isIpad} />
        ))}
      </div>

      {/* Bottom-right wordmark — light brand presence, not aggressive */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 60,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: 0.65,
        }}
      >
        <span
          style={{
            fontSize: isIpad ? 28 : 32,
            fontWeight: 800,
            color: "#f9fafb",
            letterSpacing: "-0.02em",
          }}
        >
          Mile
        </span>
        <span
          style={{
            fontSize: isIpad ? 28 : 32,
            fontWeight: 800,
            color: theme.primary,
            letterSpacing: "-0.02em",
          }}
        >
          Clear
        </span>
      </div>
    </div>
  );
}

function DeviceMockup({
  src,
  device,
  accent,
}: {
  src?: string;
  device: "iphone" | "ipad";
  accent: { primary: string; glow: string };
}) {
  const isIpad = device === "ipad";
  // Inner screen aspect ratio matches the real device. iPhone 6.9" is
  // 1320:2868 ≈ 0.46. iPad Pro 13" is 2064:2752 ≈ 0.75.
  const screenAspect = isIpad ? 2064 / 2752 : 1320 / 2868;
  const containerWidth = isIpad ? 1200 : 800;
  const screenWidth = containerWidth * 0.94;
  const screenHeight = screenWidth / screenAspect;
  const radius = isIpad ? 58 : 78;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: containerWidth,
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          inset: -60,
          background: `radial-gradient(ellipse at center, ${accent.glow}, transparent 70%)`,
          filter: "blur(40px)",
          zIndex: 0,
        }}
      />
      {/* Bezel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "linear-gradient(135deg, #1a2332 0%, #0a1120 50%, #1a2332 100%)",
          padding: 16,
          borderRadius: radius + 16,
          boxShadow:
            "0 60px 120px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.08) inset, 0 0 40px rgba(255,255,255,0.03) inset",
        }}
      >
        {/* Screen */}
        <div
          style={{
            width: screenWidth,
            height: screenHeight,
            background: "#0a1120",
            borderRadius: radius,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <PlaceholderScreen device={device} />
          )}
        </div>
      </div>
    </div>
  );
}

function PlaceholderScreen({ device }: { device: "iphone" | "ipad" }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 20px, rgba(255,255,255,0.06) 20px 40px)",
        color: "rgba(255,255,255,0.4)",
        fontFamily: "monospace",
        fontSize: 28,
        padding: 40,
        textAlign: "center",
      }}
    >
      <p style={{ marginBottom: 12, fontSize: 36, fontWeight: 700 }}>
        Capture needed
      </p>
      <p style={{ fontSize: 24, lineHeight: 1.5 }}>
        Drop a {device === "iphone" ? "1320×2868" : "2064×2752"} PNG at the
        path defined in
        <br />
        <code>slots.ts</code>
      </p>
    </div>
  );
}

function CalloutMarker({
  callout,
  accent,
  isIpad,
}: {
  callout: Callout;
  accent: { primary: string; glow: string };
  isIpad: boolean;
}) {
  const align = callout.align ?? "right";
  const labelSize = isIpad ? 26 : 28;

  // Position the label relative to the dot
  const labelStyle: React.CSSProperties = (() => {
    switch (align) {
      case "left":
        return { right: "calc(100% + 24px)", top: "50%", transform: "translateY(-50%)" };
      case "above":
        return { bottom: "calc(100% + 16px)", left: "50%", transform: "translateX(-50%)" };
      case "below":
        return { top: "calc(100% + 16px)", left: "50%", transform: "translateX(-50%)" };
      case "right":
      default:
        return { left: "calc(100% + 24px)", top: "50%", transform: "translateY(-50%)" };
    }
  })();

  return (
    <div
      style={{
        position: "absolute",
        left: `${callout.xPct}%`,
        top: `${callout.yPct}%`,
        zIndex: 5,
      }}
    >
      {/* Pulse ring */}
      <div
        style={{
          position: "absolute",
          inset: -20,
          borderRadius: "50%",
          border: `2px solid ${accent.primary}`,
          opacity: 0.4,
          width: 60,
          height: 60,
        }}
      />
      {/* Inner dot */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: accent.primary,
          boxShadow: `0 0 24px ${accent.glow}`,
        }}
      />
      {/* Label */}
      <div
        style={{
          position: "absolute",
          ...labelStyle,
          whiteSpace: "nowrap",
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: labelSize,
          fontWeight: 600,
          color: "#f9fafb",
          background: "rgba(10,17,32,0.92)",
          padding: "12px 24px",
          borderRadius: 12,
          border: `1.5px solid ${accent.primary}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 12px ${accent.glow}`,
        }}
      >
        {callout.label}
      </div>
    </div>
  );
}
