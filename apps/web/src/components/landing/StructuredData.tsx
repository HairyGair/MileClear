export default function StructuredData() {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MileClear",
    url: "https://mileclear.com",
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MileClear",
    url: "https://mileclear.com",
    logo: "https://mileclear.com/branding/logo-120x120.png",
    foundingDate: "2026-02-21",
    founder: {
      "@type": "Person",
      name: "Anthony Gair",
    },
    sameAs: ["https://apps.apple.com/app/mileclear/id6742044832"],
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
    operatingSystem: "iOS",
    downloadUrl: "https://apps.apple.com/app/mileclear/id6742044832",
    description:
      "The UK mileage tracker built for gig workers, delivery drivers, and anyone who drives for a living. Automatic trip recording, HMRC tax deductions, and real earnings insights.",
    featureList: [
      "Automatic GPS trip recording with background detection",
      "Live Activities on lock screen and Dynamic Island",
      "HMRC tax deduction calculator (45p/25p car, 24p motorbike)",
      "Shift mode with scorecards and platform tagging",
      "Business insights with earnings per mile, per hour, and weekly P&L",
      "UK fuel prices from 8,300+ government-mandated stations",
      "Saved locations with geofencing for auto-classification",
      "43 achievements, streaks, and driving records",
      "PDF and CSV exports for Self Assessment",
      "Open Banking earnings sync",
      "Offline-first with background tracking",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "GBP",
        description:
          "Unlimited trip tracking, auto detection, shift mode, fuel prices, HMRC calculator, achievements, Live Activities, saved locations, vehicle management.",
      },
      {
        "@type": "Offer",
        name: "Pro",
        priceCurrency: "GBP",
        description:
          "PDF and CSV exports, Self Assessment summary, earnings tracking, Open Banking sync, business insights, platform comparison, unlimited saved locations.",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "4.99",
          priceCurrency: "GBP",
          unitCode: "MON",
          unitText: "month",
        },
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
          text: "Yes. Trip tracking, shift mode, auto detection, fuel prices, achievements, and your HMRC deduction total are all completely free with no limits. Pro features like PDF exports, earnings tracking, and Open Banking are available from \u00A34.99/month or \u00A344.99/year.",
        },
      },
      {
        "@type": "Question",
        name: "How is this different from MileIQ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "MileClear is built for UK drivers from the ground up. It uses HMRC rates (not IRS), tracks by gig platform (Uber, Deliveroo, Amazon Flex), groups trips into shifts, and costs half the price. It also works offline, so you never lose a trip when you lose signal.",
        },
      },
      {
        "@type": "Question",
        name: "Does it track in the background?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. MileClear detects when you start driving and records trips automatically in the background. You can also start a shift manually if you prefer. Either way, your miles are captured even when the app is not on screen.",
        },
      },
      {
        "@type": "Question",
        name: "Is my data safe?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your location data is encrypted and stored securely. We never sell your data to anyone. You can export a full copy of everything we hold, or delete your account entirely, at any time from your settings. Fully GDPR compliant.",
        },
      },
      {
        "@type": "Question",
        name: "Can I use it for HMRC Self Assessment?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Pro users can download PDF trip reports and a Self Assessment summary with every trip dated, timed, classified by business or personal, and distance-verified.",
        },
      },
      {
        "@type": "Question",
        name: "What vehicles are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Cars, vans, and motorbikes. You can add vehicles manually or look them up by registration plate using the DVLA database. HMRC rates are applied automatically based on vehicle type.",
        },
      },
      {
        "@type": "Question",
        name: "Does it work with Uber, Deliveroo, and other platforms?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. You can tag every trip with the platform you were driving for. MileClear then shows you earnings per mile, earnings per hour, and a platform comparison so you can see which ones are actually worth your time.",
        },
      },
      {
        "@type": "Question",
        name: "Is it available on Android?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "MileClear is currently available on the App Store for iPhone. Android is on the roadmap. You can leave your email at mileclear.com to get notified as soon as it launches.",
        },
      },
    ],
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://mileclear.com",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
