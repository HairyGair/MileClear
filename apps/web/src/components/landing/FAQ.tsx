"use client";

import { useState } from "react";
import Reveal from "./Reveal";

const faqs = [
  {
    q: "Is MileClear really free?",
    a: "Yes. Mileage tracking, shift mode, and gamification are completely free, forever. Premium features like tax exports and earnings tracking are \u00A34.99/month, but you\u2019ll never be forced to pay to track your miles.",
  },
  {
    q: "How is this different from MileIQ?",
    a: "Reliability. MileClear is built offline-first \u2014 your trips are saved on your phone before they ever touch the cloud. If your signal drops, nothing is lost. We also show you exactly which trips were captured so you can trust your records.",
  },
  {
    q: "Does it work in the background?",
    a: "Yes. During a shift, MileClear tracks in the background. Outside of a shift, it uses low-power detection to notice when you\u2019re driving and asks if you want to record \u2014 no battery drain when you\u2019re not working.",
  },
  {
    q: "Is my data safe?",
    a: "Your location data is encrypted and stored securely. We never sell your data. You can export or delete everything at any time. We\u2019re fully GDPR compliant.",
  },
  {
    q: "Can I use it for HMRC Self Assessment?",
    a: "Yes (Premium feature). MileClear generates reports that match HMRC requirements \u2014 every trip is dated, timed, classified, and distance-verified.",
  },
  {
    q: "What vehicles are supported?",
    a: "Cars, motorbikes, and vans. Bicycle and e-bike support is coming later.",
  },
  {
    q: "When is it launching?",
    a: "We\u2019re currently in development. Sign up for early access above and we\u2019ll let you know as soon as it\u2019s ready for testing.",
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
          <h2 className="heading">Questions? Answered.</h2>
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
