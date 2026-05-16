// Strip the global navbar/footer/release-banner from screenshot-composer
// routes. Every composer page renders at exact device dimensions and
// shouldn't have any chrome bleeding in — the screenshots Apple sees
// must be 100% MileClear marketing canvas.

export default function ComposerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; background: #000 !important; overflow-x: auto; }
        html[data-release-banner] { --banner-h: 0 !important; }
        .release-banner,
        nav, header, footer,
        [class*="navbar"], [class*="Navbar"],
        [class*="Footer"], [class*="footer"] { display: none !important; }
      `}</style>
      {children}
    </>
  );
}
