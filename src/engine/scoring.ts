// Baseline scoring engine: recovery, strain, sleep and training load.
// Pure functions only: no React, no device APIs. Every score is relative to the user's own history.

export type Band = "good" | "warn" | "bad";

export interface NightInputs {
  hrvMs: number;          // overnight average HRV (rMSSD)
  restingHr: number;      // bpm
  sleepHours: number;
  respRate?: number;      // breaths per minute
}

export interface Contribution {
  key: "hrv" | "restingHr" | "sleep" | "respRate";
  label: string;
  z: number;              // how far from the user's norm, in standard deviations
  points: number;         // effect on the 0–100 score
}

export interface RecoveryResult {
  score: number;          // 0–100
  band: Band;
  contributions: Contribution[];
  nights: number;         // history length used
  confidence: "none" | "low" | "full";
}

export const MIN_NIGHTS = 7;
export const FULL_NIGHTS = 30;

export const bandOf = (score: number): Band => (score >= 67 ? "good" : score >= 34 ? "warn" : "bad");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function meanSd(values: number[]): { mean: number; sd: number } {
  const n = values.length;
  if (!n) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  return { mean, sd: Math.max(Math.sqrt(variance), 1e-6) };
}

export function zScore(value: number, history: number[]): number {
  const { mean, sd } = meanSd(history);
  return clamp((value - mean) / sd, -3, 3);
}

/**
 * Recovery (0–100): today's night compared with the previous nights (up to 30).
 * R = 50 + 15 × (0.45·zHRV − 0.25·zRHR + 0.20·zSleep − 0.10·zResp)
 * HRV, resting HR and breathing rate are compared with the user's own history. Sleep is compared
 * with sleep need (1 point per hour short, up to −3), because someone who has slept badly for weeks
 * would otherwise see a short night as normal.
 * Weights are starting values, to be tuned against how users report feeling.
 */
export function recoveryScore(today: NightInputs, history: NightInputs[], sleepNeedHours = 7.5): RecoveryResult {
  const h = history.slice(-FULL_NIGHTS);
  const nights = h.length;
  if (nights < MIN_NIGHTS) {
    return { score: 50, band: "warn", contributions: [], nights, confidence: "none" };
  }
  const parts: Contribution[] = [
    { key: "hrv", label: "HRV", z: zScore(today.hrvMs, h.map(n => n.hrvMs)), points: 0 },
    { key: "restingHr", label: "Resting heart rate", z: zScore(today.restingHr, h.map(n => n.restingHr)), points: 0 },
    { key: "sleep", label: "Sleep vs need", z: clamp(today.sleepHours - sleepNeedHours, -3, 1), points: 0 },
  ];
  const weights: Record<Contribution["key"], number> = { hrv: 0.45, restingHr: -0.25, sleep: 0.2, respRate: -0.1 };
  const resp = h.filter(n => n.respRate != null).map(n => n.respRate as number);
  if (today.respRate != null && resp.length >= MIN_NIGHTS) {
    parts.push({ key: "respRate", label: "Breathing rate", z: zScore(today.respRate, resp), points: 0 });
  }
  let total = 0;
  for (const p of parts) {
    p.points = 15 * weights[p.key] * p.z;
    total += p.points;
  }
  const score = Math.round(clamp(50 + total, 0, 100));
  return { score, band: bandOf(score), contributions: parts, nights, confidence: nights >= FULL_NIGHTS ? "full" : "low" };
}

/* ---------- Strain ---------- */

export interface Workout {
  minutes: number;
  avgHr: number;
}

/** Banister training impulse from heart-rate reserve. */
export function trimp(w: Workout, restingHr: number, maxHr: number): number {
  const hrr = clamp((w.avgHr - restingHr) / (maxHr - restingHr), 0, 1);
  return w.minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
}

/**
 * Daily strain on a 0–21 scale: everyday movement (from steps) plus workouts,
 * mapped so each extra point needs more effort than the last.
 */
export function strainScore(workouts: Workout[], steps: number, restingHr: number, maxHr: number): number {
  const load = (steps / 1000) * 2.2 + workouts.reduce((t, w) => t + trimp(w, restingHr, maxHr), 0);
  return Math.round(21 * (1 - Math.exp(-load / 90)) * 10) / 10;
}

/* ---------- Training load ---------- */

/** Exponentially weighted average, oldest value first. */
export function ewma(values: number[], days: number): number {
  const k = 2 / (days + 1);
  return values.reduce((avg, v, i) => (i === 0 ? v : v * k + avg * (1 - k)), 0);
}

export interface LoadResult {
  acute: number;
  chronic: number;
  ratio: number;
  status: "low" | "optimal" | "high" | "very high";
}

/** Acute (7-day) over chronic (28-day) load from daily training loads, oldest first. */
export function loadRatio(dailyLoads: number[]): LoadResult {
  const acute = ewma(dailyLoads, 7);
  const chronic = ewma(dailyLoads, 28);
  const ratio = chronic > 0 ? acute / chronic : 0;
  const status = ratio < 0.8 ? "low" : ratio <= 1.3 ? "optimal" : ratio <= 1.5 ? "high" : "very high";
  return { acute, chronic, ratio, status };
}

/* ---------- Sleep ---------- */

export interface SleepNight {
  asleepMin: number;
  inBedMin: number;
  deepMin: number;
  remMin: number;
  bedtimeMin: number;      // minutes after midnight; times after midnight may exceed 1440
}

/** Sleep need in hours: base need plus extra after high strain or accumulated debt. */
export function sleepNeed(baseHours: number, strainYesterday: number, debtHours: number): number {
  return baseHours + Math.max(0, strainYesterday - 10) * 0.05 + Math.min(debtHours, 4) * 0.125;
}

/** Sleep score (0–100): duration vs need 50%, efficiency 20%, deep + REM share 20%, bedtime consistency 10%. */
export function sleepScore(night: SleepNight, needHours: number, recentBedtimes: number[]): number {
  const duration = clamp(night.asleepMin / 60 / needHours, 0, 1);
  const efficiency = clamp((night.asleepMin / Math.max(night.inBedMin, 1) - 0.7) / 0.25, 0, 1);
  const restorative = clamp((night.deepMin + night.remMin) / Math.max(night.asleepMin, 1) / 0.45, 0, 1);
  const { sd } = meanSd(recentBedtimes.concat(night.bedtimeMin));
  const consistency = recentBedtimes.length >= 3 ? clamp(1 - (sd - 15) / 75, 0, 1) : 0.5;
  return Math.round(100 * (0.5 * duration + 0.2 * efficiency + 0.2 * restorative + 0.1 * consistency));
}
