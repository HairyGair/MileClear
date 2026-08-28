import type { Metadata } from "next";
import GuideLayout from "@/components/guides/GuideLayout";

export const metadata: Metadata = {
  title: "Your Mileage Tracker Missed a Trip: What To Do",
  description:
    "Why tracking apps miss drives, what to check first, how to add a missing journey in a way HMRC will accept, and the phone settings that stop it happening again.",
  alternates: {
    canonical: "https://mileclear.com/tracker-missed-a-trip",
  },
  openGraph: {
    title: "Your Tracker Missed a Trip | MileClear",
    description:
      "What to check first, how to add the journey properly, and the settings that stop it happening again.",
    url: "https://mileclear.com/tracker-missed-a-trip",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Tracker Missed a Trip | MileClear",
    description: "Why tracking apps miss drives, and what to do about it.",
    images: ["/branding/og-image.png"],
  },
};

export default function TrackerMissedATripPage() {
  return (
    <GuideLayout
      eyebrow="Tracking"
      title="Your tracker missed a trip"
      standfirst="It happens to every automatic mileage app, ours included. Here is what to check, how to put the journey back properly, and how to make it rarer."
      path="/tracker-missed-a-trip"
      shortAnswer={[
        "Check first whether the drive has actually finished. Roughly one in five missing-trip reports we receive turn out to be journeys still in progress, which cannot appear in a list until they end.",
        "If it is genuinely missing, add it by hand. A manually entered trip is exactly as valid to HMRC as an automatically recorded one, provided the date, route, purpose and mileage are accurate.",
        "Then fix the cause, which is almost always a phone setting rather than the app: location permission set to While Using rather than Always, or a battery optimiser shutting the app down in your pocket.",
      ]}
      sections={[
        {
          heading: "Check these four things first",
          body: [
            "In order, because they account for most reports.",
          ],
          list: [
            "Is the drive over? A journey that has not ended has nothing to show yet. Give it a few minutes after you park.",
            "Has the app synced? Open it while you have signal. A trip recorded offline sits on the phone until it can upload, which on a rural round can be hours.",
            "Is it there but named oddly? Automatic trackers start recording a few hundred metres into a drive, so a journey can be filed under a road you passed rather than the place you left, and be easy to scroll past.",
            "Was it very short? Under about half a mile, most trackers cannot tell a drive from a walk across a car park, and many discard it rather than invent it.",
          ],
        },
        {
          heading: "Adding the journey properly",
          body: [
            "There is no penalty for a manual entry and no expectation that every trip is GPS-recorded. HMRC cares that the record is accurate and contemporaneous, not how it was captured.",
            "Enter it as soon as you notice, while you can still remember it. Put in the real start and end points rather than approximations, the actual date and time, and the reason for the trip. If you are estimating the distance, use a route planner rather than a guess, and note that it is an estimate.",
            "What you should not do is round a fortnight of half-remembered driving into one tidy number at the end of the month. That is the sort of record that falls apart if anyone ever looks at it.",
          ],
        },
        {
          heading: "Why it happens at all",
          body: [
            "An automatic tracker is trying to do something phones are actively designed to prevent: run continuously in the background, using the most power-hungry sensor on the device, for hours at a time.",
            "Both iOS and Android will shut an app down to save battery, and Android phone makers add their own battery managers on top that are more aggressive still. The app then has to be woken by the operating system when movement starts, which takes a few hundred metres, and stay awake for the whole drive.",
            "So the failures cluster in predictable places: very short hops that are over before the app is properly awake, drives that begin immediately after the phone has been sitting untouched for hours, and phones with aggressive power saving turned on.",
          ],
        },
        {
          heading: "Making it rarer",
          body: [
            "Four settings do most of the work, whichever app you use.",
          ],
          list: [
            "Set location permission to Always, not While Using. This is the single biggest one: While Using means the app is only allowed to see where you are when it is open on screen, which is never while you are driving.",
            "Turn off battery optimisation for the app. On Android this lives under battery settings and is often called unrestricted or unmonitored; on Samsung phones check the separate sleeping apps list too.",
            "Save the places you go regularly. An app that knows your home, your depot and your regular customers can recognise a departure straight away instead of waiting to be sure you are moving.",
            "Keep the app updated. Trip capture is where most of the engineering in a tracker goes, and an old version is missing fixes that exist.",
          ],
        },
        {
          heading: "What no tracker can promise",
          body: [
            "Be sceptical of any app claiming it catches every drive. A missed trip leaves no trace anywhere, which means nobody can measure how many they missed, including us. Any percentage in that sentence is a guess dressed up as a statistic.",
            "What an app can reasonably promise is that missed drives are rare, that you can add one in under a minute, and that when you report one somebody looks at what actually happened on your phone rather than telling you to reinstall.",
          ],
        },
      ]}
      faqs={[
        {
          question: "Is a manually added trip less valid to HMRC?",
          answer:
            "No. There is no requirement for mileage to be captured automatically. The record needs the date, the route, the business purpose and the mileage, and it needs to be accurate. How it got there is not the test.",
        },
        {
          question: "Can I add a trip from last month?",
          answer:
            "Yes, and you should if you genuinely drove it. Add it with the correct date rather than today's, and if the distance is a reconstruction rather than a measurement, say so in the notes. A contemporaneous record is better, but a late accurate one is far better than a missing one.",
        },
        {
          question: "Why do some trips start down the road from where I set off?",
          answer:
            "Because the app is woken by movement, and by the time it has a reliable position you are a few hundred metres along. Good trackers reconcile that afterwards by extending the start back to where the previous trip ended. If yours does not, the opening stretch of every journey is quietly missing from your mileage.",
        },
        {
          question: "The app recorded a journey I never made. Is that the same problem?",
          answer:
            "It is the other side of it. A phone that loses GPS and falls back to phone masts can produce a position a mile or two from where you are, and a tracker that believes it will draw a straight line to your real location and call it a drive. Delete it, and if it keeps happening report it, because that is a fixable defect rather than a fact of life.",
        },
        {
          question: "Does an app draining my battery mean it is working properly?",
          answer:
            "Not necessarily, and heavy drain is worth questioning. A well-built tracker asks for coarse position most of the time and only turns on precise tracking once it is confident you are driving.",
        },
      ]}
      caution={{
        title: "If it is happening repeatedly",
        body: "One missed trip is ordinary. The same trip missed every week is a fixable problem, usually a permission or a battery setting, and occasionally a genuine bug in the app. Report it with the date and route rather than working around it: on our side, a report with a date attached can be traced through what the phone actually did, and several of the fixes shipped this year came from exactly that.",
      }}
      links={[
        { href: "/support", label: "Report a missing trip", primary: true },
        { href: "/how-long-to-keep-mileage-records", label: "How long to keep records" },
        { href: "/business-mileage-guide", label: "The business mileage guide" },
      ]}
    />
  );
}
