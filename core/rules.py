"""Compiles active facts + invariants into a readable rulebook with slack."""
from __future__ import annotations

import math

from .ledger import primary
from .numbers import fmt_clock, parse_clock, to_num
from .schema import METRICS
from .solver import (POLICY_MEAL_MIN, POLICY_MIN_BUILD_MIN, POLICY_OPENING_MIN, POLICY_RESULTS_MIN, cmp)

POLICY = "planner policy"

REJECTION_TARGET = {
    "R-HARD-meals": "H-MEALS", "R-HARD-judges": "H-JUDGE", "R-HARD-schedule": "H-SUM",
    "R-HARD-blocks": "H-BLOCKS", "R-HARD-capacity": "H-CAP", "R-HARD-budget": "H-BUDGET",
}
GATE_RULES = {
    "R-GROUND": "every fact quote must appear in the source and its numbers must be recoverable from it",
    "R-STALE": "an older message may not overwrite a newer fact",
    "R-AUTH": "only the owning role (or a higher rank within its domain) may change a fact",
    "R-TOTAL": "a stated total must equal the sum of its parts",
    "R-CONFLICT": "a contradiction is resolved by rank, then date",
    "R-HARD-constraint": "requirements from messages must hold in the plan",
}


def plan_metrics(plan: dict) -> dict:
    if not plan.get("feasible"):
        return {}
    v, f, j, p, b = plan.get("venue"), plan.get("food"), plan["judging"], plan["people"], plan["budget"]
    total = sum(s["minutes"] for s in plan["schedule"])
    start = parse_clock(plan["schedule_meta"].get("start"))
    return {
        "people.total": p["total"], "venue.capacity": v and v["capacity"], "venue.cost": v and v["cost"],
        "venue.features": v and v["features"], "venue.name": v and v["name"],
        "food.per_head": f and f["per_head"], "food.cost": f and f["cost"], "food.qty": f and f["qty"],
        "judges.used": j["judges"], "judging.teams_per_judge": j["teams_per_judge"],
        "judging.window_minutes": j["window_minutes"], "schedule.total_minutes": total,
        "schedule.blocks": [s["label"] for s in plan["schedule"]],
        "schedule.end": (start + total) if start is not None else total,
        "budget.total": b["total"], "budget.remaining": b["remaining"],
    }


def compile_rules(facts, plan: dict, rejections) -> list[dict]:
    if not plan.get("feasible"):
        return []
    act = [f for f in facts if f.status == "active"]
    P = {f.key: primary(f) for f in act if f.type == "param"}
    pid = {f.key: f.id for f in act if f.type == "param"}
    M = plan_metrics(plan)
    j, p, b, sch = plan["judging"], plan["people"], plan["budget"], plan["schedule"]
    rules: list[dict] = []

    def add(id, expr, kind, area, source, lhs, rhs, slack, status=None, fids=None):
        if status is None:
            status = "holds" if (slack is None or slack >= 0) else "violated"
        rules.append({"id": id, "expr": expr, "kind": kind, "area": area, "source": source, "lhs": lhs,
                      "rhs": rhs, "slack": slack, "status": status, "facts": fids or [], "rejected": []})

    num = lambda k: P[k] if isinstance(P.get(k), (int, float)) else None
    v, f = plan.get("venue"), plan.get("food")
    if v and v["capacity"] is not None:
        add("H-CAP", "venue.capacity >= people.total", "hard", "venue", POLICY, v["capacity"], p["total"],
            v["capacity"] - p["total"], fids=v["sources"] + p["sources"])
    if f:
        add("H-MEALS", "food.qty >= people.total", "hard", "food", POLICY, f["qty"], p["total"],
            f["qty"] - p["total"], fids=f["sources"])
    if j["max_teams_per_judge"]:
        add("H-JUDGE", "judging.teams_per_judge <= judge.max_teams", "hard", "judging", POLICY,
            j["teams_per_judge"], j["max_teams_per_judge"], j["max_teams_per_judge"] - j["teams_per_judge"],
            fids=[pid[k] for k in ("judge.max_teams", "team.size", "people.students") if k in pid])
    if j["available"] is not None:
        add("H-AVAIL", "judges.used <= judges.available", "hard", "judging", POLICY, j["judges"], j["available"],
            j["available"] - j["judges"], fids=[pid["judges.available"]] if "judges.available" in pid else [])
    need = j["teams_per_judge"] * j["minutes_per_team"]
    add("H-WINDOW", "judging.window_minutes >= teams_per_judge x minutes_per_team", "hard", "schedule", POLICY,
        j["window_minutes"], need, j["window_minutes"] - need, fids=j["sources"])
    total = sum(s["minutes"] for s in sch)
    if num("event.minutes") is not None:
        add("H-SUM", "schedule.total_minutes == event.minutes", "hard", "schedule", POLICY, total, num("event.minutes"),
            -abs(total - num("event.minutes")), fids=[pid["event.minutes"]])
    blocks = [f_ for f_ in act if f_.type == "block"]
    if blocks:
        labels = " | ".join(s["label"].lower() for s in sch)
        miss = [str(b_.x.get("name") or b_.key) for b_ in blocks if str(b_.x.get("name") or b_.key).lower() not in labels]
        add("H-BLOCKS", "every required block is in the schedule", "hard", "schedule", POLICY, len(miss), 0,
            -len(miss), fids=[b_.id for b_ in blocks])
    if b["cap"] is not None:
        add("H-BUDGET", "budget.total <= budget.cap", "hard", "budget", POLICY, b["total"], b["cap"],
            b["cap"] - b["total"], fids=b["sources"])
    # message constraints
    msgs_by_id = {}
    for c in (f_ for f_ in act if f_.type == "constraint"):
        m, op, val = c.x.get("metric"), c.x.get("op") or "==", primary(c)
        src = {"msg_id": c.msg_id, "sender": c.sender, "date": c.date, "quote": c.quote}
        if m not in METRICS or M.get(m) is None:
            add(f"C-{c.id}", f"{m} {op} {val}", "message_constraint", (m or "x").split(".")[0], src, None, val, None,
                "unsupported", [c.id])
            continue
        act_v, ok = M[m], cmp(op, M[m], val, m)
        slack = None
        if isinstance(act_v, (int, float)) and isinstance(to_num(val), (int, float)):
            vv = to_num(val)
            slack = {"<=": vv - act_v, ">=": act_v - vv, "<": vv - act_v - 1, ">": act_v - vv - 1}.get(op, 0 if ok else -abs(act_v - vv))
        add(f"C-{c.id}", f"{m} {op} {val}", "message_constraint", m.split(".")[0], src, act_v, val, slack,
            "holds" if ok else "violated", [c.id])
    # planner policy
    by = {s["label"].lower(): s["minutes"] for s in sch}
    add("P-OPEN", f"opening slot >= {POLICY_OPENING_MIN} min", "policy", "schedule", POLICY, by.get("opening"),
        POLICY_OPENING_MIN, (by.get("opening") or 0) - POLICY_OPENING_MIN)
    add("P-BUILD", f"build period >= {POLICY_MIN_BUILD_MIN} min", "policy", "schedule", POLICY, by.get("build"),
        POLICY_MIN_BUILD_MIN, (by.get("build") or 0) - POLICY_MIN_BUILD_MIN)
    add("P-RESULTS", f"results slot >= {POLICY_RESULTS_MIN} min", "policy", "schedule", POLICY, by.get("results"),
        POLICY_RESULTS_MIN, (by.get("results") or 0) - POLICY_RESULTS_MIN)
    if f:
        add("P-MEAL", f"a meal slot of {POLICY_MEAL_MIN} min is scheduled when food exists", "policy", "schedule", POLICY,
            by.get("meal"), POLICY_MEAL_MIN, None, "holds" if "meal" in by or any("meal" in k or "lunch" in k for k in by) else "violated")
    if p["teams"] and j["max_teams_per_judge"]:
        least = math.ceil(p["teams"] / j["max_teams_per_judge"])
        add("P-JUDGES", "use the fewest judges that meet the teams-per-judge cap", "policy", "judging", POLICY,
            j["judges"], least, None, "holds" if j["judges"] <= max(least, 0) else "violated")
    # rejected facts listed under the rule that blocked them
    byid = {r["id"]: r for r in rules}
    for rj in rejections:
        tid = REJECTION_TARGET.get(rj.rule_id, rj.rule_id)
        if tid not in byid:
            expr = GATE_RULES.get(tid, "a hard rule")
            area = "gate"
            add(tid, expr, "hard" if tid.startswith("H-") else "policy", area, POLICY, None, None, None, "holds")
            byid[tid] = rules[-1]
        byid[tid]["rejected"].append({"fact_id": rj.fact_id, "quote": rj.quote, "reason": rj.reason, "msg_id": rj.msg_id})
    return rules
