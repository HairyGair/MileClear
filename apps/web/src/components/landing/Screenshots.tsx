import Image from "next/image";
import Reveal from "./Reveal";

// Horizontal screenshot gallery. Sits between Features and WhoItsFor.
// On mobile, scrolls horizontally with snap-to-card. On desktop, lays
// out as a flex row that fits 3-4 phones visible at once. Each card
// gets a short caption underneath so visitors can scan the gallery
// without reading paragraphs.

interface Shot {
  file: string;
  caption: string;
  sub: string;
}

const shots: Shot[] = [
  {
    file: "iphone-02-first-tax-return.png",
    caption: "First-time Self Assessment",
    sub: "Step-by-step from your numbers to HMRC",
  },
  {
    file: "iphone-03-mtd-itsa.png",
    caption: "HMRC quarterly submissions",
    sub: "Connect once, submit directly from the app",
  },
  {
    file: "iphone-04-live-activity.png",
    caption: "Live on the Lock Screen",
    sub: "Miles + earnings ticking up as you drive",
  },
  {
    file: "iphone-05-auto-classify.png",
    caption: "Learns your routes",
    sub: "Auto-classifies after three matching trips",
  },
  {
    file: "iphone-06-road-accurate.png",
    caption: "Road-accurate distances",
    sub: "Same A to B, same mileage. Every time.",
  },
  {
    file: "iphone-07-invoices.png",
    caption: "Invoice tracking",
    sub: "For sole traders alongside the gig work",
  },
  {
    file: "iphone-08-free-tier.png",
    caption: "Free does the heavy lifting",
    sub: "Tracking, tax tooling, HMRC compliance — all free",
  },
  {
    file: "iphone-09-pro.png",
    caption: "Pro unlocks the analytics",
    sub: "Platform comparison, weekly P&L, golden hours",
  },
  {
    file: "iphone-10-your-data.png",
    caption: "Your data stays yours",
    sub: "On-device first, exportable anytime",
  },
];

export default function Screenshots() {
  return (
    <section id="screenshots" className="section screenshots">
      <div className="container">
        <Reveal>
          <div className="screenshots__head">
            <p className="label">See it in action</p>
            <h2 className="heading">A quick tour of what you&apos;re downloading</h2>
            <p className="subtext">
              Nine screens that cover the loop: track, classify, claim. Swipe through them — every screen is what you&apos;d see on day one.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="screenshots__rail" role="list">
            {shots.map((s) => (
              <figure key={s.file} className="screenshots__card" role="listitem">
                <div className="screenshots__frame">
                  <Image
                    src={`/screenshot-source/iphone/${s.file}`}
                    alt={`MileClear: ${s.caption}`}
                    width={420}
                    height={910}
                    sizes="(max-width: 768px) 70vw, 280px"
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                </div>
                <figcaption className="screenshots__caption">
                  <div className="screenshots__caption-title">{s.caption}</div>
                  <div className="screenshots__caption-sub">{s.sub}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
