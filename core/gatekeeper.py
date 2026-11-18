"""Gatekeeper: grounding, recency, authority, hard rules, consistency, conflict, trial replan. First failure rejects."""
from __future__ import annotations

import re

from .ledger import Ledger, identity, primary, same_identity
from .numbers import find_numbers, quote_has_number, to_num
from .schema import RANK, Fact, Rejection
from .solver import STRUCTURAL, solve

ALL_GATES = ["grounding", "recency", "authority", "hard", "consistency", "conflict", "trial"]

# Policy: which kinds of facts each role may set. Unfamiliar roles ('other') get everything except money.
DOMAINS = {
    "organizer_authority": {"people", "event", "judging", "budget", "venue_option", "food_option", "misc", "request"},
    "finance": {"budget", "misc", "request"},
    "judging": {"judging", "misc", "request"},
    "venue_vendor": {"venue_option", "request"},
    "food_vendor": {"food_option", "request"},
    "participant_group": {"request"},
    "individual": {"request"},
    "other": {"misc", "request"},  # an unrecognised sender is believed on general facts only; anything else waits as a request
}


def domain(f: Fact) -> str:
    x = f.x or {}
    if f.type == "request":
        return "request"
    if f.type == "expense":
        return "budget"
    if f.type == "block":
        return "event"
    if f.type == "option":
        return {"venue": "venue_option", "food": "food_option"}.get(str(x.get("category", "")).lower(), "misc")
    k = f.key if f.type == "param" else str(x.get("metric") or f.key)
    head = k.split(".")[0]
    if head == "budget":
        return "budget"
    if head in ("judge", "judges", "judging"):
        return "judging"
    if head in ("people", "team"):
        return "people"
    if head in ("event", "schedule"):
        return "event"
    if head in ("venue", "food"):
        return "misc"
    return "misc"


def _dkey(d: str | None, month_day_only: bool) -> str:
    return (d or "")[5:] if month_day_only and d else (d or "")


def _older(a: str | None, b: str | None) -> bool:
    """True when date a is before date b. A year of 0000 means unknown, so only month and day are compared then."""
    if not a or not b:
        return False
    if a.startswith("0000") or b.startswith("0000"):
        return a[5:] < b[5:]
    return a < b


def _what(f: Fact) -> str:
    return f"{f.type} '{f.key}'"


def _numeric_fields(f: Fact) -> list:
    out = []
    if f.type == "param" and to_num(f.value) is not None:
        out.append(to_num(f.value))
    x = f.x or {}
    for k in ("price", "amount", "minutes", "capacity", "qty"):
        if isinstance(x.get(k), (int, float)) and not isinstance(x.get(k), bool):
            out.append(x[k])
    if f.type == "constraint" and isinstance(x.get("value"), (int, float)) and not isinstance(x.get("value"), bool):
        out.append(x["value"])
    for p in x.get("parts") or []:
        if isinstance(p, (int, float)):
            out.append(p)
    return out


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def draft_reply(f: Fact, rule: str, reason: str, ctx: dict) -> str:
    who = f.sender or "there"
    if rule == "R-GROUND":
        return (f"Hi {who}, we could not match \"{f.quote}\" to the original text of your message, so it was not applied. "
                "Please resend the exact figure.")
    if rule == "R-STALE":
        return (f"Hi {who}, your message was not applied: we already hold a newer {_what(f)} dated {ctx.get('other_date')} "
                f"(value {ctx.get('other_value')}). Please confirm if that is out of date.")
    if rule == "R-AUTH":
        return (f"Hi {who}, {_what(f)} is set by {ctx.get('owner_role', 'another role')} and a {f.role} message cannot change it. "
                "Please ask them to confirm and we will update the plan.")
    if rule == "R-TOTAL":
        return (f"Hi {who}, the total you stated ({ctx.get('stated')}) does not equal its parts ({ctx.get('computed')}). "
                "Please resend the correct figure.")
    if rule == "R-CONFLICT":
        return (f"Hi {who}, your {_what(f)} conflicts with {ctx.get('other_id')} held from {ctx.get('owner_role')} ({ctx.get('other_value')}). "
                "We kept the existing value; please confirm which is correct.")
    return (f"Hi {who}, we could not apply {_what(f)}: {reason}. Please confirm or send a feasible alternative.")


def evaluate(active: list[Fact], f: Fact, ledger: Ledger, corpus: str | None, disabled=frozenset(), all_facts=None) -> dict:
    """Pure verdict. Returns {ok, rule_id, check, reason, ctx, convert, supersede:[ids], duplicate_of}."""
    def bad(rule, check, reason, ctx=None):
        return {"ok": False, "rule_id": rule, "check": check, "reason": reason, "ctx": ctx or {}, "supersede": []}

    # 1 grounding
    if "grounding" not in disabled and corpus is not None:
        if f.quote and _norm(f.quote) not in _norm(corpus):
            return bad("R-GROUND", "grounding", "the quoted text is not in the original messages")
        if f.type != "request":
            miss = [n for n in _numeric_fields(f) if not quote_has_number(f.quote, n)]
            if miss:
                return bad("R-GROUND", "grounding", f"number(s) {miss} cannot be recovered from the quote")
        if not f.quote and f.type != "request":
            return bad("R-GROUND", "grounding", "no supporting quote")

    existing = ledger.find_existing(f) if f.type != "request" else None
    if existing is None and all_facts is not None and f.type != "request":
        ident = identity(f)
        existing = next((e for e in active if e.id != f.id and same_identity(identity(e), ident)), None) if ident else None
    ctx = {}
    inherit = {}
    if existing and f.type in ("option", "expense", "block"):
        inherit = {k: v for k, v in existing.x.items() if k not in f.x and k != "parts"}
        f = f.model_copy(update={"x": {**inherit, **f.x}})  # a partial update keeps the attributes it does not restate
    if existing:
        ctx = {"other_date": existing.date, "other_value": primary(existing), "owner_role": existing.role, "other_id": existing.id}

    # 2 recency
    if "recency" not in disabled and existing and _older(f.date, existing.date):
        return bad("R-STALE", "recency", f"a newer fact {existing.id} dated {existing.date} already exists (this one is dated {f.date})", ctx)

    # 3 ownership / authority
    convert = None
    if "authority" not in disabled and f.type != "request":
        dom, role = domain(f), f.role
        allowed = dom in DOMAINS.get(role, DOMAINS["other"])
        if f.type == "expense" and str((f.x or {}).get("status", "committed")).lower() != "requested" and dom not in DOMAINS.get(role, set()):
            convert = "claimed approval from a role that cannot approve spending"
        elif existing and RANK.get(role, 0) < RANK.get(existing.role, 0):
            return bad("R-AUTH", "authority", f"{role} ranks below {existing.role}, which owns {existing.id}", ctx)
        elif not allowed:
            if role in ("participant_group", "individual", "other"):
                convert = f"{role} can only make requests, not set {dom} facts"
            else:
                return bad("R-AUTH", "authority", f"{role} may not set {dom} facts", ctx)
    if convert:
        return {"ok": True, "convert": convert, "rule_id": "R-AUTH", "check": "authority", "reason": convert,
                "ctx": ctx, "supersede": []}
    if f.type == "request":
        return {"ok": True, "convert": None, "supersede": [], "ctx": ctx}

    # duplicate confirmation (same value, same identity)
    if existing and primary(existing) == primary(f) and existing.x.get("status") == f.x.get("status"):
        return {"ok": True, "convert": None, "supersede": [], "ctx": ctx, "duplicate_of": existing.id}

    trial = [a for a in active if not existing or a.id != existing.id] + [f]

    # 4 hard rules (structural), checked on the trial set
    before = [a for a in active if not existing or a.id != existing.id]
    if "hard" not in disabled:
        loose = frozenset(disabled) | {"budget", "capacity", "constraints"}
        r0 = solve(before, disabled=loose)
        base_codes = {x["code"] for x in r0.get("reasons", [])} if not r0["feasible"] else set()
        r = solve(trial, disabled=loose)
        if not r["feasible"]:
            s = [x for x in r["reasons"] if x["code"] in STRUCTURAL and x["code"] not in base_codes]
            if s:
                return bad(f"R-HARD-{s[0]['code']}", "hard rules", s[0]["msg"], ctx)

    # 5 internal consistency
    parts = (f.x or {}).get("parts")
    tot = primary(f)
    given = bool(parts)
    if not parts and f.type in ("expense", "param") and isinstance(tot, (int, float)) and re.search(r"total|altogether|overall|sum", f"{f.key} {f.quote}", re.I):
        others = [n.value for n in sorted(find_numbers(f.quote or "", skip_dates=False), key=lambda n: n.start) if n.value != tot]
        parts = others if len(others) >= 2 else None  # a total quoted beside its parts is checked against them
    if isinstance(parts, list) and parts and all(isinstance(p, (int, float)) for p in parts) and isinstance(tot, (int, float)):
        if abs(sum(parts) - tot) > 0.5:
            if "consistency" not in disabled:
                return bad("R-TOTAL", "consistency", f"stated {tot} but its parts add up to {sum(parts)}",
                           {"stated": tot, "computed": sum(parts)})
        elif not given and f.type == "expense":
            return {"ok": True, "convert": None, "supersede": [], "ctx": ctx, "duplicate_of": "its own parts (a matching total is only a check)"}

    # 6 model-flagged contradiction
    sup = [existing.id] if existing else []
    cx = ledger.get(f.cx) if f.cx else None
    if "conflict" not in disabled and cx and cx.status == "active" and (not existing or cx.id != existing.id):
        cctx = {"other_id": cx.id, "owner_role": cx.role, "other_value": primary(cx), "other_date": cx.date}
        if RANK.get(f.role, 0) > RANK.get(cx.role, 0):
            sup.append(cx.id)
        elif RANK.get(f.role, 0) < RANK.get(cx.role, 0):
            return bad("R-CONFLICT", "conflict", f"contradicts {cx.id} owned by higher-ranked {cx.role}", cctx)
        elif _older(cx.date, f.date):
            sup.append(cx.id)
        elif _older(f.date, cx.date):
            return bad("R-CONFLICT", "conflict", f"contradicts newer {cx.id}", cctx)
        else:
            return bad("R-CONFLICT", "conflict", f"contradicts {cx.id} with equal rank and date; kept the existing fact", cctx)
        trial = [a for a in trial if a.id not in sup]

    # 7 trial replan
    if "trial" not in disabled:
        r = solve(trial, disabled=disabled)
        # only a change that turns a workable plan into an impossible one is rejected; a plan still being assembled stays open
        if not r["feasible"] and r.get("reasons") and solve(before, disabled=disabled)["feasible"]:
            c = r["reasons"][0]
            return bad(f"R-HARD-{c['code']}", "trial replan", f"no valid plan with this change: {c['msg']}", ctx)
    return {"ok": True, "convert": None, "supersede": sup, "ctx": ctx, "inherit": inherit}


def process(ledger: Ledger, incoming: list[Fact], msg_pos: dict, corpus: str, step: int, trace, disabled=frozenset()):
    """Apply incoming facts in chronological order. Returns list[Rejection]."""
    rejections = []
    placeholder = any((x.date or "").startswith("0000") for x in incoming + ledger.facts)
    order = sorted(incoming, key=lambda f: (_dkey(f.date, placeholder), msg_pos.get(f.msg_id, 0), int(f.id[1:])))
    for f in order:
        v = evaluate(ledger.active(), f, ledger, corpus, disabled, all_facts=True)
        if not v["ok"]:
            ledger.append(f)
            ledger.reject(f, v["reason"])
            rep = draft_reply(f, v["rule_id"], v["reason"], v.get("ctx", {}))
            rejections.append(Rejection(msg_id=f.msg_id, fact_id=f.id, quote=f.quote, rule_id=v["rule_id"],
                                        failed_check=v["check"], reason=v["reason"], drafted_reply=rep, step=step))
            trace.event("reject", f"{f.id} from {f.msg_id} rejected [{v['rule_id']}] {v['reason']}")
            continue
        if v.get("convert"):
            f.type, f.reason = "request", v["convert"]
            f.x = {k: val for k, val in f.x.items()}
            trace.event("convert", f"{f.id} from {f.msg_id} kept as a request: {v['convert']}")
            ledger.append(f)
            continue
        if v.get("duplicate_of"):
            f.status, f.reason = "duplicate", f"repeats {v['duplicate_of']}"
            ledger.append(f)
            trace.event("info", f"{f.id} repeats {v['duplicate_of']}, no change")
            continue
        f.x = {**v.get("inherit", {}), **f.x}
        for sid in v["supersede"]:
            old = ledger.get(sid)
            if old:
                ledger.supersede(old, f, step)
                trace.event("info", f"{f.id} supersedes {old.id} ({old.type} {old.key}: {primary(old)} → {primary(f)})")
        ledger.append(f)
    return rejections
