import type { ScreenshotSlot } from "./slots";
import { ACCENT_THEMES, headlineSize } from "./ScreenshotFrame";

// Google Play phone screenshots (1080 x 1920, 9:16) and the Play feature
// graphic (1024 x 500). Same slots and copy as the App Store set, but in a
// neutral phone: no notch, no island, and the iPhone status bar trimmed off
// the capture so no iPhone-only chrome shows. Oct 2026 (1.3.13).

export const PLAY_DIMENSIONS = { width: 1080, height: 1920 } as const;
export const FEATURE_DIMENSIONS = { width: 1024, height: 500 } as const;

// Captures are 1206 x 2622 from the iPhone simulator. The top 165 px are
// the status bar and the island; everything below is the app.
const CAP_W = 1206;
const CAP_H = 2622;
const STATUS_CROP = 165;

/** A plain phone: even dark bezel, rounded corners, nothing brand-specific. */
function NeutralPhone({
  src,
  width,
  focus,
  glow,
}: {
  src?: string;
  width: number;
  /** Fraction of the (trimmed) screen height to show, fading out. */
  focus?: number;
  glow: string;
}) {
  const bezel = Math.round(width * 0.028);
  const screenW = width - bezel * 2;
  const scale = screenW / CAP_W;
  const fullScreenH = (CAP_H - STATUS_CROP) * scale;
  const screenH = focus ? Math.round(fullScreenH * focus) : Math.round(fullScreenH);
  const radius = Math.round(width * 0.075);
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: -70,
          background: `radial-gradient(ellipse at center, ${glow}, transparent 65%)`,
          filter: "blur(55px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width,
          padding: bezel,
          paddingBottom: focus ? 0 : bezel,
          borderRadius: focus ? `${radius + bezel}px ${radius + bezel}px 0 0` : radius + bezel,
          background: "#111827",
          boxShadow: `0 50px 90px ${glow}, 0 40px 90px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.10) inset`,
          WebkitMaskImage: focus ? "linear-gradient(180deg, #000 0%, #000 84%, transparent 100%)" : undefined,
          maskImage: focus ? "linear-gradient(180deg, #000 0%, #000 84%, transparent 100%)" : undefined,
        }}
      >
        <div
          style={{
            width: screenW,
            height: screenH,
            borderRadius: focus ? `${radius}px ${radius}px 0 0` : radius,
            overflow: "hidden",
            background: "#030712",
            position: "relative",
          }}
        >
          {src ? (
            <img
              src={src}
              alt=""
              style={{
                position: "absolute",
                left: 0,
                top: -STATUS_CROP * scale,
                width: screenW,
                height: CAP_H * scale,
                display: "block",
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Wordmark({ size, accent }: { size: number; accent: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.35, fontFamily: "'Sora', system-ui, sans-serif" }}>
      <img src="/branding/logo-120x120.png" alt="" style={{ width: size * 1.25, height: size * 1.25, borderRadius: size * 0.3 }} />
      <div style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
        <span style={{ color: "#f9fafb" }}>Mile</span>
        <span style={{ color: accent }}>Clear</span>
      </div>
    </div>
  );
}

export function PlayScreenshotFrame({ slot }: { slot: ScreenshotSlot }) {
  const { width, height } = PLAY_DIMENSIONS;
  const theme = ACCENT_THEMES[slot.accent];
  const src = slot.playSrc ?? slot.iphoneSrc;
  const focus = slot.playFocus ?? slot.focus;
  const subline = slot.playSubline ?? slot.subline;
  const layout = slot.layout ?? "centered";
  const rotate = focus ? 0 : layout === "stack" ? -2 : layout === "tilted" ? -1.2 : layout === "tilted-right" ? 1.2 : 0;
  const phoneW = focus ? 900 : 640;

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
          radial-gradient(ellipse 1100px 700px at 50% 0%, ${theme.glow} 0%, transparent 52%),
          radial-gradient(ellipse 600px 600px at 100% 100%, ${theme.tint} 0%, transparent 60%),
          linear-gradient(180deg, #060a16 0%, #030712 55%, #0a1020 100%)
        `,
      }}
    >
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center" }}>
        {slot.eyebrow ? (
          <div
            style={{
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.chipText,
            }}
          >
            {slot.eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            margin: "26px 0 0",
            padding: "0 60px",
            fontSize: headlineSize(slot.headline, 78, 960),
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            whiteSpace: "pre-line",
            background: `linear-gradient(180deg, #ffffff 0%, ${theme.primary} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {slot.headline}
        </h1>
        {subline ? (
          <p
            style={{
              margin: "22px auto 0",
              maxWidth: 900,
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 30,
              lineHeight: 1.35,
              color: "#cbd5e1",
            }}
          >
            {subline}
          </p>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          top: focus ? 520 : 470,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `rotate(${rotate}deg)`,
          transformOrigin: "center top",
        }}
      >
        <NeutralPhone src={src} width={phoneW} focus={focus ? Math.min(focus, 0.62) : undefined} glow={theme.glow} />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 130,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(0deg, rgba(3,7,18,0.92) 0%, rgba(3,7,18,0) 100%)",
          zIndex: 5,
        }}
      >
        <Wordmark size={40} accent={theme.primary} />
      </div>
    </div>
  );
}

/**
 * Play feature graphic, 1024 x 500. Navy, an amber road line left to right,
 * wordmark and headline on the left, one tilted phone on the right showing
 * a trip mid-swipe. Text and phone stay inside the middle 80% (x 102-922,
 * y 50-450): Play crops edges and may put a play button in the centre.
 */
export function PlayFeatureGraphic({ src }: { src: string }) {
  const { width, height } = FEATURE_DIMENSIONS;
  const amber = ACCENT_THEMES.amber;
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
          radial-gradient(ellipse 420px 320px at 72% 55%, rgba(234,179,8,0.28) 0%, transparent 70%),
          radial-gradient(ellipse 380px 260px at 12% 0%, rgba(251,191,36,0.10) 0%, transparent 70%),
          #030712
        `,
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path
          d="M -40 430 C 220 360, 360 470, 560 360 S 860 150, 1080 190"
          fill="none"
          stroke={amber.primary}
          strokeOpacity={0.45}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="2 18"
        />
      </svg>

      <div style={{ position: "absolute", left: 112, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", zIndex: 2 }}>
        <Wordmark size={34} accent={amber.primary} />
        <div
          style={{
            marginTop: 26,
            fontSize: 54,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.025em",
            color: "#ffffff",
          }}
        >
          Every mile.
          <br />
          Sorted in a swipe.
        </div>
      </div>

      <div style={{ position: "absolute", left: 622, top: 52, transform: "rotate(-5deg)", transformOrigin: "center top", zIndex: 1 }}>
        <NeutralPhone src={src} width={280} focus={0.5} glow="rgba(234,179,8,0.35)" />
      </div>
    </div>
  );
}
