"use client";

import { Card } from "../kit/Card";
import { Button } from "../kit/Button";
import { Icon, type IconName } from "../kit/Icon";
import { PageHeader } from "../kit/PageHeader";

/**
 * "Set this on your phone": for data that only lives in the app (work
 * schedule, tracking switches, classification rules). Never a fake editor.
 */
export function PhoneOnlyPage({
  pageTitle,
  back,
  icon,
  title,
  body,
}: {
  pageTitle: string;
  back: { href: string; label: string };
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <>
      <PageHeader title={pageTitle} back={back} />
      <div className="mc-narrow">
        <Card>
          <div className="mc-phoneonly">
            <span className="mc-phoneonly__icon" aria-hidden="true">
              <Icon name={icon} size={24} />
            </span>
            <h2 className="mc-phoneonly__title">{title}</h2>
            <p className="mc-phoneonly__body">{body}</p>
            <Button variant="secondary" href="/app" external icon="phone-portrait-outline">
              Get the app
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
