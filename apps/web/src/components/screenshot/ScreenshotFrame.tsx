import type { ScreenshotSlot, AccentTheme, Callout } from "./slots";

interface FrameProps {
  slot: ScreenshotSlot;
  device: "iphone" | "ipad";
}

// Exact App Store-required dimensions.
const DEVICE_DIMENSIONS = {
  iphone: { width: 1320, height: 2868 },
  ipad: { width: 2064, height: 2752 },
} as const;

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

  const isIpad = device === "ipad";

  // iPad uses a horizontal split layout. The device shown in the split
  // is an iPhone (since iPad app on iOS runs the iPhone-sized UI for
  // most users — and our marketing story is mobile-first). Fall back
  // to iphoneSrc when ipadSrc isn't supplied.
  if (isIpad) {
    return (
      <IpadSplitFrame
        slot={slot}
        src={slot.ipadSrc ?? slot.iphoneSrc}
        theme={theme}
      />
    );
  }

  // Proportion model (iPhone 1320×2868):
  //   0-130     top band (eyebrow + badge)
  //   130-680   headline + subline (~19% of canvas)
  //   680-2700  device area (~70%)
  //   2700-2868 bottom band (brand mark + wordmark)
  const HEADLINE_TOP = 200;
  const DEVICE_TOP = 740;
  const DEVICE_HEIGHT = 1900;
  const isStack = layout === "stack";
  const isTilted = layout === "tilted";

  // Atmosphere: bigger, brighter accent wash up top so each screenshot
  // carries its own colour story rather than flattening to near-black
  // with a vignette. The stack hero pulls in an extra orb at the
  // bottom-right for a more cinematic composition. 21 May 2026.
  const background = isStack
    ? `
        radial-gradient(ellipse 1600px 1100px at 50% 0%, ${theme.glow} 0%, transparent 55%),
        radial-gradient(ellipse 900px 900px at 90% 100%, ${theme.tint} 0%, transparent 60%),
        radial-gradient(ellipse 700px 700px at 10% 90%, rgba(255,255,255,0.04) 0%, transparent 60%),
        linear-gradient(180deg, #060a16 0%, #030712 55%, #0a1020 100%)
      `
    : `
        radial-gradient(ellipse 1400px 900px at 50% 0%, ${theme.glow} 0%, transparent 50%),
        radial-gradient(ellipse 700px 700px at 100% 100%, ${theme.tint} 0%, transparent 60%),
        linear-gradient(180deg, #060a16 0%, #030712 55%, #0a1020 100%)
      `;

  return (
    <div
      style={{
        width: dims.width,
        height: dims.height,
        background,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Sora', system-ui, sans-serif",
        color: "#f9fafb",
      }}
    >
      {/* Grain overlay */}
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

      {/* Top eyebrow + badge — centred */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        {slot.eyebrow ? (
          <span
            style={{
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 28,
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
              padding: "8px 18px",
              borderRadius: 999,
              background: theme.chipBg,
              border: `1.5px solid ${theme.primary}`,
              color: theme.primary,
              fontSize: 22,
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
          top: HEADLINE_TOP,
          left: 0,
          right: 0,
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.0,
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
              marginTop: 32,
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 32,
              lineHeight: 1.35,
              color: "#cbd5e1",
              maxWidth: 1080,
              marginLeft: "auto",
              marginRight: "auto",
              fontWeight: 400,
            }}
          >
            {slot.subline}
          </p>
        ) : null}
      </div>

      {/* Stack-only decorative orbs. Placed behind the device so the
          composition reads as device-on-glow rather than orb-on-orb. */}
      {isStack ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 460,
              right: -180,
              width: 560,
              height: 560,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
              filter: "blur(40px)",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 1900,
              left: -220,
              width: 720,
              height: 720,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${theme.tint} 0%, transparent 65%)`,
              filter: "blur(50px)",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />
        </>
      ) : null}

      {/* Device */}
      <div
        style={{
          position: "absolute",
          top: DEVICE_TOP,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: isStack
            ? "rotate(-2.5deg)"
            : isTilted
              ? "rotate(-1.5deg)"
              : layout === "tilted-right"
                ? "rotate(1.5deg)"
                : "none",
          transformOrigin: "center top",
        }}
      >
        <DeviceMockup
          src={src}
          device={device}
          accent={theme}
          height={DEVICE_HEIGHT}
          extraGlow={isStack}
          callouts={slot.callouts}
        />
      </div>

      {/* Bottom brand mark */}
      <BrandMark theme={theme} isIpad={false} />
    </div>
  );
}

/**
 * iPad split layout: copy on the left half, device on the right half.
 * Takes advantage of the wider canvas (2064×2752 ≈ 0.75 aspect) which
 * would otherwise force the device to render small with a lot of
 * dead vertical space. Split gives the marketing copy proper breathing
 * room and the device proper scale.
 */
function IpadSplitFrame({
  slot,
  src,
  theme,
}: {
  slot: ScreenshotSlot;
  src?: string;
  theme: (typeof ACCENT_THEMES)[AccentTheme];
}) {
  return (
    <div
      style={{
        width: 2064,
        height: 2752,
        background: `radial-gradient(ellipse at 30% 30%, ${theme.tint}, transparent 55%), linear-gradient(180deg, #060a16 0%, #030712 60%, #0a1020 100%)`,
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Sora', system-ui, sans-serif",
        color: "#f9fafb",
        display: "flex",
      }}
    >
      {/* Grain */}
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
        <filter id="noise-ipad">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise-ipad)" />
      </svg>

      {/* Left: copy column */}
      <div
        style={{
          width: 1060,
          padding: "200px 80px 200px 140px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 40,
          }}
        >
          {slot.eyebrow ? (
            <span
              style={{
                fontFamily: "'Outfit', system-ui, sans-serif",
                fontSize: 30,
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
                padding: "8px 18px",
                borderRadius: 999,
                background: theme.chipBg,
                border: `1.5px solid ${theme.primary}`,
                color: theme.primary,
                fontSize: 22,
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

        <h1
          style={{
            fontSize: 108,
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
              marginTop: 44,
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 34,
              lineHeight: 1.35,
              color: "#cbd5e1",
              maxWidth: 800,
              fontWeight: 400,
            }}
          >
            {slot.subline}
          </p>
        ) : null}
      </div>

      {/* Right: device column */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ transform: "rotate(-2deg)" }}>
          <DeviceMockup
            src={src}
            device="iphone"
            accent={theme}
            height={2300}
          />
        </div>
      </div>

      {/* Bottom brand mark — same band as iPhone but spans the full canvas */}
      <BrandMark theme={theme} isIpad={true} />
    </div>
  );
}

function BrandMark({
  theme,
  isIpad,
}: {
  theme: (typeof ACCENT_THEMES)[AccentTheme];
  isIpad: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: isIpad ? 120 : 160,
        display: "flex",
        alignItems: "center",
        justifyContent: isIpad ? "flex-start" : "center",
        paddingLeft: isIpad ? 140 : 0,
        background: "linear-gradient(0deg, rgba(3,7,18,0.85) 0%, rgba(3,7,18,0) 100%)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 18,
          fontFamily: "'Sora', system-ui, sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/logo-120x120.png"
          alt=""
          style={{
            width: 64,
            height: 64,
            borderRadius: 15,
            opacity: 0.95,
          }}
        />
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: "#f9fafb" }}>Mile</span>
          <span style={{ color: theme.primary }}>Clear</span>
        </div>
      </div>
    </div>
  );
}

function DeviceMockup({
  src,
  device,
  accent,
  height,
  extraGlow = false,
  callouts,
}: {
  src?: string;
  device: "iphone" | "ipad";
  accent: { primary: string; glow: string };
  height: number;
  /** Hero stack layout — doubles the halo radius and adds an inner
   *  contour ring so the device reads as the centrepiece. */
  extraGlow?: boolean;
  callouts?: Callout[];
}) {
  const isIpad = device === "ipad";
  // Inner screen aspect ratio matches the real device. iPhone 6.9" is
  // 1320:2868 ≈ 0.460. iPad Pro 13" is 2064:2752 ≈ 0.750.
  const screenAspect = isIpad ? 2064 / 2752 : 1320 / 2868;
  // Height-driven sizing so the device fits the slot the parent gave us.
  const bezelPad = isIpad ? 18 : 22;
  const screenHeight = height - bezelPad * 2;
  const screenWidth = screenHeight * screenAspect;
  const containerWidth = screenWidth + bezelPad * 2;
  const radius = isIpad ? 60 : 82;

  return (
    <div
      style={{
        position: "relative",
        width: containerWidth,
        height,
      }}
    >
      {/* Outer halo (hero only) — bigger, brighter, more pronounced */}
      {extraGlow ? (
        <div
          style={{
            position: "absolute",
            inset: -240,
            background: `radial-gradient(ellipse at center, ${accent.glow}, transparent 70%)`,
            filter: "blur(120px)",
            opacity: 0.9,
            zIndex: 0,
          }}
        />
      ) : null}
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          inset: -80,
          background: `radial-gradient(ellipse at center, ${accent.glow}, transparent 65%)`,
          filter: "blur(60px)",
          zIndex: 0,
        }}
      />
      {/* Bezel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          // Accent-tinted shadow gives each slot its own atmosphere even
          // on centred layouts (21 May 2026). The first 60px-blur tint
          // pulls a hint of the slot's accent colour through the shadow;
          // the second neutral-black layer keeps it grounded.
          background: "linear-gradient(135deg, #1a2332 0%, #0a1120 50%, #1a2332 100%)",
          padding: bezelPad,
          borderRadius: radius + bezelPad,
          boxShadow: [
            `0 80px 120px ${accent.glow}`,
            "0 60px 120px rgba(0,0,0,0.65)",
            "0 0 0 1.5px rgba(255,255,255,0.08) inset",
            "0 0 40px rgba(255,255,255,0.03) inset",
          ].join(", "),
        }}
      >
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

          {/* Callouts: pin label + dot pairs to specific spots on the
              captured screen. xPct/yPct are percentages of the inner
              screen so the same callout pins correctly at any size. */}
          {callouts?.map((c, i) => (
            <CalloutOverlay key={i} callout={c} accent={accent} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalloutOverlay({
  callout,
  accent,
}: {
  callout: Callout;
  accent: { primary: string; glow: string };
}) {
  const align = callout.align ?? "right";
  // The callout sits as a dot at (xPct, yPct) with a label adjacent
  // to it. The label is anchored to the dot via absolute positioning
  // on the same parent. Inline styles only (no Tailwind) per the
  // composer convention.
  const dotSize = 28;
  const labelGap = 22;

  // Position the label relative to the dot's centre. We deliberately
  // overshoot the device bezel — readable copy outweighs being inside
  // the rectangle. The pill background carries enough contrast that it
  // reads against any underlying capture.
  let labelStyle: React.CSSProperties;
  switch (align) {
    case "left":
      labelStyle = {
        right: `calc(${100 - callout.xPct}% + ${labelGap}px)`,
        top: `${callout.yPct}%`,
        transform: "translateY(-50%)",
      };
      break;
    case "above":
      labelStyle = {
        left: `${callout.xPct}%`,
        bottom: `calc(${100 - callout.yPct}% + ${labelGap}px)`,
        transform: "translateX(-50%)",
      };
      break;
    case "below":
      labelStyle = {
        left: `${callout.xPct}%`,
        top: `calc(${callout.yPct}% + ${labelGap}px)`,
        transform: "translateX(-50%)",
      };
      break;
    case "right":
    default:
      labelStyle = {
        left: `calc(${callout.xPct}% + ${labelGap}px)`,
        top: `${callout.yPct}%`,
        transform: "translateY(-50%)",
      };
      break;
  }

  return (
    <>
      {/* Dot — accent-coloured with a halo so it reads on any capture */}
      <div
        style={{
          position: "absolute",
          left: `${callout.xPct}%`,
          top: `${callout.yPct}%`,
          width: dotSize,
          height: dotSize,
          marginLeft: -dotSize / 2,
          marginTop: -dotSize / 2,
          borderRadius: "50%",
          background: accent.primary,
          border: "3px solid rgba(255,255,255,0.95)",
          boxShadow: `0 0 30px ${accent.glow}, 0 0 60px ${accent.glow}`,
          zIndex: 5,
        }}
      />
      {/* Label pill */}
      <div
        style={{
          position: "absolute",
          ...labelStyle,
          padding: "12px 22px",
          borderRadius: 999,
          background: "rgba(7, 12, 24, 0.92)",
          border: `1.5px solid ${accent.primary}`,
          color: "#f9fafb",
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          boxShadow: `0 12px 36px rgba(0,0,0,0.5), 0 0 24px ${accent.glow}`,
          zIndex: 6,
        }}
      >
        {callout.label}
      </div>
    </>
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

