// Baseline: Today screen. Session and fuel targets come from the plan and nutrition engines.
import { ScrollView, View, Text, StyleSheet, useColorScheme } from "react-native";

import { buildWeek, SPORTS, DAY_NAMES } from "@/engine/plan";
import { dayTargets, TIPS } from "@/engine/nutrition";
import { bandOf } from "@/engine/scoring";
import { sessionTargets } from "@/engine/targets";
import { TODAY as SNAPSHOT, DEFAULT_GOALS, FITNESS, sleepAvg7 } from "@/data/live";

const light = { bg: "#F2F5F4", card: "#FFFFFF", line: "#D5DEDB", fg: "#13201D", muted: "#5A6B67", accent: "#1F6A86", accentSoft: "#D9EAF0", good: "#2A8F5F", warn: "#C28414", bad: "#C24E38" };
const dark = { bg: "#0E1513", card: "#16201E", line: "#2A3835", fg: "#E4ECEA", muted: "#93A5A0", accent: "#6CB4D0", accentSoft: "#1B3540", good: "#5BC48F", warn: "#E5B04A", bad: "#E77C64" };
type Palette = typeof light;

/** Training days are weekdays (0 = Monday); the plan runs for the 7 days starting today. */
function fromToday(goals: typeof DEFAULT_GOALS, todayDow: number) {
  const shift = (d: number) => (d - todayDow + 7) % 7;
  return { ...goals, days: goals.days.map(shift), longDays: goals.longDays.map(shift) };
}

function hrvPosition(v: number, [lo, hi]: readonly [number, number]) {
  if (v < lo) return "below";
  if (v > hi) return "above";
  const f = (v - lo) / (hi - lo);
  return f > 0.67 ? "near the top of" : f < 0.33 ? "near the bottom of" : "in the middle of";
}

const hoursLabel = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

export default function TodayScreen() {
  const c = useColorScheme() === "dark" ? dark : light;
  const s = styles(c);

  const todayDate = new Date(`${SNAPSHOT.date}T12:00:00`);
  const todayDow = (todayDate.getDay() + 6) % 7;            // 0 = Monday
  const dayName = (i: number) => DAY_NAMES[(todayDow + i) % 7];
  const dateLabel = todayDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  const goals = DEFAULT_GOALS;
  const plan = buildWeek(fromToday(goals, todayDow), { readiness: SNAPSHOT.readiness, sleepAvg7, loadRatio: SNAPSHOT.loadRatio, today: SNAPSHOT.date });
  const session = plan.week[0];
  const fuel = dayTargets(session, goals);
  const nextIndex = plan.week.findIndex((x, i) => i > 0 && x && x.sport);
  const next = nextIndex > 0 ? plan.week[nextIndex] : null;
  const adjusted = !!session && (session.swappedIn || !!session.replaced);
  const targets = sessionTargets(session, session?.goal ?? "", FITNESS);

  const Score = ({ label, value, unit }: { label: string; value: number; unit: string }) => (
    <View style={s.score}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.scoreValue}>{value}</Text>
      <Text style={s.muted}>{unit}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${Math.min(100, value)}%`, backgroundColor: c[bandOf(value)] }]} /></View>
    </View>
  );

  const Stat = ({ label, value, unit }: { label: string; value: string | number; unit?: string }) => (
    <View style={s.stat}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.statValue}>{value}<Text style={s.muted}>{unit ? ` ${unit}` : ""}</Text></Text>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.page} contentInsetAdjustmentBehavior="automatic">
      <Text style={s.title}>Good morning, Will</Text>
      <Text style={s.muted}>{dateLabel} · {SNAPSHOT.syncedLabel}</Text>

      <View style={s.row}>
        <Score label="RECOVERY" value={SNAPSHOT.readiness} unit="of 100" />
        <Score label="SLEEP" value={SNAPSHOT.lastNight.score} unit={hoursLabel(SNAPSHOT.lastNight.hours)} />
      </View>

      <View style={[s.card, { backgroundColor: c.accentSoft, borderColor: c.accentSoft }]}>
        <Text style={[s.h2, { color: c.accent }]}>Today's insight</Text>
        <Text style={s.body}>
          Recovery is {SNAPSHOT.readiness}{SNAPSHOT.readiness < 34 ? ", so today is a rest day" : SNAPSHOT.readiness < 67 ? ", so keep today easy" : " and you're ready to train"}.
          {sleepAvg7 < 6 ? ` Sleep is the main thing holding you back: the last seven nights averaged ${sleepAvg7.toFixed(1)} h.` : ""}
        </Text>
        <Text style={s.body}>• HRV is {SNAPSHOT.hrvMs} ms, {hrvPosition(SNAPSHOT.hrvMs, SNAPSHOT.hrvRange)} your normal range ({SNAPSHOT.hrvRange[0]}–{SNAPSHOT.hrvRange[1]} ms). Resting heart rate is {SNAPSHOT.restingHr} bpm.</Text>
        <Text style={s.body}>
          • Training load is {SNAPSHOT.loadRatio.toFixed(1)}× your usual
          {SNAPSHOT.loadRatio < 0.8 ? ", below the 0.8–1.3 target, so there's room to build." : SNAPSHOT.loadRatio <= 1.3 ? ", inside the 0.8–1.3 target." : ", above the 0.8–1.3 target, so the plan eases off."}
        </Text>
        {SNAPSHOT.recovery && SNAPSHOT.recovery.contributions.length ? (
          <Text style={s.body}>
            • What moved recovery today, against your last {SNAPSHOT.recovery.nights} nights:{" "}
            {[...SNAPSHOT.recovery.contributions].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map(c => `${c.label.toLowerCase()} ${c.points >= 0 ? "+" : "−"}${Math.abs(Math.round(c.points))}`).join(", ")}.
          </Text>
        ) : null}
        <Text style={s.body}>• Body battery is {SNAPSHOT.bodyBattery}. Aim for 7 h or more tonight.</Text>
        {next ? <Text style={s.body}>• Next up {dayName(nextIndex)}: {next.title.toLowerCase()}. {TIPS[next.kind]}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.label}>
          {session?.sport ? SPORTS[session.sport].name.toUpperCase() : "REST"} · {adjusted ? "ADJUSTED" : "AS PLANNED"}
        </Text>
        <Text style={s.h2}>{session ? session.title : "Rest day"}</Text>
        {targets ? (
          <View style={s.steps}>
            {targets.steps.map((st, i) => (
              <View key={i} style={s.stepRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepLabel}>{st.label}</Text>
                  <Text style={s.muted}>{st.detail}</Text>
                </View>
                {st.target ? <Text style={s.stepTarget}>{st.target}</Text> : null}
              </View>
            ))}
            <Text style={s.muted}>Effort: {targets.effort}{targets.distanceKm ? ` · about ${targets.distanceKm.toFixed(1)} km` : ""}</Text>
            {targets.note ? <Text style={[s.muted, { color: c.accent }]}>{targets.note}</Text> : null}
          </View>
        ) : (
          <Text style={s.muted}>{session ? session.detail : "Recovery and mobility"}</Text>
        )}
        <View style={s.fuelBox}>
          <Text style={s.label}>FUEL TODAY · {fuel.carbLevel.toUpperCase()} CARB</Text>
          <View style={s.fuelRow}>
            <Text style={s.fuelNum}>{fuel.kcal.toLocaleString()}<Text style={s.muted}> kcal</Text></Text>
            <Text style={s.fuelNum}>{fuel.proteinG}<Text style={s.muted}> g P</Text></Text>
            <Text style={s.fuelNum}>{fuel.carbsG}<Text style={s.muted}> g C</Text></Text>
            <Text style={s.fuelNum}>{fuel.fatG}<Text style={s.muted}> g F</Text></Text>
          </View>
          <Text style={s.muted}>{fuel.tip}</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.h2}>This week</Text>
        {plan.week.map((x, i) => (
          <View key={i} style={s.weekRow}>
            <Text style={[s.weekDay, i === 0 && { color: c.accent }]}>{i === 0 ? "Today" : dayName(i)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>{x ? x.title : "Rest"}{x?.moved ? "  ·  moved" : ""}</Text>
              {x ? <Text style={s.muted}>{sessionTargets(x, x.goal ?? "", FITNESS)?.summary}</Text> : null}
            </View>
            <Text style={s.muted}>{dayTargets(x, goals).kcal.toLocaleString()} kcal</Text>
          </View>
        ))}
      </View>

      <View style={s.row}>
        <Stat label="HRV" value={SNAPSHOT.hrvMs} unit="ms" />
        <Stat label="RESTING HR" value={SNAPSHOT.restingHr} unit="bpm" />
        <Stat label="BODY BATTERY" value={SNAPSHOT.bodyBattery} />
      </View>
    </ScrollView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    page: { padding: 16, paddingTop: 24, paddingBottom: 120, gap: 14 },
    title: { fontSize: 28, fontWeight: "700", color: c.fg },
    h2: { fontSize: 18, fontWeight: "600", color: c.fg },
    body: { fontSize: 15, lineHeight: 21, color: c.fg },
    muted: { fontSize: 13, color: c.muted },
    label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, color: c.muted },
    row: { flexDirection: "row", gap: 12 },
    card: { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
    score: { flex: 1, backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 16, gap: 4 },
    scoreValue: { fontSize: 40, fontWeight: "600", color: c.fg },
    track: { height: 8, borderRadius: 4, backgroundColor: c.line, overflow: "hidden", marginTop: 8 },
    fill: { height: 8, borderRadius: 4 },
    stat: { flex: 1, backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
    statValue: { fontSize: 20, fontWeight: "500", color: c.fg, fontVariant: ["tabular-nums"] },
    fuelBox: { backgroundColor: c.bg, borderRadius: 12, padding: 12, gap: 6, marginTop: 6 },
    fuelRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    fuelNum: { fontSize: 17, fontWeight: "500", color: c.fg },
    weekRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    steps: { gap: 10, marginTop: 4 },
    stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    stepLabel: { fontSize: 14, fontWeight: "600", color: c.fg },
    stepTarget: { fontSize: 14, fontWeight: "600", color: c.accent, textAlign: "right", maxWidth: "45%", fontVariant: ["tabular-nums"] },
    weekDay: { width: 46, fontSize: 13, fontWeight: "600", color: c.muted },
  });
