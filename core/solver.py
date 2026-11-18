"""Pure deterministic planner: solve(facts, disabled_checks, overrides) -> plan dict. No model, no I/O."""
from __future__ import annotations

import itertools
import math
import re

from .ledger import primary, with_primary
from .numbers import fmt_clock, parse_clock, to_num
from .schema import METRICS

# --- Planner policy constants (not message facts) ---------------------------------------------
POLICY_OPENING_MIN = 12        # every event needs a fixed welcome slot before work starts
POLICY_RESULTS_MIN = 17        # fixed wrap-up slot for announcing outcomes
POLICY_MEAL_MIN = 37           # a meal slot is scheduled whenever a food option exists
POLICY_MIN_BUILD_MIN = 23      # smallest hands-on work period that still counts as a build phase
POLICY_DEFAULT_BUILD_MIN = 187  # build length used only when no event duration is stated
POLICY_JUDGE_SPAN = 11         # extra judges beyond the minimum worth enumerating; more never lowers cost
TIER_RANK = {"": 0, "default": 0, "standard": 0, "basic": 1, "premium": 2}  # prefer default/standard; downgrade before upgrade

STRUCTURAL = {"meals", "judges", "schedule", "blocks"}
ALL_CHECKS = ["capacity", "budget", "meals", "judge_cap", "schedule", "constraints"]


def _cat(f) -> str:
    return str((f.x or {}).get("category") or "other").lower()


def _is_meal(name: str) -> bool:
    return bool(re.search(r"lunch|dinner|meal|food|refresh|\btea\b", name.lower()))


def _is_judging(name: str) -> bool:
    return "judg" in name.lower()


def cmp(op: str, a, b, metric: str = "") -> bool:
    if op in ("includes", "excludes"):
        items = a if isinstance(a, (list, tuple, set)) else [a]
        needle = str(b).lower()
        hit = any(needle and needle in str(i).lower() for i in items)
        return hit if op == "includes" else not hit
    if metric == "schedule.end" and isinstance(b, str):
        b = parse_clock(b) if parse_clock(b) is not None else b
    na, nb = to_num(a), to_num(b)
    if na is not None and nb is not None:
        return {"<=": na <= nb, ">=": na >= nb, "==": na == nb, "!=": na != nb,
                "<": na < nb, ">": na > nb}.get(op, True)
    sa, sb = str(a).lower(), str(b).lower()
    return {"==": sa == sb, "!=": sa != sb}.get(op, True)


def solve(facts, disabled=frozenset(), overrides=None) -> dict:
    ov = overrides or {}
    fs = []
    for f in facts:
        if f.status != "active":
            continue
        fs.append(with_primary(f, ov[f.id]) if f.id in ov else f)

    P, Psrc = {}, {}
    for f in fs:
        if f.type == "param":
            P[f.key] = primary(f)
            Psrc[f.key] = f.id

    def num(k, d=None):
        v = P.get(k)
        return v if isinstance(v, (int, float)) and not isinstance(v, bool) else d

    students, staff = num("people.students", 0), num("people.staff", 0)
    extra = sum(v for k, v in P.items()
                if k.startswith("people.") and k not in ("people.students", "people.staff", "people.total")
                and isinstance(v, (int, float)))
    team_size = num("team.size")
    teams = math.ceil(students / team_size) if team_size and students else 0
    max_teams, avail = num("judge.max_teams"), num("judges.available")
    mpt, fee, cap = num("judge.minutes_per_team", 0), num("judge.fee", 0), num("budget.cap")
    duration, start = num("event.minutes"), parse_clock(P.get("event.start"))
    needed = math.ceil(teams / max_teams) if teams and max_teams else (1 if teams else 0)
    if avail is None:
        js = [needed]
    elif avail >= needed:
        js = list(range(needed, min(int(avail), needed + POLICY_JUDGE_SPAN) + 1))
    else:
        js = [needed] if "judge_cap" not in disabled else [int(avail)]

    venues = [f for f in fs if f.type == "option" and _cat(f) == "venue"]
    foods = [f for f in fs if f.type == "option" and _cat(f) == "food"]
    blocks = [f for f in fs if f.type == "block"]
    expenses = [f for f in fs if f.type == "expense"]
    committed = [e for e in expenses if str(e.x.get("status", "committed")).lower() != "requested"]
    requested = [e for e in expenses if str(e.x.get("status", "")).lower() == "requested"]
    constraints, unsupported = [], []
    stated = " ".join(str(ft).lower() for v in venues for ft in (v.x.get("features") or []))
    for c in (f for f in fs if f.type == "constraint"):
        if c.x.get("metric") == "venue.features" and str(primary(c)).lower() not in stated and (c.x.get("op") or "") in ("includes", "=="):
            unsupported.append({"fact_id": c.id, "metric": "venue.features", "quote": c.quote,
                                "reason": "no venue option states this feature, so it cannot be checked"})
        elif c.x.get("metric") in METRICS:
            constraints.append(c)
        else:
            unsupported.append({"fact_id": c.id, "metric": c.x.get("metric") or "unsupported",
                                "quote": c.quote, "reason": "metric not in the supported vocabulary"})

    def build(v, fd, j):
        fails = []
        people = students + staff + j + extra
        v_cost = 0
        if v is not None:
            price = primary(v) or 0
            v_cost = price * people if str(v.x.get("basis", "flat")) == "per_head" else price
        cap_v = to_num(v.x.get("capacity")) if v is not None else None
        if v is not None and cap_v is not None and cap_v < people and "capacity" not in disabled:
            fails.append(("capacity", f"venue seats {cap_v}, {people} people on site"))
        qty = num("food.qty", people)
        f_cost, per_head = 0, None
        if fd is not None:
            price = primary(fd) or 0
            if str(fd.x.get("basis", "per_head")) == "per_head":
                f_cost, per_head = price * qty, price
            else:
                f_cost, per_head = price, (price / qty if qty else None)
            if qty < people and "meals" not in disabled:
                fails.append(("meals", f"{qty} meals for {people} people on site"))
        if teams and max_teams and j and math.ceil(teams / j) > max_teams and "judge_cap" not in disabled:
            fails.append(("judges", f"{j} judges would each take more than {max_teams} teams"))
        if avail is not None and j > avail and "judge_cap" not in disabled:
            fails.append(("judges", f"{j} judges needed, {int(avail)} available"))
        tpj = math.ceil(teams / j) if teams and j else 0
        window = tpj * mpt
        # schedule
        fixed = []
        meal_given = judge_given = None
        for b in blocks:
            nm, mins = str(b.x.get("name") or b.key), to_num(b.x.get("minutes", b.value)) or 0
            if _is_judging(nm):
                judge_given = (nm, mins)
            elif _is_meal(nm):
                meal_given = (nm, mins)
            else:
                fixed.append((nm, mins, parse_clock(str(b.x.get("at") or ""))))
        if all(a for _, _, a in fixed) and fixed:
            fixed.sort(key=lambda t: t[2])
        judge_min = judge_given[1] if judge_given else window
        if judge_given and judge_given[1] < window and "schedule" not in disabled:
            fails.append(("schedule", f"judging block {judge_given[1]} min < {window} min needed"))
        meal = meal_given or (("meal", POLICY_MEAL_MIN) if fd is not None else None)
        rest = POLICY_OPENING_MIN + POLICY_RESULTS_MIN + sum(m for _, m, _ in fixed) \
            + (meal[1] if meal else 0) + judge_min
        if duration is None:
            build_min = POLICY_DEFAULT_BUILD_MIN
        else:
            build_min = duration - rest
            if build_min < POLICY_MIN_BUILD_MIN:
                if "schedule" not in disabled:
                    fails.append(("schedule", f"blocks need {rest + POLICY_MIN_BUILD_MIN} min, event is {duration} min"))
                build_min = max(build_min, 0)
        seq = [("opening", POLICY_OPENING_MIN), ("build", build_min)] + [(n, m) for n, m, _ in fixed]
        if meal:
            seq.append(meal)
        if judge_min or judge_given:
            seq.append((judge_given[0] if judge_given else "judging window", judge_min))
        seq.append(("results", POLICY_RESULTS_MIN))
        sched, cur = [], 0
        for label, m in seq:
            s = fmt_clock(start + cur) if start is not None else f"+{cur}m"
            e = fmt_clock(start + cur + m) if start is not None else f"+{cur + m}m"
            sched.append({"start": s, "end": e, "label": label[:1].upper() + label[1:], "minutes": m})
            cur += m
        fees = j * fee
        lines_total = v_cost + f_cost + fees + sum(primary(e) or 0 for e in committed)
        if cap is not None and lines_total > cap and "budget" not in disabled:
            fails.append(("budget", f"total {lines_total} exceeds the cap of {cap}"))
        metrics = {
            "people.total": people, "venue.capacity": cap_v, "venue.cost": v_cost if v is not None else None,
            "venue.features": list(v.x.get("features") or []) if v is not None else None,
            "venue.name": (v.x.get("name") or v.key) if v is not None else None,
            "food.per_head": per_head, "food.cost": f_cost if fd is not None else None,
            "food.qty": qty if fd is not None else None, "judges.used": j,
            "judging.teams_per_judge": tpj, "judging.window_minutes": judge_min,
            "schedule.total_minutes": cur, "schedule.blocks": [s["label"] for s in sched],
            "schedule.end": (start + cur) if start is not None else cur,
            "budget.total": lines_total, "budget.remaining": (cap - lines_total) if cap is not None else None,
        }
        for c in constraints:
            m, op, val = c.x.get("metric"), c.x.get("op") or "==", primary(c)
            if m == "schedule.blocks" and op == "excludes":
                hit = next((b for b in blocks if str(val).lower() in str(b.x.get("name") or b.key).lower()), None)
                if hit is not None:
                    fails.append(("blocks", f"required block '{hit.x.get('name') or hit.key}' cannot be removed"))
            if m == "judging.teams_per_judge" and max_teams and op in (">=", ">", "==") \
                    and isinstance(val, (int, float)) and val > max_teams and "judge_cap" not in disabled:
                fails.append(("judges", f"{val} teams per judge exceeds the cap of {max_teams}"))
        if "constraints" not in disabled:
            for c in constraints:
                m, op, val = c.x.get("metric"), c.x.get("op") or "==", primary(c)
                if m == "schedule.blocks" and op == "excludes":
                    continue
                act = metrics.get(m)
                if act is None or cmp(op, act, val, m):
                    continue
                fails.append(("constraint", f"requirement not met: {c.quote or m}"))
        return dict(v=v, fd=fd, j=j, people=people, v_cost=v_cost, cap_v=cap_v, qty=qty, f_cost=f_cost,
                    per_head=per_head, tpj=tpj, window=window, sched=sched, total=cur, fees=fees,
                    lines_total=lines_total, fails=fails, judge_min=judge_min)

    cands, best_fail = [], None
    for v, fd, j in itertools.product(venues or [None], foods or [None], js):
        c = build(v, fd, j)
        if not c["fails"]:
            cands.append(c)
        elif best_fail is None or len(c["fails"]) < len(best_fail["fails"]):
            best_fail = c
    if not cands:
        reasons = [{"code": code, "msg": msg} for code, msg in (best_fail["fails"] if best_fail else [])]
        return {"feasible": False, "reasons": reasons, "unsupported_constraints": unsupported}
    cands.sort(key=lambda c: (c["v_cost"], TIER_RANK.get(str((c["fd"].x.get("tier") if c["fd"] else "") or "").lower(), 0),
                              c["j"], c["lines_total"]))
    c = cands[0]
    v, fd, j = c["v"], c["fd"], c["j"]
    people_src = [Psrc[k] for k in Psrc if k.startswith("people.") or k == "team.size"]
    jsrc = [Psrc[k] for k in Psrc if k.startswith("judge")]
    lines = []
    if v is not None:
        lines.append({"item": f"venue: {v.x.get('name') or v.key}", "amount": c["v_cost"], "status": "chosen", "sources": [v.id]})
    if fd is not None:
        lines.append({"item": f"food: {fd.x.get('name') or fd.key}", "amount": c["f_cost"], "status": "chosen",
                      "sources": [fd.id] + ([Psrc["food.qty"]] if "food.qty" in Psrc else [])})
    if j and fee:
        lines.append({"item": "judge fees", "amount": c["fees"], "status": "chosen", "sources": jsrc})
    for e in committed:
        lines.append({"item": str(e.x.get("item") or e.key), "amount": primary(e) or 0, "status": "committed", "sources": [e.id]})
    optional = []
    for e in requested:
        amt = primary(e) or 0
        optional.append({"item": str(e.x.get("item") or e.key), "amount": amt, "sources": [e.id],
                         "fits": cap is None or c["lines_total"] + amt <= cap})
    for r in (f for f in fs if f.type == "request"):
        amt = to_num((r.x or {}).get("amount", (r.x or {}).get("price")))
        if amt is not None:
            optional.append({"item": str((r.x or {}).get("item") or (r.x or {}).get("name") or r.key), "amount": amt,
                             "sources": [r.id], "fits": cap is None or c["lines_total"] + amt <= cap})
    chunk = math.ceil(teams / j) if teams and j else 0
    assignments = []
    for i in range(j):
        a, b = i * chunk + 1, min((i + 1) * chunk, teams)
        if a <= teams:
            assignments.append({"judge": f"Judge {i + 1}", "teams": f"{a}-{b}" if b > a else f"{a}"})
    plan = {
        "feasible": True,
        "venue": ({"name": v.x.get("name") or v.key, "capacity": c["cap_v"], "cost": c["v_cost"],
                   "basis": v.x.get("basis", "flat"), "features": v.x.get("features") or [], "sources": [v.id]}
                  if v is not None else None),
        "people": {"students": students, "staff": staff, "judges": j, "other": extra, "total": c["people"],
                   "teams": teams, "sources": people_src},
        "food": ({"name": fd.x.get("name") or fd.key, "tier": fd.x.get("tier") or "default",
                  "per_head": c["per_head"], "qty": c["qty"], "cost": c["f_cost"],
                  "sources": [fd.id] + ([Psrc["food.qty"]] if "food.qty" in Psrc else [])}
                 if fd is not None else None),
        "judging": {"judges": j, "teams": teams, "teams_per_judge": c["tpj"], "max_teams_per_judge": max_teams,
                    "available": avail, "minutes_per_team": mpt, "window_minutes": c["judge_min"],
                    "fee": fee, "fees_total": c["fees"], "assignments": assignments, "sources": jsrc},
        "schedule": c["sched"],
        "schedule_meta": {"duration": duration, "start": P.get("event.start"), "total": c["total"],
                          "sources": [s for k, s in Psrc.items() if k.startswith("event.")] + [b.id for b in blocks]},
        "budget": {"cap": cap, "lines": lines, "total": c["lines_total"],
                   "remaining": (cap - c["lines_total"]) if cap is not None else None,
                   "optional": optional, "sources": [Psrc["budget.cap"]] if "budget.cap" in Psrc else []},
        "unsupported_constraints": unsupported,
    }
    return plan


def flatten(d, prefix="") -> dict:
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            if k in ("sources", "optional_sources"):
                continue
            out.update(flatten(v, f"{prefix}{k}."))
    elif isinstance(d, list):
        for i, v in enumerate(d):
            out.update(flatten(v, f"{prefix}{i}."))
    else:
        out[prefix[:-1]] = d
    return out


def diff_plans(old: dict, new: dict) -> list[dict]:
    a, b = flatten(old or {}), flatten(new or {})
    return [{"path": k, "old": a.get(k), "new": b.get(k)} for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]


def changed_areas(diff: list[dict]) -> list[str]:
    out = []
    for d in diff:
        top = d["path"].split(".")[0]
        top = {"schedule_meta": "schedule"}.get(top, top)
        if top in ("venue", "people", "food", "judging", "schedule", "budget") and top not in out:
            out.append(top)
    return out


# Which areas an input can touch (used for the impact forecast).
DEPENDS = {
    "people": ["people", "venue", "food", "judging", "schedule", "budget"],
    "team": ["people", "judging", "schedule", "budget"],
    "event": ["schedule"],
    "budget": ["budget", "venue", "food"],
    "judge": ["judging", "people", "schedule", "budget", "food", "venue"],
    "judges": ["judging", "people", "schedule", "budget", "food", "venue"],
    "food": ["food", "budget"],
    "venue_option": ["venue", "budget"],
    "food_option": ["food", "budget"],
    "expense": ["budget"],
    "block": ["schedule"],
    "constraint": ["venue", "food", "judging", "schedule", "budget"],
}


def forecast_areas(facts) -> list[str]:
    out = []
    for f in facts:
        if f.type == "param":
            k = DEPENDS.get(f.key.split(".")[0], ["people", "venue", "food", "judging", "schedule", "budget"])
        elif f.type == "option":
            k = DEPENDS["venue_option"] if _cat(f) == "venue" else DEPENDS["food_option"]
        elif f.type in DEPENDS:
            k = DEPENDS[f.type]
        else:
            k = []
        for a in k:
            if a not in out:
                out.append(a)
    return out
