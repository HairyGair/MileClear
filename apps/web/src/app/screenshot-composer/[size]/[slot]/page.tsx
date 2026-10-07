import { notFound } from "next/navigation";
import { existsSync } from "node:fs";
import { join } from "node:path";
import ScreenshotFrame from "@/components/screenshot/ScreenshotFrame";
import { getSlot } from "@/components/screenshot/slots";
import CreativeFrame, { getCreative } from "@/components/screenshot/CreativeFrame";

// Renders a single App Store screenshot composition at the exact pixel
// dimensions Apple requires. Open the URL in Chrome at 100% zoom, then
// use DevTools "Capture full size screenshot" to export a pixel-perfect
// PNG. No download/export endpoint - the browser is the renderer.
//
// /screenshot-composer/iphone/1   → 1320×2868
// /screenshot-composer/ipad/3     → 2064×2752
// /screenshot-composer/iphone/hero → resolves slot by slug
// /screenshot-composer/header/main  → 3840×1646 product page header
// /screenshot-composer/search/main  → 3840×2560 search result image

export default async function SlotPage({
  params,
}: {
  params: Promise<{ size: string; slot: string }>;
}) {
  const { size, slot: slotParam } = await params;
  if (size === "header" || size === "search") {
    const variant = getCreative(size, slotParam);
    if (!variant) notFound();
    return (
      <main style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0 }}>
        <CreativeFrame kind={size} variant={variant} />
      </main>
    );
  }
  if (size !== "iphone" && size !== "ipad") notFound();

  const slot = getSlot(slotParam);
  if (!slot) notFound();

  // Strip any iphoneSrc / ipadSrc that point at files which don't actually
  // exist yet. The renderer falls back to iphoneSrc on iPad if ipadSrc
  // is missing, so we keep iphoneSrc populated as the universal fallback.
  const publicDir = join(process.cwd(), "public");
  const iphoneSrc = slot.iphoneSrc && existsSync(join(publicDir, slot.iphoneSrc))
    ? slot.iphoneSrc
    : undefined;
  const ipadSrc = slot.ipadSrc && existsSync(join(publicDir, slot.ipadSrc))
    ? slot.ipadSrc
    : undefined;
  const resolvedSlot = { ...slot, iphoneSrc, ipadSrc };

  return (
    <main
      style={{
        background: "#000",
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 0,
        margin: 0,
      }}
    >
      <ScreenshotFrame slot={resolvedSlot} device={size} />
    </main>
  );
}

// Override the default layout's chrome - screenshots should be the
// only thing visible. Next.js renders the root layout above this, so
// we rely on the parent screenshot-composer/layout.tsx to strip global
// nav.
export const metadata = {
  title: "Screenshot composer",
  robots: { index: false, follow: false },
};
