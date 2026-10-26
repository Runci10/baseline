// Baseline training plan engine: turns the user's goals into a week of sessions,
// then adjusts the week each morning for recovery. Pure functions only.

export type SportId = "run" | "ride" | "swim" | "strength" | "fitness";
export type SessionKind = "easy" | "hard" | "long" | "lower" | "upper" | "full" | "rest";
export type NoteKind = "good" | "info" | "warn" | "bad";
export type Note = { kind: NoteKind; text: string };

export interface SportGoal {
  id: SportId;
  target: string;     // key from SPORTS[id].targets
  date?: string;      // optional event date, YYYY-MM-DD
}

export interface Profile {
  sex: "m" | "f";
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;   // 1.3 mostly sitting, 1.45 on feet a lot, 1.6 physical work
}

export interface Goals {
  sports: SportGoal[];                    // ranked, first = main goal (max 4)
  aim: "lose" | "maintain" | "gain";
  rateKgPerWeek: number;                  // 0.25, 0.5 or 0.75
  targetWeightKg: number;
  days: number[];                         // training days, 0 = Monday … 6 = Sunday
  longDays: number[];                     // preferred days for long sessions
  minutes: number;                        // usual session length
  level: "beginner" | "intermediate" | "advanced";
  profile: Profile;
}

export interface Session {
  sport: SportId | null;
  title: string;
  detail: string;
  kind: SessionKind;
  zone: number;       // 0–4 intensity
  minutes: number;
  met: number;        // energy cost, used by the nutrition engine
  priority?: number;
  light?: Session;    // easier version used when readiness is low
  moved?: boolean;
  swappedIn?: boolean;
  replaced?: string;
}

export type Week = (Session | null)[];  // 7 days, Monday first

export interface WeekInputs {
  readiness: number;     // 0–100
  sleepAvg7: number;     // hours
  loadRatio: number;     // acute ÷ chronic
  today: string;         // YYYY-MM-DD, the Monday this week starts on
}

export interface WeekResult {
  week: Week;
  notes: Note[];
  counts: number[];      // sessions per goal
  volumeScale: number;
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SPORTS: Record<SportId, { name: string; targets: Record<string, string> }> = {
  run: { name: "Running", targets: { "5k": "5 km race", "10k": "10 km race", half: "Half marathon", marathon: "Marathon", general: "Run fitter" } },
  ride: { name: "Cycling", targets: { ftp: "Raise FTP", fondo: "Long ride or gran fondo", general: "Ride fitter" } },
  swim: { name: "Swimming", targets: { "1500": "1.5 km swim", tri: "Triathlon swim", general: "Swim fitter" } },
  strength: { name: "Strength", targets: { muscle: "Build muscle", strong: "Get stronger", general: "General strength" } },
  fitness: { name: "General fitness", targets: { general: "Feel fitter" } },
};

export const EVENT_TARGETS = ["5k", "10k", "half", "marathon", "fondo", "1500", "tri"];

type Library = { order: string[][]; light: Session } & Record<string, Session | string[][]>;

/** Session types for one sport, and which to use for 1–5 sessions a week. */
export function library(sport: SportId, target: string, minutes: number): Library {
  const S = (title: string, detail: string, kind: SessionKind, zone: number, mins: number, met: number): Session =>
    ({ sport, title, detail, kind, zone, minutes: mins, met });
  if (sport === "run") {
    const long = ({ "5k": 50, "10k": 65, half: 90, marathon: 120, general: 50 } as Record<string, number>)[target] ?? 60;
    const intervals = ({
      "5k": "6 × 800 m at 5 km pace, 2 min jog", "10k": "6 × 1 km at 10 km pace, 90 s jog",
      half: "5 × 1 km at 10 km pace, 90 s jog", marathon: "3 × 3 km at marathon pace", general: "8 × 1 min hard, 1 min easy",
    } as Record<string, string>)[target] ?? "8 × 1 min hard, 1 min easy";
    const e = Math.min(minutes, 45);
    return {
      easy: S("Easy run", `${e} min, zone 2`, "easy", 2, e, 9),
      hard: S("Intervals", intervals, "hard", 4, Math.min(minutes, 50), 11),
      tempo: S("Tempo run", "20 min at threshold within 45 min", "hard", 3, 45, 10),
      long: S("Long run", `${long} min easy, conversational`, "long", 2, long, 9),
      light: S("Easy run", "25 min, zone 2 only", "easy", 2, 25, 9),
      order: [["long"], ["hard", "long"], ["easy", "hard", "long"], ["easy", "hard", "tempo", "long"], ["easy", "hard", "easy", "tempo", "long"]],
    };
  }
  if (sport === "ride") {
    const long = target === "fondo" ? 150 : 90;
    return {
      easy: S("Endurance ride", `${minutes} min, zone 2`, "easy", 2, minutes, 6.5),
      hard: S("Threshold ride", target === "ftp" ? "4 × 8 min at 95–105% of FTP" : "3 × 10 min at threshold", "hard", 3, minutes, 9),
      vo2: S("VO₂ intervals", "5 × 4 min hard, 4 min easy", "hard", 4, minutes, 10),
      long: S("Long ride", `${long} min, mostly zone 2`, "long", 2, long, 7),
      light: S("Easy spin", "40 min, zone 1–2", "easy", 1, 40, 5.5),
      order: [["hard"], ["hard", "long"], ["easy", "hard", "long"], ["easy", "hard", "vo2", "long"], ["easy", "hard", "easy", "vo2", "long"]],
    };
  }
  if (sport === "swim") {
    const m = Math.min(minutes, 50);
    return {
      easy: S("Technique swim", "Drills and easy laps, about 2 km", "easy", 2, m, 6),
      hard: S("CSS swim", "10 × 100 m at threshold pace, 15 s rest", "hard", 3, m, 8),
      long: S("Endurance swim", target === "tri" ? "Continuous 2 km, open water if you can" : "Continuous 2.5–3 km", "easy", 2, Math.min(minutes, 60), 7),
      light: S("Easy swim", "30 min, relaxed", "easy", 1, 30, 5),
      order: [["hard"], ["easy", "hard"], ["easy", "hard", "long"], ["easy", "hard", "easy", "long"], ["easy", "hard", "easy", "hard", "long"]],
    };
  }
  if (sport === "strength") {
    const T = ({
      muscle: { lower: "Squat, Romanian deadlift, lunge · 4 × 8–12", upper: "Bench, row, overhead press, pull-up · 4 × 8–12", full: "5 lifts · 3 × 10" },
      strong: { lower: "Squat 5 × 5, deadlift 3 × 3, accessories", upper: "Bench 5 × 5, overhead press 5 × 5, rows", full: "Squat, bench, row · 5 × 5" },
      general: { lower: "Goblet squat, split squat, plank", upper: "Push-ups, rows, presses", full: "Squat, push-up, row, carry · 3 rounds" },
    } as Record<string, { lower: string; upper: string; full: string }>)[target] ?? { lower: "Lower body", upper: "Upper body", full: "Full body" };
    return {
      lower: S("Lower body", T.lower, "lower", 1, minutes, 5),
      upper: S("Upper body", T.upper, "upper", 1, minutes, 5),
      full: S("Full body", T.full, "full", 1, minutes, 5),
      light: S("Mobility and core", "20 min, easy", "easy", 0, 20, 3),
      order: target === "general"
        ? [["full"], ["full", "full"], ["full", "upper", "full"], ["lower", "upper", "full", "upper"], ["lower", "upper", "full", "lower", "upper"]]
        : [["full"], ["lower", "upper"], ["lower", "upper", "full"], ["lower", "upper", "lower", "upper"], ["lower", "upper", "full", "lower", "upper"]],
    };
  }
  return {
    hard: S("Circuit or HIIT class", `${minutes} min mixed effort`, "hard", 3, minutes, 8),
    easy: S("Easy cardio", `${minutes} min brisk walk, bike or cross-trainer`, "easy", 1, minutes, 4.5),
    light: S("Walk", "30 min easy", "easy", 1, 30, 3.5),
    order: [["hard"], ["hard", "easy"], ["hard", "easy", "hard"], ["hard", "easy", "hard", "easy"], ["hard", "easy", "hard", "easy", "easy"]],
  };
}

export const isHeavy = (s: Session | null | undefined): boolean => !!s && ["hard", "long", "lower"].includes(s.kind);

/** Clash score for putting session s on day d: hard days back to back, long days, same sport twice in a row. */
function costAt(week: Week, s: Session, d: number, longDays: number[]): number {
  let c = d * 0.01;
  const nb = [d - 1, d + 1].filter(x => x >= 0 && x < 7).map(x => week[x]).filter((x): x is Session => !!x);
  if (s.kind === "long") c += longDays.includes(d) ? 0 : 5;
  if (isHeavy(s)) c += nb.filter(isHeavy).length * 4 + nb.filter(x => x.kind === "full").length * 2;
  if (s.kind === "full") c += nb.filter(isHeavy).length * 2;
  if (nb.some(x => x.sport === s.sport)) c += isHeavy(s) && nb.some(x => x.sport === s.sport && isHeavy(x)) ? 3 : 1;
  return c;
}

function weekCost(week: Week, longDays: number[]): number {
  return week.reduce((t, s, d) => {
    if (!s) return t;
    week[d] = null;
    const c = costAt(week, s, d, longDays) - d * 0.01;
    week[d] = s;
    return t + c;
  }, 0);
}

/** Swap sessions between days (from `from` onward) while the total clash score drops. */
function improve(week: Week, days: number[], from: number, longDays: number[]): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const i of days) {
      if (i < from) continue;
      for (const j of days) {
        if (j <= i) continue;
        const before = weekCost(week, longDays);
        [week[i], week[j]] = [week[j], week[i]];
        if (weekCost(week, longDays) < before - 0.5) changed = true;
        else [week[i], week[j]] = [week[j], week[i]];
      }
    }
    if (!changed) break;
  }
}

export function phaseFor(weeksToEvent: number): "base" | "build" | "peak" | "taper" {
  return weeksToEvent > 12 ? "base" : weeksToEvent > 4 ? "build" : weeksToEvent > 1 ? "peak" : "taper";
}

export function buildWeek(g: Goals, input: WeekInputs): WeekResult {
  const notes: Note[] = [];
  const avail = [...g.days].sort((a, b) => a - b);
  const n = avail.length;
  const sp = g.sports.slice(0, 4);

  // 1. Share training days between goals by priority.
  const W = [3, 2, 1.5, 1].slice(0, sp.length);
  const sum = W.reduce((a, b) => a + b, 0);
  const counts = W.map(w => Math.min(5, Math.max(1, Math.round((n * w) / sum))));
  const total = () => counts.reduce((a, b) => a + b, 0);
  while (total() > n) {
    let i = -1;
    for (let k = counts.length - 1; k >= 0; k--) if (counts[k] > 1) { i = k; break; }
    if (i < 0) {
      i = counts.length - 1;
      while (i > 0 && counts[i] === 0) i--;
      counts[i] = 0;
      notes.push({ kind: "warn", text: `Not enough training days for ${SPORTS[sp[i].id].name.toLowerCase()} this week. Add a day or drop a goal.` });
    } else counts[i]--;
  }
  for (let k = 0; total() < n && k < 20; k++) {
    const i = counts.findIndex(c => c < 5);
    if (i < 0) break;
    counts[i]++;
  }

  // 2. Each sport supplies its sessions.
  const sessions: Session[] = [];
  sp.forEach((x, i) => {
    if (!counts[i]) return;
    const L = library(x.id, x.target, g.minutes);
    L.order[counts[i] - 1].forEach(key => sessions.push({ ...(L[key] as Session), priority: i, light: L.light }));
  });

  // 3. Place sessions: long first, then hard, then strength, then easy.
  const rank: Record<SessionKind, number> = { long: 0, hard: 1, lower: 2, full: 3, upper: 4, easy: 5, rest: 6 };
  sessions.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.priority ?? 0) - (b.priority ?? 0));
  const week: Week = Array(7).fill(null);
  const longDays = g.longDays.filter(d => avail.includes(d));
  for (const s of sessions) {
    const free = avail.filter(d => !week[d]);
    if (!free.length) break;
    const d = free.reduce((best, d) => (costAt(week, s, d, longDays) < costAt(week, s, best, longDays) ? d : best));
    week[d] = s;
  }
  improve(week, avail, 0, longDays);

  // 4. Recovery adjustments.
  const { readiness, sleepAvg7, loadRatio } = input;
  let scale = 1;
  if (readiness < 34) { scale = 0.7; notes.push({ kind: "bad", text: "Readiness is very low, so today is a rest day and volume drops 30% this week." }); }
  else if (readiness < 67) { scale = 0.85; notes.push({ kind: "warn", text: `Readiness is ${readiness}. Volume is trimmed 15% and hard sessions move off the next two days.` }); }
  if (sleepAvg7 < 6) notes.push({ kind: "warn", text: `You've averaged ${sleepAvg7.toFixed(1)} h of sleep this week, so the first two days stay easy.` });
  if (loadRatio < 0.8 && readiness >= 67 && sleepAvg7 >= 6) { scale = 1.1; notes.push({ kind: "info", text: "Recent load is below your fitness level, so endurance volume rises 10%." }); }

  const protect = readiness < 67 || sleepAvg7 < 6 ? 2 : 0;
  for (let d = 0; d < protect; d++) {
    const s = week[d];
    if (!s || !isHeavy(s)) continue;
    week[d] = null;
    let best = -1, bestCost = Infinity;
    for (let j = protect; j < 7; j++) {
      const o = week[j];
      if (!o || isHeavy(o)) continue;
      week[j] = null;
      const c = costAt(week, s, j, longDays);
      week[j] = o;
      if (c < bestCost) { bestCost = c; best = j; }
    }
    if (best > -1) {
      const o = week[best] as Session;
      week[best] = { ...s, moved: true };
      week[d] = ["lower", "upper", "full"].includes(o.kind)
        ? { ...o, detail: `${o.detail} · lighter, about 80% of usual weights`, swappedIn: true }
        : { ...o, swappedIn: true };
    } else if (s.light) {
      week[d] = { ...s.light, replaced: s.title };
    }
  }
  improve(week, avail, protect, longDays);
  if (readiness < 34 && week[0]) week[0] = { sport: null, title: "Rest", detail: "Walk or mobility only", kind: "rest", zone: 0, minutes: 0, met: 1, replaced: week[0].title };

  week.forEach((s, i) => {
    if (s && scale !== 1 && (s.kind === "easy" || s.kind === "long") && s.sport !== "strength" && /^\d+ min/.test(s.detail)) {
      const m = Math.round((s.minutes * scale) / 5) * 5;
      week[i] = { ...s, minutes: m, detail: s.detail.replace(/^\d+ min/, `${m} min`) };
    }
  });

  return { week, notes: notes.concat(coachNotes(g, counts, input.today)), counts, volumeScale: scale };
}

/** Plain-language checks for goals that pull against each other. */
export function coachNotes(g: Goals, counts: number[] | null, today: string): Note[] {
  const out: Note[] = [];
  const event = g.sports.find(x => ["half", "marathon", "fondo", "tri"].includes(x.target));
  const strIndex = g.sports.findIndex(x => x.id === "strength");
  const strOn = strIndex > -1 && (!counts || counts[strIndex] > 0);
  const endurance = g.sports.some(x => ["run", "ride", "swim"].includes(x.id));

  if (g.aim === "lose" && event)
    out.push({ kind: "warn", text: `Losing weight while building for a ${SPORTS[event.id].targets[event.target].toLowerCase()} works best with a small deficit (0.25 kg a week) and full fuelling on long and hard days.` });
  if (g.aim === "lose" && g.rateKgPerWeek >= 0.75)
    out.push({ kind: "warn", text: "0.75 kg a week is fast. Hard sessions will feel worse and you risk losing muscle; 0.5 kg or less is easier to sustain." });
  if (g.aim === "gain" && strIndex < 0)
    out.push({ kind: "info", text: "Gaining weight without strength training adds mostly fat. Add a strength goal to direct it toward muscle." });
  if (strOn && endurance)
    out.push({ kind: "info", text: "Hard endurance sessions and heavy leg days are kept on separate days so each gets your best effort." });
  if (g.aim !== "maintain" && Math.abs(g.targetWeightKg - g.profile.weightKg) >= 0.5) {
    const weeks = Math.abs(g.targetWeightKg - g.profile.weightKg) / g.rateKgPerWeek;
    const when = new Date(Date.parse(today) + Math.round(weeks * 7) * 864e5);
    out.push({ kind: "info", text: `At ${g.rateKgPerWeek} kg a week you'd reach ${g.targetWeightKg} kg around ${when.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}.` });
  }
  for (const x of g.sports) {
    if (!x.date) continue;
    const weeks = Math.round((Date.parse(x.date) - Date.parse(today)) / 6048e5);
    if (weeks > 0) out.push({ kind: "info", text: `${SPORTS[x.id].name}: ${weeks} weeks to your event, currently in the ${phaseFor(weeks)} phase.` });
  }
  if (g.level === "beginner")
    out.push({ kind: "info", text: "As a beginner, start interval sessions with about half the listed reps and build up over 3–4 weeks." });
  return out;
}

/** Readiness rule used each morning, for display. */
export function readinessRule(readiness: number, sleepAvg7: number): Note {
  if (readiness < 34) return { kind: "bad", text: "Rest today; volume down 30% this week." };
  if (readiness < 67 || sleepAvg7 < 6) return { kind: "warn", text: "Keep the next two days easy; hard sessions move later." };
  return { kind: "good", text: "Train as planned." };
}
