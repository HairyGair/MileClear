"use client";

import { useState } from "react";
import Reveal from "./Reveal";

const faqs = [
  {
    q: "Is MileClear really free?",
    a: "Yes. Trip tracking, shift mode, auto detection, fuel prices, achievements, and your HMRC deduction total are all completely free with no limits. Pro features like PDF exports, earnings tracking, and Open Banking are \u00A34.99/month or \u00A344.99/year.",
  },
  {
    q: "How is this different from MileIQ?",
    a: "MileClear is built for UK drivers from the ground up. It uses HMRC rates (not IRS), tracks by gig platform (Uber, Deliveroo, Amazon Flex), groups trips into shifts, and costs half the price. It also works offline, so you never lose a trip when you lose signal.",
  },
  {
    q: "Does it track in the background?",
    a: "Yes. MileClear detects when you start driving and records trips automatically in the background. You can also start a shift manually if you prefer. Either way, your miles are captured even when the app is not on screen.",
  },
  {
    q: "Is my data safe?",
    a: "Your location data is encrypted and stored securely. We never sell your data to anyone. You can export a full copy of everything we hold, or delete your account entirely, at any time from your settings. Fully GDPR compliant.",
  },
  {
    q: "Can I use it for HMRC Self Assessment?",
    a: "Yes. Pro users can download PDF trip reports and a Self Assessment summary with every trip dated, timed, classified by business or personal, and distance-verified. Your accountant will thank you.",
  },
  {
    q: "What vehicles are supported?",
    a: "Cars, vans, and motorbikes. You can add vehicles manually or look them up by registration plate using the DVLA database. HMRC rates are applied automatically based on vehicle type.",
  },
  {
    q: "Does it work with Uber, Deliveroo, and other platforms?",
    a: "Yes. You can tag every trip with the platform you were driving for. MileClear then shows you earnings per mile, earnings per hour, and a platform comparison so you can see which ones are actually worth your time.",
  },
  {
    q: "Is it available on Android?",
    a: "MileClear is currently available on the App Store for iPhone. Android is on the roadmap. Leave your email on our site and we will let you know as soon as it launches.",
  },
];

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const toggle = (i: number) => setOpenIdx(openIdx === i ? null : i);

  return (
    <section id="faq" className="section">
      <div className="container faq__center">
        <Reveal>
          <p className="label">FAQ</p>
          <h2 className="heading">Common questions</h2>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="faq__list">
            {faqs.map((f, i) => (
              <div key={i} className={`faq-q${openIdx === i ? " faq-q--open" : ""}`}>
                <button className="faq-q__btn" onClick={() => toggle(i)} aria-expanded={openIdx === i}>
                  {f.q}
                  <span className="faq-q__icon"><PlusIcon /></span>
                </button>
                <div className="faq-q__body">
                  <p className="faq-q__answer">{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
