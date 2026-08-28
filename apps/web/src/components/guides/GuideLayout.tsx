import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

/**
 * Shared shell for reference guides.
 *
 * The guides written before this one each carried their own copy of the hero,
 * the callout boxes and the "keep reading" row as inline styles, which is why
 * they run to 300-odd lines for what is mostly prose. Five more of those would
 * have been five more places to change a colour. The older pages are left
 * alone; this is for new ones.
 *
 * Anything genuinely bespoke (the verdict chips on the business-mileage page,
 * the calculator) stays hand-built. This covers the common shape: a hero, a
 * short answer up front, some sections, some questions, and links out.
 */

export interface GuideSection {
  heading: string;
  /** Paragraphs of plain text. Rendered in order, before any list. */
  body?: string[];
  /** Optional bulleted list rendered after the paragraphs. */
  list?: string[];
  /** Optional closing paragraphs, after the list. */
  after?: string[];
}

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideLink {
  href: string;
  label: string;
  primary?: boolean;
}

const CARD: React.CSSProperties = {
  background: "var(--bg-card-solid)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--r-lg)",
  padding: "clamp(1.5rem, 3vw, 2rem)",
};

const EYEBROW: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  marginBottom: "0.85rem",
};

const PROSE: React.CSSProperties = {
  fontSize: "1rem",
  color: "var(--text-primary)",
  lineHeight: 1.75,
};

export default function GuideLayout({
  eyebrow,
  title,
  standfirst,
  path,
  shortAnswer,
  sections,
  faqs,
  caution,
  links,
}: {
  eyebrow: string;
  title: string;
  standfirst: string;
  /** Route, used for the breadcrumb trail. */
  path: string;
  /** The answer someone came for, before they have to read anything. */
  shortAnswer: string[];
  sections: GuideSection[];
  faqs?: GuideFaq[];
  /** Amber box at the foot: the thing that catches people out. */
  caution?: { title: string; body: string };
  links?: GuideLink[];
}) {
  const faqPage = faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: title, path }]} />
      {faqPage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
        />
      )}
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">{eyebrow}</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                {title}
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 640 }}>
                {standfirst}
              </p>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={CARD}>
              <div style={{ ...EYEBROW, color: "var(--amber-400)" }}>
                The short answer
              </div>
              {shortAnswer.map((p, i) => (
                <p
                  key={i}
                  style={{
                    ...PROSE,
                    marginBottom: i === shortAnswer.length - 1 ? 0 : "0.85rem",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>

        {sections.map((s) => (
          <section key={s.heading} className="section" style={{ paddingTop: 0 }}>
            <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
              <h2
                className="heading"
                style={{
                  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                  marginBottom: "1rem",
                }}
              >
                {s.heading}
              </h2>
              <div style={{ display: "grid", gap: "0.85rem" }}>
                {s.body?.map((p, i) => (
                  <p key={`b${i}`} style={PROSE}>
                    {p}
                  </p>
                ))}
                {s.list && (
                  <ul
                    style={{
                      ...PROSE,
                      paddingLeft: "1.25rem",
                      display: "grid",
                      gap: "0.5rem",
                    }}
                  >
                    {s.list.map((li, i) => (
                      <li key={`l${i}`}>{li}</li>
                    ))}
                  </ul>
                )}
                {s.after?.map((p, i) => (
                  <p key={`a${i}`} style={PROSE}>
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </section>
        ))}

        {faqs && faqs.length > 0 && (
          <section className="section" style={{ paddingTop: 0 }}>
            <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
              <h2
                className="heading"
                style={{
                  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                  marginBottom: "1.25rem",
                }}
              >
                Common questions
              </h2>
              <div style={{ display: "grid", gap: "1rem" }}>
                {faqs.map((f) => (
                  <article
                    key={f.question}
                    style={{ ...CARD, borderRadius: "var(--r-md)" }}
                  >
                    <h3
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "1.0625rem",
                        fontWeight: 700,
                        color: "var(--text-white)",
                        lineHeight: 1.35,
                        marginBottom: "0.6rem",
                      }}
                    >
                      {f.question}
                    </h3>
                    <p style={PROSE}>{f.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {caution && (
          <section className="section" style={{ paddingTop: 0 }}>
            <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
              <div
                style={{
                  ...CARD,
                  background: "var(--amber-glow-md)",
                  border: "1px solid rgba(234, 179, 8, 0.3)",
                }}
              >
                <div style={{ ...EYEBROW, color: "var(--amber-300)" }}>
                  {caution.title}
                </div>
                <p style={PROSE}>{caution.body}</p>
              </div>
            </div>
          </section>
        )}

        {links && links.length > 0 && (
          <section className="section" style={{ paddingTop: 0 }}>
            <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
              <div className="divider" style={{ marginBottom: "2.5rem" }} />
              <h2
                className="heading"
                style={{
                  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                  marginBottom: "1rem",
                }}
              >
                Keep reading
              </h2>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    style={
                      l.primary
                        ? {
                            background: "var(--amber-400)",
                            color: "var(--bg-deep)",
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "0.9375rem",
                            padding: "0.75rem 1.5rem",
                            borderRadius: "var(--r-full)",
                            textDecoration: "none",
                          }
                        : {
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            fontSize: "0.9375rem",
                            padding: "0.75rem 1.5rem",
                            borderRadius: "var(--r-full)",
                            border: "1px solid var(--border-default)",
                            textDecoration: "none",
                          }
                    }
                  >
                    {l.label}
                    {l.primary ? " →" : ""}
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                lineHeight: 1.7,
              }}
            >
              General information for UK drivers, not tax advice. The rules
              turn on your own circumstances, and a short conversation with an
              accountant is worth more than a guess on anything that matters.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
