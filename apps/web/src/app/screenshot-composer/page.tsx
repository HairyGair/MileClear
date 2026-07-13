import Link from "next/link";
import { SLOTS } from "@/components/screenshot/slots";

// Index of every screenshot slot at every device size, with capture
// instructions. The composer route itself renders one slot at one size;
// this page lets you navigate quickly between them.

export default function ComposerIndex() {
  return (
    <main
      style={{
        background: "#060a16",
        minHeight: "100vh",
        color: "#f9fafb",
        fontFamily: "'Sora', system-ui, sans-serif",
        padding: "60px 80px",
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 12 }}>
        Screenshot composer
      </h1>
      <p style={{ fontSize: 18, color: "#94a3b8", maxWidth: 800, marginBottom: 40, lineHeight: 1.5 }}>
        20 marketing compositions for the App Store listing. Open any URL,
        Chrome at 100% zoom, then DevTools (Cmd+Shift+P) →{" "}
        <em>Capture full size screenshot</em> exports a pixel-perfect PNG
        at the required device dimensions. Drop raw device captures into{" "}
        <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
          /public/screenshot-source/iphone/
        </code>{" "}
        and{" "}
        <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>
          /public/screenshot-source/ipad/
        </code>{" "}
        using the filenames defined in <code>slots.ts</code>.
      </p>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 15,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              #
            </th>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              Slug
            </th>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              Headline
            </th>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              Accent
            </th>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              iPhone (1320×2868)
            </th>
            <th style={{ textAlign: "left", padding: "12px 16px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
              iPad (2064×2752)
            </th>
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((slot) => (
            <tr key={slot.slot} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <td style={{ padding: "16px", fontWeight: 700, color: "#fcd34d" }}>{slot.slot}</td>
              <td style={{ padding: "16px", fontFamily: "monospace", color: "#cbd5e1" }}>{slot.slug}</td>
              <td style={{ padding: "16px", whiteSpace: "pre-line", color: "#e2e8f0" }}>
                {slot.headline}
              </td>
              <td style={{ padding: "16px", color: "#94a3b8" }}>{slot.accent}</td>
              <td style={{ padding: "16px" }}>
                <Link
                  href={`/screenshot-composer/iphone/${slot.slug}`}
                  target="_blank"
                  style={{ color: "#fbbf24", textDecoration: "underline" }}
                >
                  Open
                </Link>
              </td>
              <td style={{ padding: "16px" }}>
                <Link
                  href={`/screenshot-composer/ipad/${slot.slug}`}
                  target="_blank"
                  style={{ color: "#fbbf24", textDecoration: "underline" }}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 60, padding: 24, background: "rgba(255,255,255,0.03)", borderRadius: 12, maxWidth: 800 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Capturing the raw device screenshots
        </h2>
        <ol style={{ paddingLeft: 24, lineHeight: 1.7, color: "#cbd5e1" }}>
          <li><strong>iPhone:</strong> Side button + Volume Up on a 16 Pro Max running build 67. Resolution will be 1320×2868 natively.</li>
          <li><strong>iPad:</strong> Top button + Volume Up on an iPad Pro 13" (M4). 2064×2752 natively.</li>
          <li>Open the screen specified by each slot (dashboard, HMRC submit, Live Activity, etc).</li>
          <li>Save the PNGs into the matching subfolder under <code>/apps/web/public/screenshot-source/</code> using the filenames from <code>slots.ts</code>.</li>
          <li>Reload this page - the composer pulls them automatically.</li>
        </ol>
      </div>

      <div style={{ marginTop: 24, padding: 24, background: "rgba(255,255,255,0.03)", borderRadius: 12, maxWidth: 800 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Exporting at exact dimensions
        </h2>
        <ol style={{ paddingLeft: 24, lineHeight: 1.7, color: "#cbd5e1" }}>
          <li>Open a slot URL in Chrome.</li>
          <li>DevTools (Cmd+Option+I) → Cmd+Shift+P → type "Capture full size screenshot".</li>
          <li>Browser downloads a PNG at the exact CSS pixel dimensions.</li>
          <li>Repeat for all 20 slots. Drop into App Store Connect's Media Manager.</li>
        </ol>
      </div>
    </main>
  );
}

export const metadata = {
  title: "Screenshot composer",
  robots: { index: false, follow: false },
};
