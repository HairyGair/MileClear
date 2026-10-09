"use client";

import { PageHeader, Card } from "@/components/dashboard/kit";
import { GUIDE_DISCLAIMER, GUIDE_INTRO, GUIDE_SECTIONS } from "./content";
import "@/components/dashboard/tax/tax.css";

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
      )}
    </>
  );
}

export default function FirstReturnPage() {
  return (
    <>
      <PageHeader title="First Self Assessment?" back={{ href: "/dashboard/tax", label: "Tax" }}>
        {GUIDE_INTRO}
      </PageHeader>
      <div className="mc-tax-guide">
        {GUIDE_SECTIONS.map((s) => (
          <Card key={s.title}>
            <div className="mc-tax-guide">
              <h2>{s.title}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i}>
                  <Rich text={p} />
                </p>
              ))}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {s.links?.map((l) => (
                <p key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label} (opens in a new tab)
                  </a>
                </p>
              ))}
            </div>
          </Card>
        ))}
        <p className="mc-tax-note">{GUIDE_DISCLAIMER}</p>
      </div>
    </>
  );
}
