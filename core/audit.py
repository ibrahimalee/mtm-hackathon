"""Six-check self-audit. Recomputes figures from facts independently of the solver."""
from __future__ import annotations

import math

from .ledger import primary
from .numbers import to_num


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
        if abs(fd["per_head"] * fd["qty"] - fd["cost"]) > 0.5 and fd["sources"]:
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
        out.append({"check": "venue fits", "pass": ok,
                    "detail": f"{v['name']} seats {v['capacity']} for {people['total']}" if ok
                    else f"{people['total'] - v['capacity']} people without a seat"})
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
    out.append({"check": "all areas covered", "pass": not missing, "detail": ("missing: " + ", ".join(missing)) if missing else "all six areas present"})
    if plan.get("food") and plan["food"]["qty"] < people["total"]:
        out[0]["pass"] = False
        out[0]["detail"] += f"; {people['total'] - plan['food']['qty']} people without a meal"
    return out
