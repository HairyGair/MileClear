"use client";

import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Icon, PageHeader, TextField } from "@/components/dashboard/kit";
import { filterHelpSections, isPhoneTopic } from "@/lib/helpTopics";
import styles from "@/components/dashboard/settings/settings.module.css";

// Help and tutorials: the app's help topics. Search filters them; each topic opens
// in place. Topics about things that only happen on the phone carry an "In the app" tag.
export default function HelpPage() {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => filterHelpSections(query), [query]);

  return (
    <>
      <PageHeader title="Help and tutorials" back={{ href: "/dashboard/more", label: "More" }} />
      <div className={styles.page}>
        <Card tone="quiet">
          <div className={styles.fields}>
            <p className={styles.lead}>New to the website, or want a reminder?</p>
            <div className={styles.actions}>
              <Button variant="secondary" href="/dashboard?tour=1">Take the tour again</Button>
            </div>
          </div>
        </Card>

        <TextField label="Search help" type="text" value={query} onChange={setQuery} placeholder="e.g. mileage rate, Self Assessment" />

        {sections.length === 0 ? (
          <EmptyState icon="search-outline" title="Nothing found" body="Try another word, or tell us what you were looking for." action={{ label: "Tell us", href: "/dashboard/feedback" }} />
        ) : (
          sections.map((section) => (
            <Card key={section.title} title={section.title} padded={false}>
              {section.topics.map((t) => (
                <details key={t.id} className={styles.topic} open={query.trim() ? true : undefined}>
                  <summary>
                    <span className={styles.topicQ}>{t.q}</span>
                    {isPhoneTopic(t) && <span className={styles.tag}>In the app</span>}
                    <Icon name="chevron-forward" size={16} className={styles.topicChev} />
                  </summary>
                  <div className={styles.topicA}>{t.a}</div>
                </details>
              ))}
            </Card>
          ))
        )}

        <Card tone="quiet">
          <div className={styles.fields}>
            <p className={styles.lead}>Still stuck?</p>
            <div className={styles.actions}>
              <Button variant="secondary" href="/dashboard/feedback">Tell us</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
