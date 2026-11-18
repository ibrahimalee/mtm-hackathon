"""Six-check self-audit. Recomputes figures from facts independently of the solver."""
from __future__ import annotations

import math

from .ledger import primary
from .numbers import to_num


# Inputs every plan needs. If the reader failed to find one, the audit says so instead of planning around the gap.
REQUIRED = {
    "people.students": "number of students", "team.size": "team size", "event.minutes": "event length",
    "budget.cap": "budget cap", "judge.max_teams": "teams one judge may cover",
    "judge.minutes_per_team": "judging minutes per team",
}


def missing_inputs(facts) -> list[dict]:
    have = {f.key for f in facts if f.status == "active" and f.type == "param" and primary(f) is not None}
    return [{"key": k, "label": v} for k, v in REQUIRED.items() if k not in have]


def audit(facts, plan: dict) -> list[dict]:
    if not plan or not plan.get("feasible"):
        return [{"check": c, "pass": False, "detail": "no valid plan"} for c in
                ("correct figures", "within budget", "venue fits", "schedule valid", "enough judges", "all areas covered")]
    act = [f for f in facts if f.status == "active"]
    P = {f.key: primary(f) for f in act if f.type == "param"}
    n = lambda k, d=0: P[k] if isinstance(P.get(k), (int, float)) else d
    out = []
    people, bud = plan["people"], plan["budget"]
    # 1 correct figures
    probs = []
    exp_people = n("people.students") + n("people.staff") + plan["judging"]["judges"] + people["other"]
    if people["total"] != exp_people:
        probs.append(f"people {people['total']} != {exp_people}")
    if sum(l["amount"] for l in bud["lines"]) != bud["total"]:
        probs.append("budget lines do not sum to total")
    if plan.get("food") and plan["food"]["per_head"] is not None:
        fd = plan["food"]
        if abs(fd["per_head"] * fd["qty"] * (100 + n("food.surcharge_pct")) / 100 - fd["cost"]) > 0.5 and fd["sources"]:
            opt = next((f for f in act if f.id == fd["sources"][0]), None)
            if opt is not None and opt.x.get("basis", "per_head") == "per_head":
                probs.append("food cost != price x quantity")
    if plan["judging"]["fees_total"] != plan["judging"]["judges"] * plan["judging"]["fee"]:
        probs.append("judge fees mismatch")
    if any(not l["sources"] for l in bud["lines"]):
        probs.append("a budget line has no source")
    out.append({"check": "correct figures", "pass": not probs,
                "detail": "; ".join(probs) or f"people {people['total']}, total {bud['total']}, every line sourced"})
    # 2 within budget
    cap = bud["cap"]
    ok = cap is None or bud["total"] <= cap
    out.append({"check": "within budget", "pass": ok,
                "detail": "no cap stated" if cap is None else (f"{bud['total']} of {cap}" if ok else f"over by {bud['total'] - cap}")})
    # 3 venue fits
    v = plan.get("venue")
    if v is None:
        out.append({"check": "venue fits", "pass": False, "detail": "no venue chosen"})
    else:
        ok = v["capacity"] is None or v["capacity"] >= people["total"]
        # Stated venue requirements are checked too: a required feature the chosen venue lacks, or a venue ruled out.
        have = [str(ft).lower() for ft in (v.get("features") or [])]
        unmet = []
        for c in act:
            if c.type != "constraint" or isinstance(c.x.get("names"), list):
                continue
            metric, op, val = c.x.get("metric"), c.x.get("op") or "==", str(primary(c)).lower()
            if metric == "venue.features" and op in ("includes", "==") and not any(val in h or h in val for h in have):
                unmet.append(f"required '{val}' is not offered by {v['name']}")
            if metric == "venue.name" and op == "!=" and val in str(v["name"]).lower():
                unmet.append(f"{v['name']} is stated as unavailable")
        problem = (f"{people['total'] - v['capacity']} people without a seat" if not ok else "") or "; ".join(unmet)
        ok = ok and not unmet
        out.append({"check": "venue fits", "pass": ok,
                    "detail": f"{v['name']} seats {v['capacity']} for {people['total']}" if ok else problem})
    # 4 schedule valid
    sch = plan["schedule"]
    total = sum(s["minutes"] for s in sch)
    dur = plan["schedule_meta"]["duration"]
    j = plan["judging"]
    probs = []
    if dur is not None and total != dur:
        probs.append(f"blocks sum to {total}, event is {dur}")
    if j["teams"] and j["window_minutes"] < j["teams_per_judge"] * j["minutes_per_team"]:
        probs.append("judging window too short")
    out.append({"check": "schedule valid", "pass": not probs, "detail": "; ".join(probs) or f"{total} min, judging window {j['window_minutes']} min"})
    # 5 enough judges
    mt, av = j["max_teams_per_judge"], j["available"]
    probs = []
    if mt and j["judges"] * mt < j["teams"]:
        probs.append(f"{j['teams'] - j['judges'] * mt} teams unjudged")
    if av is not None and j["judges"] > av:
        probs.append("more judges than available")
    out.append({"check": "enough judges", "pass": not probs,
                "detail": "; ".join(probs) or f"{j['judges']} judges for {j['teams']} teams"})
    # 6 all areas covered
    missing = [a for a in ("venue", "people", "food", "judging", "schedule", "budget") if not plan.get(a)]
    gaps = missing_inputs(facts)
    detail = []
    if missing:
        detail.append("no " + ", ".join(missing))
    if gaps:
        detail.append("not found in the messages: " + ", ".join(g["label"] for g in gaps))
    out.append({"check": "all areas covered", "pass": not missing and not gaps,
                "detail": "; ".join(detail) or "all six areas present and every required input found", "missing": gaps})
    if plan.get("food") and plan["food"]["qty"] < people["total"]:
        out[0]["pass"] = False
        out[0]["detail"] += f"; {people['total'] - plan['food']['qty']} people without a meal"
    return out


def impact(plan: dict) -> dict:
    """Human consequences of a plan that breaks a hard rule (used by the break-it-live toggles)."""
    if not plan or not plan.get("feasible"):
        return {}
    p, v, f, j, b = plan["people"], plan.get("venue"), plan.get("food"), plan["judging"], plan["budget"]
    return {
        "people_without_seat": max(0, p["total"] - v["capacity"]) if v and v["capacity"] is not None else 0,
        "people_without_meal": max(0, p["total"] - f["qty"]) if f else 0,
        "over_budget": max(0, b["total"] - b["cap"]) if b["cap"] is not None else 0,
        "teams_unjudged": max(0, j["teams"] - j["judges"] * j["max_teams_per_judge"]) if j["max_teams_per_judge"] else 0,
        "minutes_overrun": max(0, sum(s["minutes"] for s in plan["schedule"]) - (plan["schedule_meta"]["duration"] or 0))
        if plan["schedule_meta"]["duration"] else 0,
    }
