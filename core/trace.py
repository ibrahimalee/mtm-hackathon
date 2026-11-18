"""Trace recorder + rich terminal printer. Writes out/trace.txt."""
from __future__ import annotations

import os
import sys
import time

from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .schema import CALL_AREAS

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
console = Console(highlight=False)

EVENT_STYLE = {"retry": "yellow", "info": "cyan", "reject": "red", "convert": "yellow", "warn": "yellow", "ok": "green"}
SHOW_CHARS = 900


class Trace:
    def __init__(self, data: dict | None = None):
        self.data = data or {"runs": [], "grand_total_tokens": 0}
        self.run: dict | None = None

    def start_run(self, run_id: str, mode: str, source: str) -> None:
        self.run = {"run_id": run_id, "mode": mode, "file": source, "calls": [], "events": [],
                    "total_tokens": 0, "started": time.time()}
        self.data["runs"].append(self.run)
        console.rule(f"[bold]Muntazim[/bold]  run {run_id}  ({mode})")

    def _n(self) -> int:
        return sum(len(r["calls"]) for r in self.data["runs"]) + 1

    def call(self, model: str, area: str, input: str, output: str, usage: dict, ms: int) -> int:
        assert area in CALL_AREAS, f"bad area tag {area}"
        n = self._n()
        tok = {"prompt": usage["prompt_tokens"], "completion": usage["completion_tokens"], "total": usage["total_tokens"]}
        self.run["calls"].append({"n": n, "model": model, "area": area, "input": input, "output": output,
                                  "tokens": tok, "ms": ms})
        self.run["total_tokens"] += tok["total"]
        self.data["grand_total_tokens"] += tok["total"]
        body = Text()
        body.append("input  ", style="dim")
        body.append(_cut(input) + "\n")
        body.append("output ", style="dim")
        body.append(_cut(output))
        console.print(Panel(body, title=escape(f"call #{n} · {model} · [{area}]"),
                            subtitle=f"prompt {tok['prompt']} + completion {tok['completion']} = {tok['total']} tokens · {ms} ms",
                            border_style="blue"))
        return n

    def event(self, kind: str, text: str) -> None:
        self.run["events"].append({"kind": kind, "text": text})
        console.print(Text(f"  · {text}", style=EVENT_STYLE.get(kind, "white")))

    def end_run(self) -> int:
        r = self.run
        r["duration_s"] = round(time.time() - r.pop("started"), 1)
        console.print(Text(f"  run total: {r['total_tokens']} tokens in {len(r['calls'])} call(s), {r['duration_s']} s   "
                           f"(all runs: {self.data['grand_total_tokens']} tokens)", style="bold"))
        return r["total_tokens"]


def _cut(s: str) -> str:
    return s if len(s) <= SHOW_CHARS else s[:SHOW_CHARS] + f"\n… ({len(s) - SHOW_CHARS} more chars, full text in out/trace.txt)"


def render_text(trace: dict) -> str:
    out = []
    for r in trace["runs"]:
        out.append(f"=== run {r['run_id']} ({r.get('mode', '')}) file={r.get('file', '')} ===")
        for c in r["calls"]:
            out.append(f"--- call #{c['n']} model={c['model']} area={c['area']} "
                       f"tokens prompt={c['tokens']['prompt']} completion={c['tokens']['completion']} total={c['tokens']['total']} ms={c['ms']}")
            out.append("INPUT:\n" + c["input"])
            out.append("OUTPUT:\n" + c["output"])
        for e in r["events"]:
            out.append(f"[{e['kind']}] {e['text']}")
        out.append(f"run total tokens: {r['total_tokens']}  duration: {r.get('duration_s', '?')} s")
        out.append("")
    out.append(f"GRAND TOTAL TOKENS: {trace['grand_total_tokens']}")
    return "\n".join(out)


def write_trace(trace: dict, folder: str = "out") -> None:
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "trace.txt"), "w", encoding="utf-8") as fh:
        fh.write(render_text(trace))


# ---------------------------------------------------------------- terminal views
def _money(v) -> str:
    return "-" if v is None else f"{v:,.0f}" if isinstance(v, (int, float)) else str(v)


def print_plan(plan: dict) -> None:
    if not plan.get("feasible"):
        console.print(Panel("No valid plan: " + "; ".join(r["msg"] for r in plan.get("reasons", [])) or "insufficient facts",
                            border_style="red", title="plan"))
        return
    t = Table(title="Plan", show_lines=False, header_style="bold")
    t.add_column("area"); t.add_column("detail")
    v, p, f, j = plan.get("venue"), plan["people"], plan.get("food"), plan["judging"]
    t.add_row("venue", f"{v['name']} · seats {v['capacity']} · cost {_money(v['cost'])}" if v else "none")
    t.add_row("people", f"{p['total']} on site = {p['students']} students + {p['staff']} staff + {p['judges']} judges"
              + (f" + {p['other']} other" if p["other"] else "") + f" · {p['teams']} teams")
    t.add_row("food", f"{f['name']} ({f['tier']}) · {f['qty']} meals · cost {_money(f['cost'])}" if f else "none")
    t.add_row("judging", f"{j['judges']} judges · {j['teams_per_judge']} teams each · window {j['window_minutes']} min · "
              + ", ".join(f"{a['judge']}: teams {a['teams']}" for a in j["assignments"]))
    console.print(t)
    s = Table(title="Schedule", header_style="bold")
    for c in ("start", "end", "min", "block"):
        s.add_column(c)
    for b in plan["schedule"]:
        s.add_row(b["start"], b["end"], str(b["minutes"]), b["label"])
    console.print(s)
    b = plan["budget"]
    bt = Table(title="Budget", header_style="bold")
    bt.add_column("item"); bt.add_column("amount", justify="right"); bt.add_column("status"); bt.add_column("sources")
    for l in b["lines"]:
        bt.add_row(l["item"], _money(l["amount"]), l["status"], ",".join(l["sources"]))
    bt.add_row("[bold]total[/bold]", f"[bold]{_money(b['total'])}[/bold]", f"cap {_money(b['cap'])}", f"remaining {_money(b['remaining'])}")
    console.print(bt)
    for o in b["optional"]:
        console.print(f"  optional (not counted): {o['item']} {_money(o['amount'])} — {'fits' if o['fits'] else 'does not fit'}")
    for u in plan.get("unsupported_constraints", []):
        console.print(Text(f"  unsupported constraint kept visible: {u['metric']} — \"{u['quote']}\"", style="yellow"))


def print_audit(audit: list[dict]) -> None:
    ok = sum(1 for a in audit if a["pass"])
    for a in audit:
        console.print(Text(f"  {'✓' if a['pass'] else '✗'} {a['check']}: {a['detail']}", style="green" if a["pass"] else "red"))
    console.print(Text(f"  audit {ok}/{len(audit)}", style="bold"))


def print_rejections(rejs: list) -> None:
    for r in rejs:
        console.print(Panel(Text(f"“{r.quote}”\nrule {r.rule_id} · {r.failed_check}\n{r.reason}\n\nDrafted reply: {r.drafted_reply}"),
                            title=f"rejected {r.fact_id} from {r.msg_id}", border_style="red"))


def print_changes(ch: dict) -> None:
    if not ch:
        return
    console.print(Text(f"  forecast areas: {', '.join(ch.get('forecast', [])) or '-'}", style="cyan"))
    console.print(Text(f"  changed areas:  {', '.join(ch.get('recomputed', [])) or 'none'}", style="cyan"))
    console.print(Text(f"  unchanged:      {', '.join(ch.get('unchanged', [])) or '-'}", style="dim"))
    for d in ch.get("diff", [])[:25]:
        console.print(Text(f"    {d['path']}: {d['old']} → {d['new']}", style="yellow"))


def print_rules(rules: list[dict]) -> None:
    if not rules:
        return
    t = Table(title="Rulebook (compiled from messages + invariants)", header_style="bold")
    for c in ("id", "kind", "rule", "slack", "status", "source"):
        t.add_column(c)
    for r in rules:
        src = r["source"] if isinstance(r["source"], str) else f"{r['source']['msg_id']} {r['source']['sender']}"
        st = {"holds": "[green]holds[/green]", "violated": "[red]violated[/red]"}.get(r["status"], f"[yellow]{r['status']}[/yellow]")
        t.add_row(r["id"], r["kind"], r["expr"], "-" if r["slack"] is None else str(r["slack"]), st, src)
        for rf in r["rejected"]:
            t.add_row("", "[red]rejected[/red]", f"[strike]{rf['quote']}[/strike] ({rf['fact_id']})", "", "[red]blocked[/red]", rf["reason"][:60])
    console.print(t)


def print_margins(m: dict) -> None:
    if not m:
        return
    t = Table(title="Margins: how far each input can move", header_style="bold")
    for c in ("input", "current", "changes at", "breaks at", "direction", "affects"):
        t.add_column(c)
    for b in m.get("breaking_points", []):
        t.add_row(b["input"], str(b["current"]), "-" if b["changes_at"] is None else str(b["changes_at"]),
                  "-" if b["breaks_at"] is None else str(b["breaks_at"]), b["direction"], ",".join(b["affects"]))
    console.print(t)
    near = [s["rule"] for s in m.get("slack", []) if s["near"]]
    if near:
        console.print(Text(f"  near their limit (within 10%): {', '.join(near)}", style="yellow"))


def print_attack(a: dict) -> None:
    if not a:
        return
    t = Table(title=f"Red team: {a['matched']}/{a['total']} mutations got the expected verdict", header_style="bold")
    for c in ("operator", "expected", "matched"):
        t.add_column(c)
    for op, v in a["by_operator"].items():
        t.add_row(op, v["expected"], f"{v['matched']}/{v['total']}")
    console.print(t)
    for e in a["examples"]:
        if not e["match"]:
            console.print(Text(f"  MISMATCH {e['operator']}: expected {e['expected']}, got {e['got']}", style="red"))
    console.print(Text("  Attacks mutate extracted facts. They test the gatekeeper and solver, not the reader.", style="dim"))
