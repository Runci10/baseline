// Baseline nutrition engine: daily calorie and macro targets that follow the body goal
// and that day's session. Pure functions only.

import type { Goals, Session, SessionKind, Week } from "./plan";

export type CarbLevel = "Low" | "Medium" | "High";

export interface DayTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  carbLevel: CarbLevel;
  tip: string;
  bmr: number;
  maintenance: number;   // energy needs for the day before the body-goal adjustment
}

export const TIPS: Record<SessionKind, string> = {
  long: "Have a bigger carb meal the night before. If it runs over 75 min, take 30–60 g of carbs per hour.",
  hard: "Eat a carb-based meal 2–3 hours before, then protein and carbs within 2 hours after.",
  lower: "Aim for 20–40 g of protein after training and spread protein across 3–4 meals.",
  upper: "Aim for 20–40 g of protein after training and spread protein across 3–4 meals.",
  full: "Aim for 20–40 g of protein after training and spread protein across 3–4 meals.",
  easy: "Normal meals are enough. No special fuelling needed.",
  rest: "Go a little lighter on carbs and keep protein steady to support recovery.",
};

const KCAL_PER_KG = 7700;

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmr(p: Goals["profile"]): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "m" ? 5 : -161);
}

/** Energy used by a session above resting, kcal. */
export function sessionKcal(s: Session | null, weightKg: number): number {
  return s && s.minutes ? ((s.met - 1) * weightKg * s.minutes) / 60 : 0;
}

/**
 * kcal = BMR × activity + session kcal ± rate × 7700 / 7
 * Protein 1.6 g/kg (maintain), 1.8 (gain), 2.0 (lose), +0.2 with strength training, max 2.2.
 * Carbs 3 g/kg on rest days up to 7–8 on long days; hard and long days keep full carbs when losing.
 * Fat fills the rest, minimum 0.8 g/kg. Deficit capped at 25% of needs and never below 1.1 × BMR.
 */
export function dayTargets(s: Session | null, g: Goals): DayTargets {
  const w = g.profile.weightKg;
  const base = bmr(g.profile);
  const maintenance = base * g.profile.activity + sessionKcal(s, w);

  let adjust = g.aim === "lose" ? (-g.rateKgPerWeek * KCAL_PER_KG) / 7 : g.aim === "gain" ? (g.rateKgPerWeek * KCAL_PER_KG) / 7 : 0;
  if (g.aim === "lose") adjust = Math.max(adjust, -0.25 * maintenance);
  const kcalTarget = Math.max(maintenance + adjust, g.aim === "lose" ? base * 1.1 : 0);

  const hasStrength = g.sports.some(x => x.id === "strength");
  const proteinPerKg = Math.min(2.2, (g.aim === "lose" ? 2.0 : g.aim === "gain" ? 1.8 : 1.6) + (hasStrength ? 0.2 : 0));

  const kind: SessionKind = s ? s.kind : "rest";
  const carbTable: Record<SessionKind, number> = { rest: 3, easy: 5, hard: 6, long: s && s.minutes >= 90 ? 8 : 7, lower: 4.5, upper: 4, full: 4.5 };
  let carbsPerKg = carbTable[kind];
  if (g.aim === "lose" && kind !== "hard" && kind !== "long") carbsPerKg -= 1;

  const proteinG = Math.round(proteinPerKg * w);
  let carbsG = Math.round(carbsPerKg * w);
  let fatG = Math.round((kcalTarget - proteinG * 4 - carbsG * 4) / 9);
  const fatMin = Math.round(0.8 * w);
  if (fatG < fatMin) {
    fatG = fatMin;
    carbsG = Math.max(Math.round(2 * w), Math.round((kcalTarget - proteinG * 4 - fatG * 9) / 4));
  }
  const kcal = Math.round((proteinG * 4 + carbsG * 4 + fatG * 9) / 10) * 10;
  const carbLevel: CarbLevel = carbsPerKg >= 6 ? "High" : carbsPerKg >= 4.5 ? "Medium" : "Low";

  return { kcal, proteinG, carbsG, fatG, carbLevel, tip: TIPS[kind], bmr: Math.round(base), maintenance: Math.round(maintenance) };
}

export function weekTargets(week: Week, g: Goals): DayTargets[] {
  return week.map(s => dayTargets(s, g));
}

/**
 * Weekly calorie correction: compare the two-week weight trend with the goal rate.
 * Returns the change to daily calories (kcal), in steps of 150, or 0 when on track.
 */
export function calorieCorrection(weights: { date: string; kg: number }[], g: Goals): number {
  const recent = weights.filter(w => Date.parse(w.date) >= Date.parse(weights[weights.length - 1]?.date ?? "") - 14 * 864e5);
  if (recent.length < 3) return 0;
  const n = recent.length;
  const xs = recent.map(w => Date.parse(w.date) / 6048e5);
  const ys = recent.map(w => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / Math.max(xs.reduce((t, x) => t + (x - mx) ** 2, 0), 1e-9);
  const goalRate = g.aim === "lose" ? -g.rateKgPerWeek : g.aim === "gain" ? g.rateKgPerWeek : 0;
  const gap = slope - goalRate;               // kg/week ahead (+) or behind (−) of plan
  if (Math.abs(gap) <= 0.2) return 0;
  return gap > 0 ? -150 : 150;
}
