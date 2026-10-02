import type { ReactNode } from "react";
import type { PressBlock } from "@/data/press";

/** Bare mileclear.com addresses in release text become links. Longest first,
 *  so "mileclear.com/community" is not split into "mileclear.com" + text. */
const LINKS: [string, string][] = [
  ["mileclear.com/community", "/community"],
  ["mileclear.com/press", "/press"],
];

export function linkify(text: string): ReactNode[] {
  const pattern = new RegExp(`(${LINKS.map(([t]) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})`, "g");
  return text.split(pattern).map((part, i) => {
    const hit = LINKS.find(([t]) => t === part);
    return hit ? (
      <a key={i} href={hit[1]} className="pr-link">
        {part}
      </a>
    ) : (
      part
    );
  });
}

/** `dateline` ("Sunderland, 5 October 2026.") opens the first paragraph. */
export function PressBlocks({ blocks, dateline }: { blocks: PressBlock[]; dateline?: string }) {
  const firstP = blocks.findIndex((b) => b.type === "p");
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return (
              <h2 key={i} className="pr-release__h2">
                {b.text}
              </h2>
            );
          case "ul":
            return (
              <ul key={i} className="pr-release__list">
                {b.items.map((item) => (
                  <li key={item}>{linkify(item)}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <figure key={i} className="pr-release__quote">
                <blockquote>
                  <p>&ldquo;{b.text}&rdquo;</p>
                </blockquote>
                <figcaption>{b.cite}</figcaption>
              </figure>
            );
          default:
            return (
              <p key={i} className="pr-release__p">
                {dateline && i === firstP ? (
                  <>
                    <strong className="pr-release__dateline">{dateline}</strong>{" "}
                  </>
                ) : null}
                {linkify(b.text)}
              </p>
            );
        }
      })}
    </>
  );
}
