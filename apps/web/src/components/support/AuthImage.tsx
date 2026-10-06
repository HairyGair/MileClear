"use client";

// A screenshot attached to a support message. The API serves these only with
// the Bearer token, so a plain <img src> can't load them: fetch with auth, show
// the blob through an object URL, and revoke it when the image goes away.

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import "./support.css";

interface Props {
  /** API path, e.g. /support/attachments/<id>. */
  path: string;
  alt: string;
}

export function AuthImage({ path, alt }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    fetchWithAuth(path)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        made = URL.createObjectURL(blob);
        if (alive) setUrl(made);
        else URL.revokeObjectURL(made);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);

  if (failed) return <span className="support-shot support-shot--empty">Couldn&apos;t load the screenshot</span>;
  if (!url) return <span className="support-shot support-shot--empty" aria-label="Loading screenshot" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="support-shot" title="Open full size">
      <img src={url} alt={alt} />
    </a>
  );
}

/** A row of screenshot thumbnails. */
export function AuthImageRow({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="support-shots">
      {paths.map((p, i) => (
        <AuthImage key={p} path={p} alt={`Screenshot ${i + 1}`} />
      ))}
    </div>
  );
}
