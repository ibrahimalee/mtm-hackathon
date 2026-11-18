"""python run.py <path-to-txt>  - no state/ means a full run; existing state/ means the file holds new message(s)."""
from __future__ import annotations

import datetime
import os
import sys
import time

from core import attack, gatekeeper, margins, reader, rules
from core.audit import audit
from core.ledger import Ledger
from core.llm import LLM, LLMError, load_env
from core.schema import AREAS, State
from core.solver import changed_areas, diff_plans, forecast_areas, solve
from core.trace import (Trace, console, print_attack, print_audit, print_changes, print_margins, print_plan,
                        print_rejections, print_rules, write_trace)

STATE_PATH = os.path.join("state", "state.json")
MAX_FULL_S, MAX_UPDATE_S, MAX_UPDATE_CALLS = 120, 60, 5


def load_state() -> State | None:
    if os.path.exists(STATE_PATH):
        return State.model_validate_json(open(STATE_PATH, encoding="utf-8").read())
    return None


def save_state(state: State) -> None:
    os.makedirs("state", exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(state.model_dump_json(indent=1))
    os.replace(tmp, STATE_PATH)


def message_status(state: State) -> None:
    for m in state.messages:
        fs = [f for f in state.facts if f.msg_id == m.id]
        if not fs:
            m.status = "ignored"
        elif any(f.status in ("active", "duplicate") for f in fs):
            m.status = "used"
        elif all(f.status == "rejected" for f in fs):
            m.status = "rejected"
            m.reason = next((r.reason for r in state.rejections if r.msg_id == m.id), m.reason)
        else:
            m.status = "superseded"


def write_plan_md(state: State) -> None:
    from core.trace import _money
    p, L = state.plan, []
    L.append(f"# Event plan (run {state.run_id})\n")
    if p.get("feasible"):
        v, pe, f, j, b = p.get("venue"), p["people"], p.get("food"), p["judging"], p["budget"]
        L.append(f"- Venue: {v['name']} (seats {v['capacity']}, cost {_money(v['cost'])})" if v else "- Venue: none")
        L.append(f"- People on site: {pe['total']} ({pe['students']} students, {pe['staff']} staff, {pe['judges']} judges"
                 + (f", {pe['other']} other" if pe['other'] else "") + f"); {pe['teams']} teams")
        L.append(f"- Food: {f['name']} ({f['tier']}), {f['qty']} meals, cost {_money(f['cost'])}" if f else "- Food: none")
        L.append(f"- Judging: {j['judges']} judges at {_money(j['fee'])} each = {_money(j['fees_total'])}, "
                 f"{j['teams_per_judge']} teams each, window {j['window_minutes']} min")
        for a in j["assignments"]:
            L.append(f"  - {a['judge']}: teams {a['teams']}")
        L.append("\n## Schedule\n\n| start | end | minutes | block |\n|---|---|---|---|")
        L += [f"| {s['start']} | {s['end']} | {s['minutes']} | {s['label']} |" for s in p["schedule"]]
        L.append("\n## Budget\n\n| item | amount | status | sources |\n|---|---|---|---|")
        L += [f"| {l['item']} | {_money(l['amount'])} | {l['status']} | {', '.join(l['sources'])} |" for l in b["lines"]]
        L.append(f"| **total** | **{_money(b['total'])}** | cap {_money(b['cap'])} | remaining {_money(b['remaining'])} |")
        if b["cap"] is not None:
            fits = b["total"] <= b["cap"]
            L.append(f"\nBudget: total {_money(b['total'])} against {_money(b['cap'])}. "
                     + ("It fits." if fits else f"It does NOT fit, over by {_money(b['total'] - b['cap'])}."))
        for o in b["optional"]:
            L.append(f"\nOptional, not counted: {o['item']} {_money(o['amount'])} ({'fits' if o['fits'] else 'does not fit'})")
        for u in p.get("unsupported_constraints", []):
            L.append(f"\nUnsupported constraint (kept visible): {u['metric']} - \"{u['quote']}\"")
    else:
        L.append("No valid plan.")
    run = (state.trace.get("runs") or [{}])[-1]
    L.append("\n## Trace\n")
    for c in run.get("calls", []):
        L.append(f"- call #{c['n']} | {c['model']} | {c['area']}: reading the messages | {c['tokens']['total']} tokens")
    L.append(f"- total: {len(run.get('calls', []))} call(s), {run.get('total_tokens', 0)} tokens")
    L.append("\n## Audit\n")
    L += [f"- [{'x' if a['pass'] else ' '}] {a['check']}: {a['detail']}" for a in state.audit]
    if state.rules:
        L.append("\n## Rulebook\n\n| id | kind | area | rule | slack | status | source |\n|---|---|---|---|---|---|---|")
        for r in state.rules:
            src = r["source"] if isinstance(r["source"], str) else f"{r['source']['msg_id']} {r['source']['sender']}: \"{r['source']['quote']}\""
            L.append(f"| {r['id']} | {r['kind']} | {r['area']} | {r['expr']} | {r['slack']} | {r['status']} | {src} |")
            for rf in r.get("rejected", []):
                L.append(f"|  | rejected | | ~~{rf['quote']}~~ ({rf['fact_id']}) | | blocked | {rf['reason']} |")
    if state.margins:
        L.append("\n## Margins\n\n| input | current | changes at | breaks at | direction |\n|---|---|---|---|---|")
        for m in state.margins.get("breaking_points", []):
            L.append(f"| {m['input']} | {m['current']} | {m['changes_at']} | {m['breaks_at']} | {m['direction']} |")
    if state.attack:
        a = state.attack
        L.append(f"\n## Red team\n\n{a['matched']}/{a['total']} mutations got the expected verdict.")
        for op, v in a.get("by_operator", {}).items():
            L.append(f"- {op}: {v['matched']}/{v['total']}")
    L.append("\n## Rejected messages\n")
    for r in state.rejections:
        L.append(f"- {r.fact_id} from {r.msg_id} [{r.rule_id}] \"{r.quote}\" - {r.reason}\n  - Drafted reply: {r.drafted_reply}")
    if not state.rejections:
        L.append("None.")
    os.makedirs("out", exist_ok=True)
    open(os.path.join("out", "plan.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python run.py <path-to-txt>")
        return 2
    path = sys.argv[1]
    if not os.path.isfile(path):
        print(f"file not found: {path}")
        return 2
    load_env()
    raw = open(path, "rb").read().decode("utf-8-sig", errors="replace")
    prev = load_state()
    state = prev or State()
    mode = "update" if prev else "full"
    step = len(state.steps) + 1
    run_id = f"R{step}-{datetime.datetime.now().strftime('%H%M%S')}"
    trace = Trace(state.trace)
    trace.start_run(run_id, mode, os.path.basename(path))
    t0 = time.time()
    try:
        llm = LLM(trace)
        ledger = Ledger(state.facts)
        msgs, facts = reader.read(llm, trace, raw, ledger.active() if prev else None,
                                  len(state.messages) + 1, int(ledger.next_id()[1:]), step)
    except LLMError as e:
        trace.event("reject", f"model step failed: {e}. State was not changed.")
        trace.end_run()
        return 1

    old_plan = state.plan
    state.messages.extend(msgs)
    rejs = gatekeeper.process(ledger, facts, {m.id: m.pos or 0 for m in msgs}, raw, step, trace)
    state.rejections.extend(rejs)
    message_status(state)
    plan = solve(ledger.active())
    if not plan["feasible"] and old_plan.get("feasible"):
        trace.event("reject", "no valid plan after this update; keeping the previous plan")
        plan = old_plan
    changed = [f for f in ledger.facts if f.step == step and f.status == "active"]
    if prev and old_plan.get("feasible") and plan.get("feasible"):
        d = diff_plans(old_plan, plan)
        rec = changed_areas(d)
        state.changes = {"forecast": forecast_areas(changed), "recomputed": rec,
                         "unchanged": [a for a in AREAS if a not in rec], "diff": d}
    else:
        state.changes = {}
    state.plan = plan
    state.audit = audit(ledger.active(), plan)
    state.rules = rules.compile_rules(ledger.facts, plan, state.rejections)
    state.margins = margins.compute(ledger.facts, plan, state.rules)
    state.attack = attack.run(ledger.facts, "\n".join(m.text for m in state.messages), plan)
    state.steps.append({"step": step, "file": os.path.basename(path), "msg_ids": [m.id for m in msgs]})
    state.run_id, state.updated_at = run_id, datetime.datetime.now().isoformat(timespec="seconds")

    print_rejections(rejs)
    print_plan(plan)
    print_changes(state.changes)
    print_audit(state.audit)
    print_rules(state.rules)
    print_margins(state.margins)
    print_attack(state.attack)
    n_calls = len(trace.run["calls"])
    secs = time.time() - t0
    if (mode == "full" and secs > MAX_FULL_S) or (mode == "update" and (secs > MAX_UPDATE_S or n_calls > MAX_UPDATE_CALLS)):
        trace.event("warn", f"limit exceeded: {n_calls} calls, {secs:.0f} s")
    trace.end_run()
    state.trace = trace.data
    save_state(state)
    write_plan_md(state)
    write_trace(trace.data)
    console.print("  wrote out/plan.md and out/trace.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
