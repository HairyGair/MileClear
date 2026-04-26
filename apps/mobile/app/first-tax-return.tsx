import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const AMBER_FAINT = "rgba(245,166,35,0.08)";
const GREEN = "#10b981";
const GREEN_FAINT = "rgba(16,185,129,0.08)";
const RED_FAINT = "rgba(239,68,68,0.10)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

interface SectionProps {
  num: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}

function Section({ num, icon, title, children }: SectionProps) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={s.numBadge}>
          <Text style={s.numText}>{num}</Text>
        </View>
        <Ionicons name={icon} size={18} color={AMBER} style={{ marginRight: 8 }} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={s.bold}>{children}</Text>;
}

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <TouchableOpacity onPress={() => Linking.openURL(url)} style={s.link}>
      <Ionicons name="open-outline" size={13} color={AMBER} />
      <Text style={s.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function FirstTaxReturnScreen() {
  const router = useRouter();

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Hero */}
      <View style={s.hero}>
        <View style={s.heroBadge}>
          <Text style={s.heroBadgeText}>FIRST-TIME GUIDE</Text>
        </View>
        <Text style={s.heroTitle}>Your first Self Assessment</Text>
        <Text style={s.heroSub}>
          A plain-English walkthrough for self-employed drivers filing for the first time.
          About 5 minutes to read.
        </Text>
      </View>

      <Section num="1" icon="person-circle-outline" title="Are you actually self-employed?">
        <P>
          If you drive for any of Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD,
          Evri, or similar - and you use your own vehicle - HMRC treats you as
          self-employed. You are running a small business of one. You are responsible
          for declaring your earnings and paying tax on the profit yourself.
        </P>
        <P>
          The platform doesn&apos;t do this for you, even though they now report your
          earnings to HMRC under the new Digital Platform Reporting rules (as of
          January 2024).
        </P>
        <View style={[s.callout, { backgroundColor: GREEN_FAINT }]}>
          <Text style={[s.calloutText, { color: GREEN }]}>
            If you&apos;ve earned more than £1,000 in a tax year from gig work, you must
            file a Self Assessment.
          </Text>
        </View>
      </Section>

      <Section num="2" icon="key-outline" title="Get a UTR (Unique Taxpayer Reference)">
        <P>
          Before you can file, you need a UTR - a 10-digit number HMRC uses to identify
          you. You only ever have one UTR for life.
        </P>
        <P>
          To get one: register for Self Assessment on gov.uk. HMRC posts your UTR within
          10 working days. <Bold>Do this as early in the tax year as possible</Bold> -
          if you wait until October the queue gets long.
        </P>
        <ExternalLink
          url="https://www.gov.uk/register-for-self-assessment"
          label="Register on gov.uk"
        />
      </Section>

      <Section num="3" icon="calendar-outline" title="The UK tax year">
        <P>
          The UK tax year runs from <Bold>6 April to 5 April</Bold> the following year.
          Not the calendar year. Earnings from 6 April 2025 to 5 April 2026 fall into
          tax year &quot;2025-26&quot;.
        </P>
        <P>
          MileClear groups your trips and earnings by tax year automatically. When you
          export, the report covers exactly the right window.
        </P>
      </Section>

      <Section num="4" icon="cash-outline" title="What you&apos;ll actually pay">
        <P>
          Self-employed drivers pay three things on their profit:
        </P>
        <View style={s.taxRow}>
          <View style={s.taxRowLabel}>
            <Text style={s.taxRowName}>Income Tax</Text>
            <Text style={s.taxRowDetail}>20% basic, 40% higher</Text>
          </View>
          <Text style={s.taxRowMeta}>£12,570 personal allowance is tax-free</Text>
        </View>
        <View style={s.taxRow}>
          <View style={s.taxRowLabel}>
            <Text style={s.taxRowName}>Class 4 NI</Text>
            <Text style={s.taxRowDetail}>6% on £12,570-£50,270, 2% above</Text>
          </View>
          <Text style={s.taxRowMeta}>Like income tax but NI</Text>
        </View>
        <View style={s.taxRow}>
          <View style={s.taxRowLabel}>
            <Text style={s.taxRowName}>Class 2 NI</Text>
            <Text style={s.taxRowDetail}>£3.45/week if profits over £12,570</Text>
          </View>
          <Text style={s.taxRowMeta}>Voluntary - counts for state pension</Text>
        </View>
        <P>
          MileClear&apos;s dashboard shows your live HMRC tax estimate. The tax-readiness
          card in Work mode tells you how much to set aside this week.
        </P>
      </Section>

      <Section
        num="5"
        icon="map-outline"
        title="The mileage deduction (this is the big one)"
      >
        <P>
          HMRC&apos;s Approved Mileage Allowance Payment (AMAP) lets you deduct a flat
          rate per business mile from your profit:
        </P>
        <View style={s.taxRow}>
          <View style={s.taxRowLabel}>
            <Text style={s.taxRowName}>Cars and vans</Text>
            <Text style={s.taxRowDetail}>45p/mile first 10,000, then 25p</Text>
          </View>
        </View>
        <View style={s.taxRow}>
          <View style={s.taxRowLabel}>
            <Text style={s.taxRowName}>Mopeds and motorbikes</Text>
            <Text style={s.taxRowDetail}>24p/mile flat</Text>
          </View>
        </View>
        <P>
          A driver covering 20,000 business miles in a car claims £7,250 off their
          profit. At basic rate that&apos;s £1,450 less tax. <Bold>It&apos;s the largest
          single deduction available to most drivers</Bold> - which is why MileClear
          tracks every mile automatically.
        </P>
      </Section>

      <Section num="6" icon="alarm-outline" title="The 31 January deadline">
        <P>
          Your Self Assessment for tax year 2025-26 must be filed and paid by{" "}
          <Bold>31 January 2027</Bold>. Late filing is £100 instant fine, plus daily
          penalties after 3 months.
        </P>
        <P>
          You can file any time after the tax year ends (6 April). Filing early gives
          you time to plan if the bill is bigger than expected. Most drivers file in
          November-January.
        </P>
        <View style={[s.callout, { backgroundColor: RED_FAINT }]}>
          <Text style={s.calloutTextRed}>
            HMRC also wants &quot;payments on account&quot; for the next tax year - usually 50%
            of last year&apos;s bill due 31 January, another 50% due 31 July. Set this aside
            mentally as well.
          </Text>
        </View>
      </Section>

      <Section num="7" icon="checkbox-outline" title="What MileClear gives you">
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={GREEN} />
          <Text style={s.bulletText}>
            Automatic mileage log every time you drive (free)
          </Text>
        </View>
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={GREEN} />
          <Text style={s.bulletText}>
            HMRC AMAP rates applied automatically per vehicle (free)
          </Text>
        </View>
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={GREEN} />
          <Text style={s.bulletText}>
            Live tax estimate updated as you drive and log earnings (free)
          </Text>
        </View>
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={AMBER} />
          <Text style={s.bulletText}>
            Self Assessment wizard mapping your numbers to SA103 boxes (Pro)
          </Text>
        </View>
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={AMBER} />
          <Text style={s.bulletText}>
            HMRC-shaped PDF mileage log with attestation cover sheet (Pro)
          </Text>
        </View>
        <View style={s.bullet}>
          <Ionicons name="checkmark-circle" size={14} color={AMBER} />
          <Text style={s.bulletText}>
            Accountant Portal - share read-only access by email (Pro)
          </Text>
        </View>
      </Section>

      <Section num="8" icon="rocket-outline" title="Next steps">
        <View style={s.steps}>
          <Text style={s.stepNum}>1.</Text>
          <View style={s.stepBody}>
            <Text style={s.stepTitle}>Register for Self Assessment now</Text>
            <Text style={s.stepDesc}>
              Don&apos;t wait until December. The UTR posts within 10 working days.
            </Text>
            <ExternalLink
              url="https://www.gov.uk/register-for-self-assessment"
              label="Register on gov.uk"
            />
          </View>
        </View>
        <View style={s.steps}>
          <Text style={s.stepNum}>2.</Text>
          <View style={s.stepBody}>
            <Text style={s.stepTitle}>Open a separate bank account</Text>
            <Text style={s.stepDesc}>
              Optional but recommended. Keeping gig earnings in their own account makes
              the year-end maths much easier.
            </Text>
          </View>
        </View>
        <View style={s.steps}>
          <Text style={s.stepNum}>3.</Text>
          <View style={s.stepBody}>
            <Text style={s.stepTitle}>Set aside ~25-30% of every shift</Text>
            <Text style={s.stepDesc}>
              For tax + NI. The MileClear dashboard tells you exactly how much based on
              your real numbers.
            </Text>
          </View>
        </View>
        <View style={s.steps}>
          <Text style={s.stepNum}>4.</Text>
          <View style={s.stepBody}>
            <Text style={s.stepTitle}>Track every business mile</Text>
            <Text style={s.stepDesc}>
              Including the &quot;dead miles&quot; between deliveries. Every mile claimed
              reduces your tax bill.
            </Text>
          </View>
        </View>
      </Section>

      <View style={s.disclaimer}>
        <Ionicons name="information-circle-outline" size={14} color={TEXT_3} />
        <Text style={s.disclaimerText}>
          MileClear is a digital mileage tracker, not a tax adviser. For complex
          situations (multiple businesses, partnerships, capital allowances on a leased
          van), speak to an accountant.
        </Text>
      </View>

      <TouchableOpacity onPress={() => router.back()} style={s.cta}>
        <Text style={s.ctaText}>Got it</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: BG, flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  hero: { paddingTop: 8, paddingBottom: 20 },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: AMBER_FAINT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  heroBadgeText: {
    color: AMBER,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: TEXT_1,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  heroSub: {
    color: TEXT_2,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  numBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: AMBER_FAINT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  numText: {
    color: AMBER,
    fontSize: 11,
    fontWeight: "700",
  },
  sectionTitle: {
    color: TEXT_1,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  sectionBody: {},
  p: {
    color: TEXT_2,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 10,
  },
  bold: {
    color: TEXT_1,
    fontWeight: "700",
  },
  callout: {
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  calloutText: {
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 17,
  },
  calloutTextRed: {
    color: "#ef4444",
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 17,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  linkText: {
    color: AMBER,
    fontSize: 13,
    fontWeight: "600",
  },
  taxRow: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  taxRowLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  taxRowName: {
    color: TEXT_1,
    fontSize: 13,
    fontWeight: "700",
  },
  taxRowDetail: {
    color: TEXT_2,
    fontSize: 12,
  },
  taxRowMeta: {
    color: TEXT_3,
    fontSize: 11,
    marginTop: 3,
  },
  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  bulletText: {
    color: TEXT_2,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  steps: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  stepNum: {
    color: AMBER,
    fontSize: 16,
    fontWeight: "700",
    width: 18,
  },
  stepBody: { flex: 1 },
  stepTitle: {
    color: TEXT_1,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  stepDesc: {
    color: TEXT_2,
    fontSize: 12.5,
    lineHeight: 17,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 16,
  },
  disclaimerText: {
    color: TEXT_3,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  cta: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    color: "#0a0f1a",
    fontSize: 15,
    fontWeight: "700",
  },
});
