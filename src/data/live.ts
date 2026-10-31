// Live data for the app: reads src/data/garmin.json (written by scripts/sync_garmin.py from the
// garmin-dashboard pull) and works out Baseline's own scores from it. Falls back to the
// hand-copied snapshot when the file has no data yet.

import raw from "./garmin.json";
import { SNAPSHOT as FALLBACK, FITNESS as FITNESS_SETTINGS, DEFAULT_GOALS } from "./snapshot";
import { recoveryScore, loadRatio, strainScore, type NightInputs, type RecoveryResult } from "@/engine/scoring";
import type { Fitness } from "@/engine/targets";

interface Night {
  date: string; hours: number; deepMin: number; lightMin: number; remMin: number; awakeMin: number;
  score: number | null; respRate: number | null; hrvMs: number | null; hrvWeeklyMs: number | null;
  hrvRange: [number, number] | null; restingHr: number | null;
}
interface Day { date: string; steps: number | null; restingHr: number | null; stressAvg: number | null; bodyBatteryHigh: number | null; bodyBatteryNow: number | null }
interface Workout { date: string; sport: string; type: string; name: string; km: number; minutes: number; avgHr: number | null; maxHr: number | null; load: number | null }
interface GarminFile {
  generated: string | null; latestNight?: string; nights?: Night[]; days?: Day[]; workouts?: Workout[];
  weights?: { date: string; kg: number }[]; zones?: { lthr?: number; maxHr?: number; restingHr?: number };
}

const g = raw as unknown as GarminFile;

export interface TodayData {
  source: "garmin" | "snapshot";
  date: string;
  syncedLabel: string;
  readiness: number;
  recovery: RecoveryResult | null;      // Baseline's own score and what drove it (null on the snapshot)
  hrvMs: number;
  hrvWeeklyMs: number;
  hrvRange: readonly [number, number];
  restingHr: number;
  bodyBattery: number;
  loadRatio: number;
  strainYesterday: number | null;
  lastNight: { hours: number; score: number };
  sleepHours: number[];                 // last 7 nights, oldest first
  lastWorkout: { date: string; title: string; km: number; minutes: number; avgHr: number } | null;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function fromGarmin(f: GarminFile): TodayData | null {
  const nights = (f.nights ?? []).filter(n => n.hours > 0);
  if (!f.generated || nights.length < 2) return null;
  const last = nights[nights.length - 1];
  const days = f.days ?? [];
  const day = (d: string) => days.find(x => x.date === d);
  const rhrOf = (n: Night) => n.restingHr ?? day(n.date)?.restingHr ?? null;

  // Recovery: last night against up to 30 previous nights that have HRV and resting HR
  const toInputs = (n: Night): NightInputs | null => {
    const rhr = rhrOf(n);
    return n.hrvMs && rhr ? { hrvMs: n.hrvMs, restingHr: rhr, sleepHours: n.hours, respRate: n.respRate ?? undefined } : null;
  };
  const todayIn = toInputs(last);
  const history = nights.slice(0, -1).map(toInputs).filter((x): x is NightInputs => !!x);
  const recovery = todayIn ? recoveryScore(todayIn, history) : null;

  // Training load: daily Garmin load for the last 42 days, oldest first
  const workouts = f.workouts ?? [];
  const loads: number[] = [];
  for (let i = 41; i >= 0; i--) {
    const d = addDays(last.date, -i);
    loads.push(workouts.filter(w => w.date === d).reduce((t, w) => t + (w.load ?? 0), 0));
  }
  const ratio = loadRatio(loads).ratio;

  // Strain yesterday
  const y = addDays(last.date, -1);
  const rest = rhrOf(last) ?? f.zones?.restingHr ?? 50;
  const maxHr = f.zones?.maxHr ?? 190;
  const yWorkouts = workouts.filter(w => w.date === y && w.avgHr).map(w => ({ minutes: w.minutes, avgHr: w.avgHr as number }));
  const strainYesterday = day(y) ? strainScore(yWorkouts, day(y)?.steps ?? 0, rest, maxHr) : null;

  const lw = [...workouts].reverse().find(w => w.sport !== "other");
  const gen = new Date(f.generated);
  return {
    source: "garmin",
    date: last.date,
    syncedLabel: `Garmin, synced ${gen.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} ${gen.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
    readiness: recovery && recovery.confidence !== "none" ? recovery.score : FALLBACK.readiness,
    recovery,
    hrvMs: last.hrvMs ?? FALLBACK.hrvMs,
    hrvWeeklyMs: last.hrvWeeklyMs ?? FALLBACK.hrvWeeklyMs,
    hrvRange: last.hrvRange ?? FALLBACK.hrvRange,
    restingHr: rhrOf(last) ?? FALLBACK.restingHr,
    bodyBattery: day(last.date)?.bodyBatteryNow ?? day(last.date)?.bodyBatteryHigh ?? FALLBACK.bodyBattery,
    loadRatio: Math.round(ratio * 100) / 100,
    strainYesterday,
    lastNight: { hours: last.hours, score: last.score ?? 0 },
    sleepHours: nights.slice(-7).map(n => n.hours),
    lastWorkout: lw ? { date: lw.date, title: lw.name, km: lw.km, minutes: lw.minutes, avgHr: lw.avgHr ?? 0 } : null,
  };
}

export const TODAY: TodayData = fromGarmin(g) ?? {
  source: "snapshot",
  ...FALLBACK,
  recovery: null,
  strainYesterday: null,
};

export const sleepAvg7 = TODAY.sleepHours.reduce((a, b) => a + b, 0) / TODAY.sleepHours.length;

/** Fitness for session targets: your settings, with threshold heart rate from Garmin's zones when synced. */
export const FITNESS: Fitness = { ...FITNESS_SETTINGS, lthr: g.zones?.lthr ?? FITNESS_SETTINGS.lthr };

/** Latest weight from Garmin, if any. */
export const LATEST_WEIGHT = g.weights?.length ? g.weights[g.weights.length - 1] : null;

/** Goals with body weight from the latest Garmin weigh-in, so calories and protein follow it. */
const goalsWithWeight = (() => {
  if (!LATEST_WEIGHT) return DEFAULT_GOALS;
  const kg = LATEST_WEIGHT.kg;
  return {
    ...DEFAULT_GOALS,
    profile: { ...DEFAULT_GOALS.profile, weightKg: kg },
    targetWeightKg: DEFAULT_GOALS.aim === "maintain" ? kg : DEFAULT_GOALS.targetWeightKg,
  };
})();
export { goalsWithWeight as DEFAULT_GOALS };
