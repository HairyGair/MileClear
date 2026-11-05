import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import "../legal.css";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "How MileClear approaches accessibility. What MileClear does for accessibility on the web and in the phone app, what it does not do yet, and how to report a problem to support@mileclear.com.",
  alternates: {
    canonical: "https://mileclear.com/accessibility",
  },
  openGraph: {
    title: "Accessibility Statement | MileClear",
    description: "What MileClear does for accessibility, the known gaps, and how to report a problem.",
    url: "https://mileclear.com/accessibility",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Accessibility Statement | MileClear",
    description: "What MileClear does for accessibility, the known gaps, and how to report a problem.",
    images: ["/branding/og-image.png"],
  },
};

export default function AccessibilityStatement() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Accessibility Statement", path: "/accessibility" }]} />
      <Navbar />

      <main className="legal">
        <div className="container">

          {/* Header */}
          <div className="legal__header">
            <h1 className="heading">Accessibility Statement</h1>
            <p className="legal__date">Last updated: 5 November 2026</p>
          </div>

          {/* Table of Contents */}
          <nav className="legal__toc" aria-label="On this page">
            <h2 className="legal__toc-title">Quick Navigation</h2>
            <ul className="legal__toc-list">
              <li><a href="#commitment" className="legal__toc-link">Our Commitment</a></li>
              <li><a href="#standard" className="legal__toc-link">The Standard We Aim For</a></li>
              <li><a href="#web" className="legal__toc-link">Web (mileclear.com)</a></li>
              <li><a href="#ios" className="legal__toc-link">Phone App</a></li>
              <li><a href="#known-issues" className="legal__toc-link">Known Limitations</a></li>
              <li><a href="#report" className="legal__toc-link">Report an Accessibility Issue</a></li>
              <li><a href="#enforcement" className="legal__toc-link">Enforcement</a></li>
            </ul>
          </nav>

          {/* Main Content */}
          <div className="legal__content">

            <section id="commitment" className="legal__section">
              <h2 className="legal__section-title">1. Our Commitment</h2>
              <p className="legal__text">
                MileClear is built so UK drivers can claim every tax-deductible mile they are owed. That only means something if the app works for everyone, however they use their phone or computer.
              </p>
              <p className="legal__text">
                We are working towards the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA on the website and in the phone app. We have not reached it everywhere, and this page says where we have and have not.
              </p>
              <p className="legal__text">
                We are one developer (Anthony) building MileClear for UK gig and self-employed drivers. Where we fall short, we want to know, and we will fix it.
              </p>
            </section>

            <section id="standard" className="legal__section">
              <h2 className="legal__section-title">2. The Standard We Aim For</h2>
              <p className="legal__text">
                WCAG 2.1 Level AA, on the website and in the iPhone and Android apps. For the iPhone app we use Apple's own accessibility features, so that VoiceOver, larger text and Reduce Motion work the way people expect.
              </p>
              <p className="legal__text">
                We have not had a formal third-party accessibility audit. What we have done is described below, so you can judge how far to rely on it.
              </p>
              <p className="legal__text">
                How we checked: automated checks with the axe testing tool on the public website pages and on the web dashboard pages, keyboard checks of the main website and dashboard pages, a review of the phone app code for screen reader names, roles and headings, and testing of the iPhone app in the iOS simulator. We have not tested every screen with every screen reader.
              </p>
            </section>

            <section id="web" className="legal__section">
              <h2 className="legal__section-title">3. Web (mileclear.com)</h2>
              <p className="legal__text">
                This covers the public website and the web dashboard at mileclear.com/dashboard. What we do:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item"><strong>Keyboard:</strong> pages can be used with the keyboard alone, and a "Skip to content" link is the first thing you reach on the public pages, the sign-in pages, the dashboard and the admin area.</li>
                <li className="legal__list-item"><strong>Focus outline:</strong> buttons, links and fields show a visible outline when you reach them with the keyboard. The release banner at the top of the site has its own outline too.</li>
                <li className="legal__list-item"><strong>Form fields:</strong> the fields on the sign-in, create account and support pages and in the dashboard have a label tied to the field. The edges of text fields, switches and filter buttons are at least 3:1 against what is behind them (the dashboard field edge measures 3.7:1 on the page background). Sign-in, create account, reset password and verify pages each have their own page title.</li>
                <li className="legal__list-item"><strong>Links in text:</strong> links inside sentences are underlined, so they do not rely on colour alone.</li>
                <li className="legal__list-item"><strong>Movement:</strong> if your device is set to reduce motion, the animations are turned off. Otherwise the home page demo has a Pause button, and the looping glows and floating effects stop by themselves after a few seconds.</li>
                <li className="legal__list-item"><strong>Messages:</strong> confirmation and error messages in the dashboard are announced by screen readers. They stay on screen while you hover over them or have keyboard focus on them.</li>
                <li className="legal__list-item"><strong>Dialogs:</strong> pop-up windows in the dashboard and admin area are announced as dialogs, move keyboard focus into the window, close with the Escape key, and return focus to where you were.</li>
                <li className="legal__list-item"><strong>Tables and the Working calendar:</strong> table rows that open a record do so from a button in the row. Each day in the Working calendar is read out with its date and miles, and days with driving can be reached with the Tab key to show the miles on screen.</li>
                <li className="legal__list-item"><strong>High contrast (forced colours) mode:</strong> in Windows high contrast mode the dashboard switches, selected filter buttons, focus outline and the current page in the menu are drawn with the system colours so they stay visible. We have added this to the dashboard only, not to every public page.</li>
              </ul>
              <p className="legal__text">
                We use semantic HTML (headings in order, lists for lists, ARIA only where plain HTML is not enough). Body text on our dark background is light grey or white; we check new colours against 4.5:1 for text and 3:1 for large text and for the edges of controls.
              </p>
            </section>

            <section id="ios" className="legal__section">
              <h2 className="legal__section-title">4. Phone App</h2>
              <p className="legal__text">
                What the iPhone app does (the Android app is built from the same screens, see below):
              </p>
              <ul className="legal__list">
                <li className="legal__list-item"><strong>Screen readers:</strong> buttons, tabs, switches, text fields and chosen options have a spoken name and say what they are. We aim for every control to have one and fixed the gaps a code review found, but we have not heard every screen read aloud.</li>
                <li className="legal__list-item"><strong>Headings:</strong> screen titles and the section titles on the tax screens are marked as headings, so screen reader users can jump between them.</li>
                <li className="legal__list-item"><strong>Error messages:</strong> on sign-in, create account, verify, reset password and the National Insurance number screen, a mistake is explained in words (not only by a colour), and it is read out when it appears.</li>
                <li className="legal__list-item"><strong>Trips list:</strong> each trip offers the same choices as its swipe and long-press menu as screen reader actions: mark as Business or Personal, put back in To sort, add or edit a note, join trips and delete. Delete still asks first.</li>
                <li className="legal__list-item"><strong>Text size:</strong> text follows your phone's text size up to 200%. At the larger sizes labels wrap instead of being cut off. Two exceptions: the labels on the bottom tab bar shrink to fit rather than growing past a point, and the MileClear logo does not scale.</li>
                <li className="legal__list-item"><strong>Reduce Motion:</strong> the pulsing recording dot and other decorative animations stay still when Reduce Motion is on.</li>
                <li className="legal__list-item"><strong>Field outlines:</strong> text fields have an outline that is at least 3:1 against the screen, and a solid amber outline while you type in them.</li>
                <li className="legal__list-item"><strong>Autofill:</strong> sign-up, sign-in, reset password and profile fields tell the phone what they are for (email, name, password, one-time code), so password managers and autofill work.</li>
                <li className="legal__list-item"><strong>Colour:</strong> grey text has been lifted to meet the 4.5:1 contrast needed for text. Where a status is shown by a colour we aim to add words as well. The National Insurance number screen does, and we have not checked every screen for this.</li>
              </ul>
              <p className="legal__text">
                We use Apple's on-device features for receipt scanning and Live Activities, and do not interfere with how Apple makes them work with assistive technology.
              </p>
              <p className="legal__text">
                The Android app on Google Play is built from the same screens and labels as the iPhone app. We have not yet tested it with TalkBack from start to finish, so please tell us about anything that does not work for you.
              </p>
            </section>

            <section id="known-issues" className="legal__section">
              <h2 className="legal__section-title">5. Known Limitations</h2>
              <p className="legal__text">
                We would rather be straight about where we fall short. As of the date at the top of this page:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">We have not had a formal third-party accessibility audit. Our checks are the ones listed in section 2, and they do not cover every screen reader or every page.</li>
                <li className="legal__list-item">The phone app does not specifically respond to the Increase Contrast or Bold Text settings. Its colours are fixed, and most text and field outlines meet the contrast levels above, but the app does not get stronger when you switch these on.</li>
                <li className="legal__list-item">The Android app has not yet been tested end to end with TalkBack.</li>
                <li className="legal__list-item">The app versions on the App Store and Google Play today work in portrait only. Landscape is built and arrives with the next app version.</li>
                <li className="legal__list-item">The labels on the phone app's bottom tab bar shrink to fit at the largest text sizes instead of growing to 200%, and the MileClear logo does not change size.</li>
                <li className="legal__list-item">The Android app does not tell TalkBack that its language is English separately. TalkBack uses your phone's language, so a phone set to another language may read the app's English text in the wrong voice.</li>
                <li className="legal__list-item">The website and dashboard have been checked with automated tools and by keyboard, not with every screen reader. We have not checked every page at 200% browser zoom, and forced colours support covers the dashboard only.</li>
                <li className="legal__list-item">The Activity Heatmap and the maps for trip routes give a summary in words but do not describe every individual point to a screen reader.</li>
                <li className="legal__list-item">Not every status in the phone app is shown in words as well as colour. We have fixed the places we found, and may have missed others.</li>
              </ul>
              <p className="legal__text">
                If any of these stops you using MileClear, please report it (see below) and we will put it first.
              </p>
            </section>

            <section id="report" className="legal__section">
              <h2 className="legal__section-title">6. Report an Accessibility Issue</h2>
              <p className="legal__text">
                If you find anything in MileClear that doesn't work with the assistive technology you use, we want to know.
              </p>
              <div className="legal__card">
                <p className="legal__card-text">
                  Email <strong>support@mileclear.com</strong> with:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">A description of what you were trying to do.</li>
                  <li className="legal__list-item">The page or screen you were on (a screenshot or screen recording helps, but is optional).</li>
                  <li className="legal__list-item">The assistive technology you're using (for example VoiceOver on iOS 18, or NVDA on Windows 11).</li>
                  <li className="legal__list-item">Your device and browser if it's a web issue (e.g. iPhone 15 Pro Safari, MacBook Air Chrome).</li>
                </ul>
              </div>
              <p className="legal__text">
                <strong>Our promise:</strong> we'll acknowledge your report within 2 working days. We aim to ship a fix within 14 days for issues that block use of a feature, and within 30 days for everything else. If a fix takes longer because the underlying platform constrains us (rare but possible), we'll tell you what the timeline looks like and what we're doing in the meantime.
              </p>
              <p className="legal__text">
                Anthony reads every accessibility report personally.
              </p>
            </section>

            <section id="enforcement" className="legal__section">
              <h2 className="legal__section-title">7. Enforcement</h2>
              <p className="legal__text">
                If you contact us about an accessibility issue and you're unhappy with our response, you can escalate to the Equality Advisory and Support Service (EASS):
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">Web: <a href="https://www.equalityadvisoryservice.com" target="_blank" rel="noopener noreferrer">equalityadvisoryservice.com</a></li>
                <li className="legal__list-item">Telephone: 0808 800 0082</li>
                <li className="legal__list-item">Textphone: 0808 800 0084</li>
              </ul>
              <p className="legal__text">
                MileClear is a private commercial service, not a public-sector body, so we sit outside the Public Sector Bodies Accessibility Regulations 2018. We hold ourselves to the same standard regardless.
              </p>
            </section>

          </div>

        </div>
      </main>

      <Footer />
    </>
  );
}
