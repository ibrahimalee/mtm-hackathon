"""Slack and breaking points: integer binary search over solve(overrides). Zero model calls."""
from __future__ import annotations

from .ledger import primary
from .solver import DEPENDS, solve

SENSITIVE_PARAMS = ["budget.cap", "people.students", "people.staff", "event.minutes", "judge.fee",
                    "judges.available", "judge.max_teams", "judge.minutes_per_team", "team.size", "food.qty"]
NEAR = 0.10  # policy: a margin within 10% of its limit is flagged as near the limit
MAX_DOUBLINGS = 30


def _sig(plan: dict):
    if not plan["feasible"]:
        return None
    return (plan["venue"] and plan["venue"]["name"], plan["food"] and (plan["food"]["name"], plan["food"]["tier"]),
            plan["judging"]["judges"])


def _first_true(pred, cur: int, step: int):
    """Smallest move from cur (in direction step=+1/-1) where pred flips to True, or None."""
    last_false, d = cur, 1
    for _ in range(MAX_DOUBLINGS):
        v = cur + step * d
        if v < 0:
            v = 0
        if pred(v):
            lo, hi = last_false, v
            while abs(hi - lo) > 1:
                mid = (lo + hi) // 2
                if pred(mid):
                    hi = mid
                else:
                    lo = mid
            return hi
        last_false = v
        if v == 0:
            return None
        d *= 2
    return None


def compute(facts, plan: dict, rules: list[dict]) -> dict:
    slack = []
    for r in rules:
        if r["kind"] == "hard" and r["slack"] is not None and isinstance(r["rhs"], (int, float)):
            lim = abs(r["rhs"]) or 1
            slack.append({"rule": r["id"], "expr": r["expr"], "current": r["lhs"], "limit": r["rhs"],
                          "slack": r["slack"], "near": 0 <= r["slack"] <= NEAR * lim})
    if not plan.get("feasible"):
        return {"slack": slack, "breaking_points": []}
    act = [f for f in facts if f.status == "active"]
    base = _sig(plan)
    inputs = [(f.key, f) for f in act if f.type == "param" and f.key in SENSITIVE_PARAMS
              and isinstance(primary(f), (int, float))]
    for src in (plan["venue"] and plan["venue"]["sources"][:1] or []) + (plan["food"] and plan["food"]["sources"][:1] or []):
        f = next((a for a in act if a.id == src), None)
        if f is not None and isinstance(primary(f), (int, float)):
            inputs.append((f"{f.x.get('category', 'option')} price: {f.x.get('name') or f.key}", f))
    for f in act:
        if f.type == "expense" and str(f.x.get("status", "committed")).lower() != "requested" and isinstance(primary(f), (int, float)):
            inputs.append((f"expense: {f.x.get('item') or f.key}", f))
    cache: dict = {}

    def run(fid, v):
        k = (fid, v)
        if k not in cache:
            cache[k] = solve(facts, overrides={fid: v})
        return cache[k]

    points = []
    for label, f in inputs:
        cur = int(primary(f))
        affects = DEPENDS.get(f.key.split(".")[0], []) if f.type == "param" else \
            (["venue", "budget"] if "venue" in label else ["food", "budget"] if "food" in label else ["budget"])
        for step, word in ((-1, "falls below"), (1, "rises above")):
            breaks = _first_true(lambda v: not run(f.id, v)["feasible"], cur, step)
            changes = _first_true(lambda v: _sig(run(f.id, v)) != base, cur, step)
            if breaks is None and changes is None:
                continue
            points.append({"input": label, "fact_id": f.id, "current": cur, "changes_at": changes,
                           "breaks_at": breaks, "direction": word, "affects": affects})
    return {"slack": slack, "breaking_points": points}
