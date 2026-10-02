import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";
import { ANDROID_OS_SCHEMA } from "@/data/android";

const URL = "https://mileclear.com/automatic-mileage-tracker";

export const metadata: Metadata = {
  title: {
    absolute: "Automatic Mileage Tracker UK: Free Auto Log | MileClear",
  },
  description:
    "How automatic mileage tracking works on iPhone and Android, what you have to allow, how accurate and battery-hungry it really is, what a mileage log must show, and how MileClear records drives on its own.",
  keywords: [
    "automatic mileage tracker",
    "automatic car mileage tracker",
    "automated mileage tracker",
    "automated mileage tracking",
    "automatic mileage log",
    "automatic mileage tracker app uk",
    "gps mileage tracker",
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: "Automatic Mileage Tracker: How Automatic Mileage Logs Work",
    description:
      "Background location, motion and drive detection explained, with the settings your phone needs and an honest word on accuracy and battery.",
    url: URL,
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Automatic Mileage Tracker: How Automatic Mileage Logs Work",
    description:
      "Background location, motion and drive detection explained, with the settings your phone needs.",
    images: ["/branding/og-image.png"],
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MileClear",
  applicationCategory: "FinanceApplication",
  operatingSystem: ANDROID_OS_SCHEMA,
  url: URL,
  description:
    "Automatic mileage tracker for UK drivers. Detects drives in the background, records the route, and works out business mileage at the approved rates for each tax year.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
    description:
      "Automatic trip tracking is free with no monthly drive cap. Pro (£4.99 a month) adds PDF and CSV exports and other extras.",
  },
};

export default function AutomaticMileageTrackerPage() {
  return (
    <GuideLayout
      eyebrow="Automatic mileage tracking"
      title="Automatic Mileage Tracker: How Automated Mileage Tracking Works"
      standfirst="An automatic mileage tracker records your drives without you pressing start or stop. Here is how that works on iPhone and Android, what your phone has to allow, how accurate it is, and what the finished mileage log needs to show."
      path="/automatic-mileage-tracker"
      updated="October 2026"
      cta={{
        href: "/app?from=seo-auto",
        label: "Get MileClear free",
        note: "Opens the App Store on an iPhone and Google Play on Android.",
      }}
      jsonLd={[softwareSchema]}
      shortAnswer={[
        "An automatic mileage tracker is an app that notices when you start driving, records the route in the background, and saves the trip when you stop. You do not open it or tap anything. At the end you have a mileage log built from what you actually drove, rather than what you remember.",
        "To work, it needs three things from your phone: location access at all times (\"Always\" on iPhone, \"Allow all the time\" on Android), motion or physical activity access, and permission to keep running in the background. On Android that last one usually means switching off battery optimisation for the app.",
        "It is not magic. It can miss the first few hundred metres of a drive, it records trips where you were a passenger, and it uses some battery. You still decide which trips were business. What it removes is the work of writing every journey down.",
      ]}
      sections={[
        {
          heading: "How automatic mileage tracking works",
          body: [
            "Your phone already knows roughly where it is and whether it is moving. An automatic tracker asks the phone to tell it when something changes, then sleeps. When you set off, one of these signals wakes it up:",
          ],
          list: [
            "Motion: the phone's motion chip reports that it is in a vehicle rather than still or walking.",
            "Location changes: the phone reports that you have moved a meaningful distance, using low-power location rather than full GPS.",
            "Speed: once the app is awake, a few GPS fixes at driving speed confirm this is a drive and not a walk to the shop.",
          ],
          after: [
            "From then on the app records GPS points every few seconds or every few tens of metres, adds up the distance along the route, and watches for the drive to end. When you have been stopped for a few minutes, it closes the trip and saves it with a start point, an end point, the date and time, and the miles.",
            "The good apps then check the distance against road routing between the points, so a patch of poor signal in a tunnel or a city centre does not shorten or lengthen the trip.",
          ],
        },
        {
          heading: "What to allow on an iPhone",
          body: [
            "iPhone is strict about apps running in the background, so the settings matter. For automatic tracking you need:",
          ],
          list: [
            "Location: Always. Settings, then the app, then Location, then Always. \"While Using the App\" means trips only record while the app is open on screen.",
            "Precise Location: on. Without it the phone only gives an approximate position, which is no good for measuring a route.",
            "Motion & Fitness: on. This is how the phone tells the app you are in a vehicle, and it lets the app start recording sooner and with less battery.",
            "Background App Refresh: on, for the app.",
            "Notifications: allowed. A tracker uses them to ask whether a finished trip was business or personal.",
          ],
          after: [
            "Two habits help. Leave the app in the app switcher rather than swiping it away, because iPhone treats a swipe as you wanting it to stop. And expect Low Power Mode to make background activity less frequent, so detection can be slower when it is on.",
          ],
        },
        {
          heading: "What to allow on Android",
          body: [
            "Android gives apps more freedom in the background, but many phone makers add their own battery management on top, and that is the most common reason an Android tracker misses trips.",
          ],
          list: [
            "Location: Allow all the time, with Use precise location switched on. Settings, Apps, the app, Permissions, Location.",
            "Physical activity: allowed. This is Android's name for motion access, and it is how the phone reports that you are in a vehicle.",
            "Notifications: allowed. Android shows a notification while a trip is recording, and the app needs it to run in the background.",
            "Battery: Unrestricted. Settings, Apps, the app, Battery, Unrestricted. \"Optimised\" lets Android pause the app when the screen is off.",
            "Your phone maker's own list: Samsung has Sleeping apps and Never sleeping apps under battery settings; Xiaomi, Huawei, Honor, Oppo and OnePlus have similar app launch or auto-start settings. Make sure the tracker is allowed to run.",
          ],
          after: [
            "Battery saver modes can still delay or stop background location on some phones. If you use one all day, expect detection to be less reliable while it is on.",
          ],
        },
        {
          heading: "How accurate is an automatic mileage log?",
          body: [
            "In the open, phone GPS is usually accurate to within a few metres, and over a whole drive the errors tend to cancel out. Where it goes wrong is predictable: tunnels, multi-storey car parks, tall buildings and long stretches with poor sky view. A tracker that checks its distance against the road network copes with those gaps better than one that just joins the dots.",
            "The bigger risks are at the edges of a trip. A phone can take a little while to notice you have set off, so the first few hundred metres may be missed or filled in from road routing. A short stop, such as a fuel station or a long red light, can split one journey into two. And a phone left on a windowsill can drift and invent a short phantom trip.",
            "An automatic tracker also records every drive, including ones where you were a passenger, on a bus, or in a taxi. That is why you always confirm or reclassify trips. An automatic log is a complete record of movement, not an automatically correct tax claim.",
          ],
        },
        {
          heading: "Battery: the honest answer",
          body: [
            "Full GPS is one of the most power-hungry things a phone does. A well-built tracker only runs it while you are actually driving, and relies on low-power location and the motion chip the rest of the time. So the cost scales with how much you drive: a few short trips a day is barely noticeable, and a ten-hour delivery shift with the screen off will use a noticeable share of the battery, much like a sat nav would.",
            "If you drive for a living, keep a charger in the vehicle. If battery use seems high when you are not driving, check the permissions above: a tracker that cannot use motion data has to lean on location more.",
          ],
        },
        {
          heading: "What a mileage log has to show",
          body: [
            "HMRC does not approve or recommend particular apps. What matters is the record itself. For each business journey, keep:",
          ],
          list: [
            "The date.",
            "Where you started and where you finished. GOV.UK asks employees claiming tax relief for the postcodes of the start and end points.",
            "The business miles.",
            "The reason for the journey, such as the client, site, job or delivery platform.",
          ],
          after: [
            "Add the vehicle, and keep running totals for the tax year, because the approved rate for a car or van changes after 10,000 business miles: 55p a mile up to 10,000 and 25p after that from 6 April 2026, and 45p then 25p before that date. Motorcycles are 24p a mile. Check the current guidance on GOV.UK before you rely on any of this, and keep the records for as long as HMRC asks (see the guide below on how long to keep them).",
            "An automatic tracker fills in the date, the start and end points and the miles for you. The reason for the journey is the part you add, usually with one tap.",
          ],
        },
        {
          heading: "Manual or automatic mileage tracking?",
          body: [
            "A manual log (paper, a spreadsheet, or tapping start and stop in an app) costs nothing in battery and records exactly what you choose. Its weakness is people. Short hops get forgotten, a busy week gets written up from memory on Sunday night, and a log reconstructed months later is the kind HMRC is most likely to question.",
            "An automatic log records everything you drive without effort, at the cost of some battery, a few permissions, and a minute a day sorting business from personal.",
            "Most drivers end up with both: automatic tracking for day-to-day driving, and manual entries for the odd trip the phone missed or a journey made in another vehicle.",
          ],
        },
        {
          heading: "How MileClear tracks mileage automatically",
          body: [
            "MileClear runs on iPhone and Android with one account across both. Once location is set to Always (or Allow all the time) it records drives while the app is closed and the phone is in your pocket. This is what it does, all on the free tier:",
          ],
          list: [
            "Starts recording on its own when you are moving at driving speed, and ends the trip when you have stopped.",
            "Shows the trip as it records on the iPhone Lock Screen and Dynamic Island, and as a notification on Android.",
            "Asks whether a finished trip was work or personal, from the notification, and learns your regular routes.",
            "Names your stops with saved places such as Home or the depot, and ignores GPS drift while you are parked at one.",
            "Checks each trip's distance against road routing and shows a High, Medium or Low confidence badge, so you know which trips to look at.",
            "Saves trips on the phone first, so a drive through a signal blackspot is not lost, and syncs when you are back online.",
            "Lets you add a missed trip by hand from the start and end address, with the distance worked out from road routing.",
            "Applies the approved rate for the tax year each trip falls in: 45p for trips before 6 April 2026, 55p from then on, 25p above 10,000 miles.",
          ],
          after: [
            "There is no monthly limit on how many trips it records. Pro (£4.99 a month or £44.99 a year) adds the PDF and CSV exports, rules that classify trips from your work schedule, and business insights. MileClear does not file your tax return; it gives you the figures and the log to back them up.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Is there a free automatic mileage tracker?",
          answer:
            "Yes. MileClear tracks drives automatically on iPhone and Android with no monthly limit on trips. Pro (£4.99 a month) is only needed for PDF and CSV exports and a few extras. Some other apps offer automatic tracking free up to a set number of drives a month and charge after that.",
        },
        {
          question: "Will HMRC accept an automatic mileage log?",
          answer:
            "HMRC does not approve particular apps. It looks at whether the record shows the date, start and end points, miles and business reason for each journey, and whether it was kept at the time rather than rebuilt later. An automatic log covers the first three for you, and you add the reason. Check the current requirements on GOV.UK.",
        },
        {
          question: "Does automatic mileage tracking drain my battery?",
          answer:
            "It uses some. Full GPS only runs while you are driving, so the cost depends on how much you drive. Light use is barely noticeable; a long working day of driving uses a noticeable share, similar to running a sat nav. Allowing motion access helps, because the app can rely on the motion chip instead of location while you are still.",
        },
        {
          question: "Why did my automatic mileage tracker miss a trip?",
          answer:
            "The usual causes are location set to While Using instead of Always or Allow all the time, motion or physical activity turned off, Android battery optimisation or a phone maker's sleeping-apps list, battery saver or Low Power Mode, and swiping the app away on an iPhone. Very short trips can also finish before the phone notices you set off. Fix the setting, then add the missed trip by hand.",
        },
        {
          question: "Does it record trips when I am a passenger?",
          answer:
            "It can. The phone knows it is in a moving vehicle, not whose vehicle it is. Mark those trips as personal or delete them. Only journeys you made for work in your own vehicle count towards a mileage claim.",
        },
        {
          question: "Does automatic tracking work without mobile signal?",
          answer:
            "Yes. GPS does not need mobile data. MileClear saves trips on the phone first and uploads them when you are back in signal, so a rural blackspot does not lose a journey.",
        },
        {
          question: "Do I need to open the app before I drive?",
          answer:
            "No. Once the permissions are set, the app wakes itself when you start driving. You only open it to check or classify trips, and you can do most of that from the notification.",
        },
        {
          question: "Can it tell business trips from personal ones automatically?",
          answer:
            "Partly. MileClear suggests a classification from routes you have marked before, and trips between saved places can be classified for you. Pro adds rules based on your working hours. You should still check, because only you know why you made a journey.",
        },
      ]}
      caution={{
        title: "Check your settings after every phone update",
        body: "Phone updates and battery clean-ups sometimes reset location and background permissions. If trips stop appearing, check location is still on Always or Allow all the time, and on Android that the app is still Unrestricted for battery, before assuming the tracker has broken.",
      }}
      links={[
        { href: "/app?from=seo-auto", label: "Get MileClear free", primary: true },
        { href: "/android", label: "MileClear on Android" },
        { href: "/tracker-missed-a-trip", label: "My tracker missed a trip" },
        { href: "/hmrc-mileage-rates", label: "HMRC mileage rates" },
        { href: "/what-counts-as-business-mileage", label: "What counts as business mileage" },
        { href: "/how-long-to-keep-mileage-records", label: "How long to keep records" },
        { href: "/free-mileage-tracker-uk", label: "Free mileage tracker" },
      ]}
    />
  );
}
