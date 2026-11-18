"""Deterministic red team: mutate active facts, run each through the gatekeeper, compare with the expected verdict.
Attacks mutate extracted facts. They test the gatekeeper and solver, not the reader."""
from __future__ import annotations

import datetime
import sys

from .gatekeeper import evaluate
from .ledger import Ledger, primary
from .schema import RANK, Fact
from .margins import _first_true
from .solver import solve

REJECT_OPS = ["stale_date", "authority_swap", "ungrounded_number", "below_headcount_quantity", "remove_required_block",
              "exceed_judge_cap", "infeasible_budget_cut", "false_approval", "bad_total"]
ACCEPT_OPS = ["legit_price_rise_within_budget", "legit_newer_update"]
PER_OP = 2  # policy: at most this many instances per operator, enough to be a sample without being slow
LOWER = ["individual", "participant_group", "other"]


def _shift(date: str | None, days: int) -> str | None:
    if date and date.startswith("0000-"):  # year unknown: shift inside a leap year, keep the placeholder year
        try:
            d = datetime.date.fromisoformat("2000" + date[4:]) + datetime.timedelta(days=days)
            return "0000-01-01" if d.year < 2000 else "0000" + d.isoformat()[4:]
        except ValueError:
            return None
    try:
        return (datetime.date.fromisoformat(date) + datetime.timedelta(days=days)).isoformat() if date else None
    except ValueError:
        return None


def mutations(facts, plan: dict):
    """Yield (operator, expected, fact, extra_corpus_text)."""
    act = [f for f in facts if f.status == "active"]
    latest = max([f.date for f in act if f.date] or [None], default=None)
    n = [0]

    def mk(base: Fact, **kw) -> Fact:
        n[0] += 1
        g = base.model_copy(deep=True)
        g.id = f"X{n[0]}"
        g.supersedes = g.superseded_by = g.up = g.cx = None
        g.status = "active"
        for k, v in kw.items():
            setattr(g, k, v)
        return g

    def synth(base: Fact, **kw) -> Fact:
        return mk(base, role="organizer_authority", sender="attacker", date=latest, **kw)

    core = [f for f in act if f.type in ("param", "option", "expense")]
    for f in [f for f in core if f.date][:PER_OP]:
        yield "stale_date", "reject", mk(f, date=_shift(f.date, -30)), ""
    for f in [f for f in core if RANK.get(f.role, 0) > 0][:PER_OP]:
        lower = next(r for r in LOWER if RANK[r] < RANK[f.role])
        yield "authority_swap", "reject", mk(f, role=lower, sender="attacker"), ""
    for f in core[:PER_OP]:
        g = mk(f)
        if f.type == "param" and isinstance(primary(f), (int, float)):
            g.value = primary(f) + 7
        elif f.type == "option" and isinstance(primary(f), (int, float)):
            g.x["price"] = primary(f) + 7
        elif f.type == "expense" and isinstance(primary(f), (int, float)):
            g.x["amount"] = primary(f) + 7
        else:
            continue
        yield "ungrounded_number", "reject", g, ""
    if plan.get("feasible") and plan.get("food") and plan["people"]["total"] > 1:
        q = plan["people"]["total"] - 1
        base = next((f for f in act if f.type == "param"), None)
        if base:
            text = f"food.qty {q}"
            yield "below_headcount_quantity", "reject", synth(base, key="food.qty", value=q, quote=text, x={}), text
    for b in [f for f in act if f.type == "block"][:PER_OP]:
        name = str(b.x.get("name") or b.key)
        text = f"schedule.blocks excludes {name}"
        yield "remove_required_block", "reject", synth(b, type="constraint", key="schedule.blocks", value=None, quote=text,
                                                       x={"metric": "schedule.blocks", "op": "excludes", "value": name}), text
    mt = next((f for f in act if f.type == "param" and f.key == "judge.max_teams"), None)
    if mt and isinstance(primary(mt), (int, float)):
        val = primary(mt) + 1
        text = f"judging.teams_per_judge >= {val}"
        yield "exceed_judge_cap", "reject", synth(mt, type="constraint", key="judging.teams_per_judge", value=None, quote=text,
                                                   x={"metric": "judging.teams_per_judge", "op": ">=", "value": val}), text
    cap = next((f for f in act if f.type == "param" and f.key == "budget.cap"), None)
    if cap and plan.get("feasible") and isinstance(primary(cap), (int, float)):
        val = _first_true(lambda v: not solve(facts, overrides={cap.id: v})["feasible"], int(primary(cap)), -1)
        if val is not None:
            yield "infeasible_budget_cut", "reject", synth(cap, value=val, quote=f"budget.cap {val}"), f"budget.cap {val}"
    anchor = next((f for f in act if f.type == "expense"), None) or (act[0] if act else None)
    if anchor:
        text = "approved item 2"
        g = mk(anchor, type="expense", key="x-approval", role="venue_vendor", sender="attacker", date=latest,
               quote=text, x={"item": "x-approval", "amount": 2, "status": "committed"}, value=2)
        yield "false_approval", "reject", g, text
        text = "1 + 2 total 2"
        g = synth(anchor, type="expense", key="x-total", quote=text, value=2,
                  x={"item": "x-total", "amount": 2, "status": "committed", "parts": [1, 2]})
        yield "bad_total", "reject", g, text
    # accept-expected
    if plan.get("feasible"):
        rem = plan["budget"]["remaining"]
        people = plan["people"]["total"]
        chosen = [a for a in act if a.id in ((plan.get("venue") or {}).get("sources", [])[:1] + (plan.get("food") or {}).get("sources", [])[:1])]
        for o in chosen[:PER_OP]:
            price = primary(o)
            if not isinstance(price, (int, float)):
                continue
            per_head = o.x.get("basis", "per_head" if o.x.get("category") == "food" else "flat") == "per_head"
            if rem is None:
                delta = 1
            else:
                delta = rem // (2 * people) if per_head else rem // 2
            if delta < 1:
                continue
            g = mk(o, date=latest)
            g.x["price"] = price + delta
            text = " ".join(f"{k} {g.x[k]}" for k in ("price", "capacity", "qty") if isinstance(g.x.get(k), (int, float)))
            g.quote = text
            yield "legit_price_rise_within_budget", "accept", g, text
        pool = [a for a in act if a.type in ("param", "expense")]
        capf = next((a for a in pool if a.key == "budget.cap"), None)
        if capf and isinstance(primary(capf), (int, float)):
            v = primary(capf) + 1
            yield "legit_newer_update", "accept", mk(capf, value=v, date=latest, quote=f"budget.cap {v}"), f"budget.cap {v}"
        else:
            e = next((a for a in pool if a.type == "expense" and isinstance(primary(a), (int, float)) and primary(a) > 1), None)
            if e:
                v = primary(e) - 1
                g = mk(e, date=latest, quote=f"amount {v}")
                g.x["amount"] = v
                yield "legit_newer_update", "accept", g, f"amount {v}"


def run(facts, messages_text: str, plan: dict, disabled=frozenset()) -> dict:
    ledger = Ledger([f for f in facts])
    active = ledger.active()
    by_op = {op: {"total": 0, "matched": 0, "expected": "reject" if op in REJECT_OPS else "accept"}
             for op in REJECT_OPS + ACCEPT_OPS}
    examples, total, matched = [], 0, 0
    for op, expected, f, extra in mutations(facts, plan):
        v = evaluate(active, f, ledger, messages_text + "\n" + extra, disabled, all_facts=True)
        got = "reject" if (not v["ok"] or v.get("convert")) else "accept"
        ok = got == expected
        total += 1
        matched += ok
        by_op[op]["total"] += 1
        by_op[op]["matched"] += ok
        if len(examples) < 14:
            examples.append({"operator": op, "expected": expected, "got": got, "match": ok, "fact": f"{f.type} {f.key}",
                             "rule": v.get("rule_id"), "reason": v.get("reason", "")})
    return {"total": total, "matched": matched, "by_operator": {k: v for k, v in by_op.items() if v["total"]},
            "examples": examples}


def main() -> int:
    from core.schema import State
    from core.trace import print_attack
    try:
        st = State.model_validate_json(open("state/state.json", encoding="utf-8").read())
    except FileNotFoundError:
        print("no state/ yet; run python run.py <file> first")
        return 1
    print_attack(run(st.facts, "\n".join(m.text for m in st.messages), st.plan))
    return 0


if __name__ == "__main__":
    sys.exit(main())
