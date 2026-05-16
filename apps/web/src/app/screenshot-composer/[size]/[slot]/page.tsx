import { notFound } from "next/navigation";
import { existsSync } from "node:fs";
import { join } from "node:path";
import ScreenshotFrame from "@/components/screenshot/ScreenshotFrame";
import { getSlot } from "@/components/screenshot/slots";

// Renders a single App Store screenshot composition at the exact pixel
// dimensions Apple requires. Open the URL in Chrome at 100% zoom, then
// use DevTools "Capture full size screenshot" to export a pixel-perfect
// PNG. No download/export endpoint — the browser is the renderer.
//
// /screenshot-composer/iphone/1   → 1320×2868
// /screenshot-composer/ipad/3     → 2064×2752
// /screenshot-composer/iphone/hero → resolves slot by slug

export default async function SlotPage({
  params,
}: {
  params: Promise<{ size: string; slot: string }>;
}) {
  const { size, slot: slotParam } = await params;
  if (size !== "iphone" && size !== "ipad") notFound();

  const slot = getSlot(slotParam);
  if (!slot) notFound();

  // Strip any iphoneSrc / ipadSrc that point at files which don't actually
  // exist yet. Without this the renderer outputs a broken <img> tag and
  // the device frame looks empty instead of showing the helpful "Capture
  // needed" placeholder.
  const publicDir = join(process.cwd(), "public");
  const resolvedSlot = {
    ...slot,
    iphoneSrc: slot.iphoneSrc && existsSync(join(publicDir, slot.iphoneSrc))
      ? slot.iphoneSrc
      : undefined,
    ipadSrc: slot.ipadSrc && existsSync(join(publicDir, slot.ipadSrc))
      ? slot.ipadSrc
      : undefined,
  };

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

// Override the default layout's chrome — screenshots should be the
// only thing visible. Next.js renders the root layout above this, so
// we rely on the parent screenshot-composer/layout.tsx to strip global
// nav.
export const metadata = {
  title: "Screenshot composer",
  robots: { index: false, follow: false },
};
