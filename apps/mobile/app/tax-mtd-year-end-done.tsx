// End of year, part 3: confirmation. HMRC sends no confirmation of its own
// ("Software displays the confirmation message to the user (HMRC does not do
// this)"), so this screen is the driver's record. HMRC's reply has no body;
// the reference is the calculation ID the driver agreed to, plus HMRC's
// correlation ID for support.

import { View, Text, ScrollView } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  TaxReturnTestBanner,
  YearEndLiveGate,
  Section,
  Body,
  Row,
  Note,
  SecondaryButton,
  partStyles as s,
} from "../components/taxReturn/TaxReturnParts";
import { totalDueLine } from "../lib/tax/taxReturnCopy";
import { colors, fonts } from "../lib/theme";

export default function TaxMtdYearEndDoneScreen() {
  return (
    <YearEndLiveGate>
      <Done />
    </YearEndLiveGate>
  );
}

function Done() {
  const p = useLocalSearchParams<{
    taxYear: string;
    calculationId: string;
    correlationId?: string;
    submittedAt?: string;
    environment?: string;
    total?: string;
  }>();
  const isLive = p.environment === "production";
  const total = p.total ? Number(p.total) : undefined;
  const due = totalDueLine(Number.isFinite(total) ? total : undefined);
  const when = p.submittedAt ? new Date(p.submittedAt) : null;
  const whenLabel =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
      : "Just now";
  const endYear = p.taxYear ? parseInt(p.taxYear.slice(0, 4), 10) + 1 : undefined;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen
        options={{
          title: isLive ? "Tax return submitted" : "Test return submitted",
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text1,
          headerBackVisible: false,
        }}
      />

      {/* Shown on every tax return screen until production credentials arrive,
          like the other quarterly update screens. Remove with the go-live copy sweep. */}
      <TaxReturnTestBanner
        title="Submitted to HMRC's test service"
        body="This was a test. Nothing reached HMRC and your tax account is not changed. You still need to send your real tax return for this year."
      />

      <View style={{ alignItems: "center", paddingVertical: 16, gap: 10 }}>
        <View
          style={{
            backgroundColor: colors.green,
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="checkmark" size={42} color="#000" />
        </View>
        <Text style={{ color: colors.text1, fontSize: 22, fontFamily: fonts.bold, textAlign: "center" }}>
          {isLive ? `Your ${p.taxYear} tax return is submitted` : `Test tax return for ${p.taxYear} submitted`}
        </Text>
      </View>

      <Section title="Your record">
        <Row label="Tax year" value={p.taxYear ?? "-"} />
        <Row label="Submitted" value={whenLabel} />
        <Row label={due.label} value={due.amount} />
        <View style={{ gap: 2, marginTop: 4 }}>
          <Body muted>Reference (HMRC calculation ID)</Body>
          <Text selectable style={{ color: colors.text1, fontFamily: fonts.semibold, fontSize: 14 }}>
            {p.calculationId ?? "-"}
          </Text>
        </View>
        {!!p.correlationId && (
          <View style={{ gap: 2 }}>
            <Body muted>HMRC message ID, if you need to contact HMRC or MileClear support</Body>
            <Text selectable style={{ color: colors.text2, fontFamily: fonts.regular, fontSize: 13 }}>
              {p.correlationId}
            </Text>
          </View>
        )}
        <Body muted>Take a screenshot of this screen to keep a copy.</Body>
      </Section>

      <Section title="What happens next">
        <Note text="It can take up to an hour for HMRC to show your tax return as received." />
        {endYear !== undefined && (
          <Note
            text={`If you owe tax, pay it by 31 January ${endYear + 1}. HMRC will tell you how much and how to pay in HMRC online services.`}
          />
        )}
        <Note text="To change your tax return later, contact HMRC or use software that can amend a return." />
      </Section>

      <SecondaryButton label="Done" onPress={() => router.replace("/tax-mtd" as never)} />
    </ScrollView>
  );
}
