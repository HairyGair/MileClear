// Strip the global navbar/footer from screenshot-composer routes. Every
// composer page renders at exact device dimensions and shouldn't have
// any chrome bleeding in.

export default function ComposerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: #000; overflow-x: auto; }
        body > div[data-release-banner], header.nav, footer { display: none !important; }
      `}</style>
      {children}
    </>
  );
}
