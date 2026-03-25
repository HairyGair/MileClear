export default function StructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MileClear",
    url: "https://mileclear.com",
    logo: "https://mileclear.com/branding/logo-120x120.png",
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@mileclear.com",
      contactType: "customer support",
      availableLanguage: "English",
    },
  };

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MileClear",
    applicationCategory: "BusinessApplication",
    operatingSystem: "iOS, Android",
    description:
      "The mileage tracker that actually works. Built for gig drivers, delivery riders, and anyone who drives for a living. Free to use, offline-first, HMRC ready.",
    featureList: [
      "Automatic GPS mileage tracking",
      "HMRC tax deduction calculator",
      "Business and personal trip classification",
      "Earnings tracking by platform",
      "Fuel price comparison",
      "PDF and CSV exports for self-assessment",
      "Gamification with achievements and streaks",
      "Offline-first with background tracking",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "GBP",
        description:
          "Unlimited trip tracking, drive detection, trip classification, fuel prices, earnings tracking, achievements, weekly summaries.",
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: "4.99",
        priceCurrency: "GBP",
        billingIncrement: "P1M",
        description:
          "HMRC-ready PDF and CSV exports, accounting integration, advanced analytics, Open Banking earnings import.",
      },
    ],
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is MileClear really free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Mileage tracking, shift mode, and gamification are completely free, forever. Premium features like tax exports and earnings tracking are \u00A34.99/month, but you\u2019ll never be forced to pay to track your miles.",
        },
      },
      {
        "@type": "Question",
        name: "How is this different from MileIQ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Reliability. MileClear is built offline-first \u2014 your trips are saved on your phone before they ever touch the cloud. If your signal drops, nothing is lost. We also show you exactly which trips were captured so you can trust your records.",
        },
      },
      {
        "@type": "Question",
        name: "Does it work in the background?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. During a shift, MileClear tracks in the background. Outside of a shift, it uses low-power detection to notice when you\u2019re driving and asks if you want to record \u2014 no battery drain when you\u2019re not working.",
        },
      },
      {
        "@type": "Question",
        name: "Is my data safe?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your location data is encrypted and stored securely. We never sell your data. You can export a full copy of everything we hold or delete your account entirely at any time \u2014 it\u2019s all in your settings. We\u2019re fully GDPR compliant.",
        },
      },
      {
        "@type": "Question",
        name: "Can I use it for HMRC Self Assessment?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes (Premium feature). MileClear generates reports that match HMRC requirements \u2014 every trip is dated, timed, classified, and distance-verified.",
        },
      },
      {
        "@type": "Question",
        name: "What vehicles are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Cars, motorbikes, and vans. Bicycle and e-bike support is coming later.",
        },
      },
      {
        "@type": "Question",
        name: "Is MileClear available now?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes - MileClear is live on the App Store for iPhone. Download it free and start tracking straight away. Android is coming soon.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplication),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
    </>
  );
}
