// Baseline session targets: turns each planned session into exact, step-by-step targets
// (pace, heart rate, power, swim pace, weight and reps) from the user's current fitness.
// Pure functions only.
//
// Methods
// - Running paces: Daniels & Gilbert VDOT equations (oxygen cost of running and the share of
//   VO2max that can be held for a given race duration).
// - Heart-rate zones: percentages of lactate-threshold heart rate (Friel).
// - Cycling: percentages of functional threshold power (Coggan).
// - Swimming: critical swim speed (CSS) from a 400 m and 200 m time trial.
// - Strength: reps in reserve (RIR); loads from an estimated one-rep max (Epley).

import type { Session, SportId } from "./plan";

export interface Fitness {
  run?: { distanceM: number; timeS: number; source: string };   // a recent race, time trial or prediction
  lthr?: number;                                                  // lactate-threshold heart rate, bpm
  ftpW?: number;                                                  // cycling functional threshold power, W
  swimCssS?: number;                                              // critical swim speed, s per 100 m
  lifts?: Partial<Record<LiftId, number>>;                        // estimated one-rep max, kg
}

export type LiftId = "squat" | "deadlift" | "bench" | "press" | "row";

export interface Step {
  label: string;     // Warm-up, Main set, Recovery, Cool-down, or an exercise name
  detail: string;    // what to do
  target?: string;   // the number to hit
}

export interface SessionTargets {
  summary: string;   // one line for the week view
  steps: Step[];
  effort: string;    // how it should feel (RPE 1–10)
  distanceKm?: number;
  note?: string;     // what to add to make targets exact, if something is missing
}

/* ---------- Running: VDOT ---------- */

const vo2Cost = (vMperMin: number) => -4.6 + 0.182258 * vMperMin + 0.000104 * vMperMin ** 2;
const fractionSustainable = (tMin: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);

/** VDOT from a race or time trial. */
export function vdot(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  return vo2Cost(distanceM / t) / fractionSustainable(t);
}

/** Running speed (m/min) at a given share of VDOT. */
export function speedAt(fraction: number, v: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - fraction * v;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted race time (s) for a distance at a given VDOT. */
export function predictTime(distanceM: number, v: number): number {
  let lo = 60, hi = 60 * 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distanceM, mid) > v) lo = mid; else hi = mid;
  }
  return lo;
}

export interface RunPaces {
  vdot: number;
  easy: [number, number];   // s per km, slow then fast
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
  race: Record<"5k" | "10k" | "half" | "marathon", number>;   // predicted race times, s
}

const secPerKm = (vMperMin: number) => 60000 / vMperMin;

export function runPaces(distanceM: number, timeS: number): RunPaces {
  const v = vdot(distanceM, timeS);
  const race = {
    "5k": predictTime(5000, v), "10k": predictTime(10000, v),
    half: predictTime(21097.5, v), marathon: predictTime(42195, v),
  };
  return {
    vdot: v,
    easy: [secPerKm(speedAt(0.62, v)), secPerKm(speedAt(0.7, v))],
    marathon: race.marathon / 42.195,
    threshold: secPerKm(speedAt(0.88, v)),
    interval: secPerKm(speedAt(0.975, v)),
    repetition: secPerKm(speedAt(1.05, v)),
    race,
  };
}

/* ---------- Heart rate, power, swim ---------- */

/** Running heart-rate zones as % of lactate-threshold HR (Friel). */
export function hrZones(lthr: number) {
  const r = (p: number) => Math.round(lthr * p);
  return { z1Max: r(0.84), z2: [r(0.85), r(0.89)], z3: [r(0.9), r(0.94)], z4: [r(0.95), r(0.99)], z5: [r(1.0), r(1.06)] } as const;
}

/** Cycling power zones as % of FTP (Coggan). */
export function powerZones(ftp: number) {
  const r = (p: number) => Math.round(ftp * p);
  return { recovery: r(0.55), endurance: [r(0.56), r(0.75)], tempo: [r(0.76), r(0.9)], threshold: [r(0.95), r(1.05)], vo2: [r(1.06), r(1.2)] } as const;
}

/** Critical swim speed (s per 100 m) from a 400 m and a 200 m time trial. */
export function cssFromTrials(t400S: number, t200S: number): number {
  return (t400S - t200S) / 2;
}

/** Estimated one-rep max (Epley) from a weight lifted for a number of reps. */
export function oneRepMax(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Load for a number of reps leaving `rir` in reserve, rounded to 2.5 kg. */
export function loadFor(oneRm: number, reps: number, rir: number): number {
  return Math.round(oneRm / (1 + (reps + rir) / 30) / 2.5) * 2.5;
}

/* ---------- Formatting ---------- */

export const fmtPace = (sPerKm: number) => `${Math.floor(sPerKm / 60)}:${String(Math.round(sPerKm % 60)).padStart(2, "0")}`.replace(/:60$/, ":59");
export function fmtTime(s: number): string {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}
const paceRange = (a: number, b: number) => `${fmtPace(b)}–${fmtPace(a)} /km`;
const km = (minutes: number, sPerKm: number) => (minutes * 60) / sPerKm;

/* ---------- Session targets ---------- */

export function sessionTargets(s: Session | null, goalTarget: string, fit: Fitness): SessionTargets | null {
  if (!s || !s.sport || s.kind === "rest") return null;
  const key = s.key ?? s.kind;
  switch (s.sport as SportId) {
    case "run": return runTargets(s, key, goalTarget, fit);
    case "ride": return rideTargets(s, key, fit);
    case "swim": return swimTargets(s, key, fit);
    case "strength": return strengthTargets(s, key, goalTarget, fit);
    default: return fitnessTargets(s, key);
  }
}

function runTargets(s: Session, key: string, goal: string, fit: Fitness): SessionTargets {
  const hr = fit.lthr ? hrZones(fit.lthr) : null;
  const easyHr = hr ? `HR under ${hr.z2[1]}` : "conversational";
  if (!fit.run) {
    return {
      summary: `${s.title}, ${s.minutes} min by feel`,
      steps: [{ label: "Main set", detail: s.detail, target: hr ? easyHr : "RPE from the effort line" }],
      effort: s.kind === "hard" ? "RPE 8 on the hard parts" : "RPE 3–4, able to talk in full sentences",
      note: "Add a recent 5 km time or time trial on the Goals screen to get exact paces.",
    };
  }
  const p = runPaces(fit.run.distanceM, fit.run.timeS);
  const easy = paceRange(p.easy[0], p.easy[1]);
  const easyMid = (p.easy[0] + p.easy[1]) / 2;
  const warm: Step = { label: "Warm-up", detail: "15 min easy, then 4 × 20 s strides with 40 s walk", target: easy };
  const cool: Step = { label: "Cool-down", detail: "10 min easy", target: easy };

  if (key === "easy" || key === "light") {
    return {
      summary: `${s.minutes} min easy at ${easy}`,
      steps: [{ label: "Main set", detail: `${s.minutes} min continuous`, target: `${easy}${hr ? ` · ${easyHr}` : ""}` }],
      effort: "RPE 3–4, able to talk in full sentences",
      distanceKm: km(s.minutes, easyMid),
    };
  }
  if (key === "long") {
    return {
      summary: `${s.minutes} min long run at ${easy}`,
      steps: [{ label: "Main set", detail: `${s.minutes} min continuous, start at the slow end`, target: `${easy}${hr ? ` · ${easyHr}` : ""}` }],
      effort: "RPE 4, comfortable all the way",
      distanceKm: km(s.minutes, easyMid),
    };
  }
  if (key === "tempo") {
    return {
      summary: `20 min at ${fmtPace(p.threshold)} /km`,
      steps: [warm, { label: "Main set", detail: "20 min continuous at threshold", target: `${fmtPace(p.threshold)} /km${hr ? ` · HR ${hr.z4[0]}–${hr.z4[1]}` : ""}` }, cool],
      effort: "RPE 7, comfortably hard, a few words at a time",
      distanceKm: km(25, easyMid) + (20 * 60) / p.threshold,
    };
  }
  // Intervals, specific to the race goal
  const plans: Record<string, { reps: number; distM: number; pace: number; paceName: string; rest: string }> = {
    "5k": { reps: 6, distM: 800, pace: p.interval, paceName: "interval pace", rest: "2 min easy jog" },
    "10k": { reps: 6, distM: 1000, pace: p.race["10k"] / 10, paceName: "10 km race pace", rest: "90 s easy jog" },
    half: { reps: 5, distM: 1000, pace: p.race["10k"] / 10, paceName: "10 km race pace", rest: "90 s easy jog" },
    marathon: { reps: 3, distM: 3000, pace: p.marathon, paceName: "marathon pace", rest: "2 min easy jog" },
    general: { reps: 8, distM: 0, pace: p.interval, paceName: "interval pace", rest: "1 min walk or jog" },
  };
  const iv = plans[goal] ?? plans.general;
  const repLabel = iv.distM ? `${iv.reps} × ${iv.distM >= 1000 ? `${iv.distM / 1000} km` : `${iv.distM} m`}` : `${iv.reps} × 1 min`;
  const repTime = iv.distM ? ` (${fmtTime((iv.distM / 1000) * iv.pace)} each)` : "";
  return {
    summary: `${repLabel} at ${fmtPace(iv.pace)} /km`,
    steps: [
      warm,
      { label: "Main set", detail: `${repLabel} at ${iv.paceName}${repTime}`, target: `${fmtPace(iv.pace)} /km${hr ? ` · HR up to ${hr.z5[0]}` : ""}` },
      { label: "Recovery", detail: `${iv.rest} between reps`, target: easy },
      cool,
    ],
    effort: "RPE 8 on the reps, controlled not all-out",
    distanceKm: km(25, easyMid) + (iv.reps * (iv.distM || 250)) / 1000 + iv.reps * 0.2,
  };
}

function rideTargets(s: Session, key: string, fit: Fitness): SessionTargets {
  if (!fit.ftpW) {
    return {
      summary: `${s.title}, ${s.minutes} min by feel`,
      steps: [{ label: "Main set", detail: s.detail }],
      effort: key === "easy" || key === "long" || key === "light" ? "RPE 3–4" : "RPE 7–8 on the efforts",
      note: "Add your FTP on the Goals screen to get exact power targets.",
    };
  }
  const z = powerZones(fit.ftpW);
  const w = (r: readonly number[]) => `${r[0]}–${r[1]} W`;
  const warm: Step = { label: "Warm-up", detail: "10 min building to endurance, then 3 × 1 min high cadence", target: w(z.endurance) };
  const cool: Step = { label: "Cool-down", detail: "10 min easy spin", target: `under ${z.recovery} W` };
  if (key === "light") return { summary: `40 min easy under ${z.recovery} W`, steps: [{ label: "Main set", detail: "40 min easy spin", target: `under ${z.recovery} W` }], effort: "RPE 2–3" };
  if (key === "easy" || key === "long") {
    return { summary: `${s.minutes} min at ${w(z.endurance)}`, steps: [{ label: "Main set", detail: `${s.minutes} min steady`, target: `${w(z.endurance)} · cadence 85–95 rpm` }], effort: "RPE 3–4, able to talk" };
  }
  if (key === "vo2") {
    return { summary: `5 × 4 min at ${w(z.vo2)}`, steps: [warm, { label: "Main set", detail: "5 × 4 min", target: w(z.vo2) }, { label: "Recovery", detail: "4 min easy between efforts", target: `under ${z.recovery} W` }, cool], effort: "RPE 9 by the end of each effort" };
  }
  return { summary: `4 × 8 min at ${w(z.threshold)}`, steps: [warm, { label: "Main set", detail: "4 × 8 min at threshold", target: w(z.threshold) }, { label: "Recovery", detail: "4 min easy between efforts", target: `under ${z.recovery} W` }, cool], effort: "RPE 7–8, hard but steady" };
}

function swimTargets(s: Session, key: string, fit: Fitness): SessionTargets {
  const css = fit.swimCssS;
  const p = (sec: number) => `${fmtPace(sec)} /100 m`;
  if (!css) {
    return {
      summary: `${s.title}, by feel`,
      steps: [{ label: "Main set", detail: s.detail }],
      effort: key === "hard" ? "RPE 7–8" : "RPE 3–5",
      note: "Do a CSS test (400 m then 200 m time trial, 10 min rest) and add the times on the Goals screen.",
    };
  }
  const warm: Step = { label: "Warm-up", detail: "300 m easy, 4 × 50 m drill", target: p(css + 15) };
  const cool: Step = { label: "Cool-down", detail: "200 m easy", target: p(css + 15) };
  if (key === "hard") return { summary: `10 × 100 m at ${p(css)}`, steps: [warm, { label: "Main set", detail: "10 × 100 m, 15 s rest", target: p(css) }, cool], effort: "RPE 7, sustainable for all 10", distanceKm: 1.7 };
  if (key === "long") return { summary: `Continuous swim at ${p(css + 6)}`, steps: [warm, { label: "Main set", detail: "1500 m continuous", target: p(css + 6) }, cool], effort: "RPE 5, steady", distanceKm: 2.2 };
  return { summary: `Technique swim at ${p(css + 12)}`, steps: [warm, { label: "Main set", detail: "8 × 100 m: 50 m drill, 50 m swim, 20 s rest", target: p(css + 12) }, cool], effort: "RPE 3–4, focus on form", distanceKm: 1.3 };
}

type LiftPlan = { name: string; lift?: LiftId; sets: number; reps: number; repsTop?: number; note?: string };
const STRENGTH: Record<string, Record<"lower" | "upper" | "full", LiftPlan[]>> = {
  muscle: {
    lower: [{ name: "Back squat", lift: "squat", sets: 4, reps: 8, repsTop: 12 }, { name: "Romanian deadlift", lift: "deadlift", sets: 3, reps: 8, repsTop: 12 }, { name: "Walking lunge", sets: 3, reps: 10, repsTop: 12, note: "each leg" }],
    upper: [{ name: "Bench press", lift: "bench", sets: 4, reps: 8, repsTop: 12 }, { name: "Barbell row", lift: "row", sets: 4, reps: 8, repsTop: 12 }, { name: "Overhead press", lift: "press", sets: 3, reps: 8, repsTop: 12 }, { name: "Pull-up", sets: 3, reps: 6, repsTop: 10 }],
    full: [{ name: "Back squat", lift: "squat", sets: 3, reps: 8, repsTop: 12 }, { name: "Bench press", lift: "bench", sets: 3, reps: 8, repsTop: 12 }, { name: "Barbell row", lift: "row", sets: 3, reps: 8, repsTop: 12 }, { name: "Romanian deadlift", lift: "deadlift", sets: 3, reps: 8, repsTop: 12 }, { name: "Overhead press", lift: "press", sets: 2, reps: 8, repsTop: 12 }],
  },
  strong: {
    lower: [{ name: "Back squat", lift: "squat", sets: 5, reps: 5 }, { name: "Deadlift", lift: "deadlift", sets: 3, reps: 3 }, { name: "Split squat", sets: 3, reps: 8, note: "each leg" }],
    upper: [{ name: "Bench press", lift: "bench", sets: 5, reps: 5 }, { name: "Overhead press", lift: "press", sets: 5, reps: 5 }, { name: "Barbell row", lift: "row", sets: 4, reps: 6 }],
    full: [{ name: "Back squat", lift: "squat", sets: 5, reps: 5 }, { name: "Bench press", lift: "bench", sets: 5, reps: 5 }, { name: "Barbell row", lift: "row", sets: 5, reps: 5 }],
  },
  general: {
    lower: [{ name: "Goblet squat", sets: 3, reps: 10, repsTop: 12 }, { name: "Split squat", sets: 3, reps: 8, repsTop: 10, note: "each leg" }, { name: "Plank", sets: 3, reps: 40, note: "seconds" }],
    upper: [{ name: "Push-up", sets: 3, reps: 8, repsTop: 15 }, { name: "Dumbbell row", sets: 3, reps: 10, repsTop: 12, note: "each arm" }, { name: "Dumbbell shoulder press", sets: 3, reps: 10, repsTop: 12 }],
    full: [{ name: "Goblet squat", sets: 3, reps: 10, repsTop: 12 }, { name: "Push-up", sets: 3, reps: 8, repsTop: 15 }, { name: "Dumbbell row", sets: 3, reps: 10, repsTop: 12, note: "each arm" }, { name: "Farmer carry", sets: 3, reps: 40, note: "metres" }],
  },
};

function strengthTargets(s: Session, key: string, goal: string, fit: Fitness): SessionTargets {
  if (key === "light") {
    return { summary: "20 min mobility and core", steps: [{ label: "Main set", detail: "Hip and ankle mobility, dead bug, side plank, 2 rounds" }], effort: "RPE 2–3" };
  }
  const g = STRENGTH[goal] ?? STRENGTH.general;
  const plan = g[(["lower", "upper", "full"].includes(key) ? key : "full") as "lower" | "upper" | "full"];
  const rir = goal === "strong" ? 2 : goal === "muscle" ? 2 : 3;
  const rest = goal === "strong" ? "3 min" : goal === "muscle" ? "90–120 s" : "60–90 s";
  const lighter = /lighter/.test(s.detail) ? 0.8 : 1;
  const rirToday = lighter < 1 ? rir + 2 : rir;
  let missing = false;
  const steps: Step[] = [{ label: "Warm-up", detail: "5 min easy cardio, then 2 light sets of the first lift" }];
  for (const l of plan) {
    const repText = l.repsTop ? `${l.reps}–${l.repsTop}` : `${l.reps}`;
    const unit = l.note === "seconds" ? " s" : l.note === "metres" ? " m" : "";
    const each = l.note && unit === "" ? ` ${l.note}` : "";
    const orm = l.lift ? fit.lifts?.[l.lift] : undefined;
    let target: string;
    if (orm) target = `${Math.round(loadFor(orm, l.reps, rir) * lighter / 2.5) * 2.5} kg`;
    else if (l.lift) { missing = true; target = `a weight you could lift ${rirToday} more times`; }
    else target = unit ? `${repText}${unit}` : `leave ${rirToday} reps in reserve`;
    steps.push({ label: l.name, detail: `${l.sets} × ${repText}${unit}${each}, rest ${rest}`, target });
  }
  return {
    summary: `${plan.length} exercises, ${goal === "strong" ? "heavy sets of 3–5" : "sets of 8–12"}${lighter < 1 ? ", lighter today" : ""}`,
    steps,
    effort: `RPE ${10 - rirToday} on the last set, ${rirToday} reps left in the tank`,
    note: missing ? "Add a weight you've lifted for 5 reps for each main lift on the Goals screen to get exact kilograms." : `When every set reaches the top of the rep range, add 2.5 kg (upper body) or 5 kg (lower body) next time.`,
  };
}

function fitnessTargets(s: Session, key: string): SessionTargets {
  if (key === "hard") return { summary: `${s.minutes} min circuit, 40 s work / 20 s rest`, steps: [{ label: "Warm-up", detail: "5 min easy" }, { label: "Main set", detail: "8 exercises × 40 s work, 20 s rest, 3 rounds", target: "RPE 7–8" }, { label: "Cool-down", detail: "5 min walk and stretch" }], effort: "RPE 7–8, breathing hard" };
  return { summary: `${s.minutes} min brisk walk, bike or cross-trainer`, steps: [{ label: "Main set", detail: `${s.minutes} min steady`, target: "RPE 4, able to talk" }], effort: "RPE 3–4" };
}
