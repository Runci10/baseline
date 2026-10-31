"""Baseline: refresh Garmin data for the app.

Runs the pull script in your garmin-dashboard folder (Garmin's Personal API, your own key),
then converts the last 60 days into src/data/garmin.json for the app to read.

    python scripts/sync_garmin.py              pull new data, then convert
    python scripts/sync_garmin.py --no-pull    convert what's already downloaded

The dashboard folder defaults to %USERPROFILE%\\garmin-dashboard; set GARMIN_DASHBOARD to change it.
Your data stays on this computer: src/data/garmin.json is never committed to GitHub.
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "data", "garmin.json")
DASH = os.environ.get("GARMIN_DASHBOARD") or os.path.join(os.path.expanduser("~"), "garmin-dashboard")
DATA = os.path.join(DASH, "data")
DAYS = 60

RUN = {"running", "trail_running", "treadmill_running", "track_running", "virtual_run", "street_running"}
RIDE = {"cycling", "indoor_cycling", "road_biking", "mountain_biking", "gravel_cycling", "virtual_ride"}
SWIM = {"lap_swimming", "open_water_swimming", "swimming"}
STRENGTH = {"strength_training", "hiit", "indoor_cardio", "fitness_equipment"}


def sport_of(key):
    for name, keys in (("run", RUN), ("ride", RIDE), ("swim", SWIM), ("strength", STRENGTH)):
        if key in keys:
            return name
    return "other"


def load(name, default):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def num(x, digits=None):
    try:
        v = float(x)
        if v != v:
            return None
        return round(v, digits) if digits is not None else v
    except (TypeError, ValueError):
        return None


def write(obj):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)


def main():
    if not os.path.isdir(DASH):
        print(f"Couldn't find your garmin-dashboard folder at {DASH}.")
        print("Set GARMIN_DASHBOARD to its location, or keep using the built-in snapshot.")
        write({"generated": None})
        return 0

    if "--no-pull" not in sys.argv:
        print("Pulling new data from Garmin (garmin-dashboard\\pull.py)...")
        r = subprocess.run([sys.executable, "pull.py"], cwd=DASH)
        if r.returncode != 0:
            print("The Garmin pull didn't finish. Using the data already downloaded.")

    daily, sleep, hrv = load("daily.json", {}), load("sleep.json", {}), load("hrv.json", {})
    acts, weight, zones = load("activities.json", []), load("weight.json", {}), load("hr_zones.json", [])
    if not sleep:
        print("No sleep data found in garmin-dashboard\\data. Run its pull.bat first.")
        write({"generated": None})
        return 0

    latest = max(sleep)
    start = (datetime.strptime(latest, "%Y-%m-%d").date() - timedelta(days=DAYS - 1)).isoformat()

    nights = []
    for d in sorted(k for k in sleep if k >= start):
        s, h = sleep[d], hrv.get(d) or {}
        asleep = num(s.get("sleepTimeSeconds"))
        if not asleep:
            continue
        base = h.get("baseline") or {}
        nights.append({
            "date": d,
            "hours": round(asleep / 3600, 2),
            "deepMin": round((num(s.get("deepSleepSeconds")) or 0) / 60),
            "lightMin": round((num(s.get("lightSleepSeconds")) or 0) / 60),
            "remMin": round((num(s.get("remSleepSeconds")) or 0) / 60),
            "awakeMin": round((num(s.get("awakeSleepSeconds")) or 0) / 60),
            "score": ((s.get("sleepScores") or {}).get("overall") or {}).get("value"),
            "respRate": num(s.get("averageRespirationValue"), 1),
            "bedtimeGmtMs": s.get("sleepStartTimestampGMT"),
            "hrvMs": h.get("lastNightAvg"),
            "hrvWeeklyMs": h.get("weeklyAvg"),
            "hrvRange": [base.get("balancedLow"), base.get("balancedUpper")] if base.get("balancedLow") else None,
            "restingHr": ((daily.get(d) or {}).get("heartRate") or {}).get("restingValue"),
        })

    days = []
    for d in sorted(k for k in daily if k >= start):
        x = daily[d]
        days.append({
            "date": d,
            "steps": ((x.get("movement") or {}).get("steps") or {}).get("value"),
            "restingHr": (x.get("heartRate") or {}).get("restingValue"),
            "stressAvg": (x.get("stress") or {}).get("avgLevel"),
            "bodyBatteryHigh": (x.get("bodyBattery") or {}).get("maxValue"),
            "bodyBatteryNow": (x.get("bodyBattery") or {}).get("latestValue"),
            "kcalTotal": (x.get("calories") or {}).get("burnedTotal"),
        })

    workouts = []
    for a in acts:
        d = (a.get("startTimeLocal") or "")[:10]
        if not d or d < start:
            continue
        key = (a.get("activityType") or {}).get("typeKey", "")
        workouts.append({
            "date": d,
            "sport": sport_of(key),
            "type": key,
            "name": a.get("activityName"),
            "km": num((a.get("distance") or 0) / 1000, 2),
            "minutes": num((a.get("duration") or 0) / 60, 1),
            "avgHr": num(a.get("averageHR")),
            "maxHr": num(a.get("maxHR")),
            "load": num(a.get("activityTrainingLoad"), 1),
            "fastest5kS": num(a.get("fastestSplit_5000"), 0),
        })
    workouts.sort(key=lambda w: w["date"])

    weights = []
    for d in sorted(weight):
        lw = (weight[d] or {}).get("latestWeight") or {}
        g = num(lw.get("weight"))
        if g:
            weights.append({"date": d, "kg": round(g / 1000, 1)})

    z = next((x for x in zones if x.get("sport") == "RUNNING"), zones[0] if zones else {})
    out = {
        "generated": datetime.now().isoformat(timespec="minutes"),
        "latestNight": latest,
        "nights": nights,
        "days": days,
        "workouts": workouts,
        "weights": weights[-10:],
        "zones": {"lthr": z.get("lactateThresholdHeartRateUsed"), "maxHr": z.get("maxHeartRateUsed"), "restingHr": z.get("restingHeartRateUsed")},
    }
    write(out)
    n = nights[-1]
    print()
    print(f"Baseline data updated to {latest}: {len(nights)} nights, {len(workouts)} workouts in the last {DAYS} days.")
    print(f"Last night: {n['hours']} h asleep, sleep score {n['score']}, HRV {n['hrvMs']} ms.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
