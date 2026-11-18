"""The ONLY module that calls the model (area 'reading'). Extracts facts; everything after is plain code."""
from __future__ import annotations

import json
import re

from .ledger import primary
from .numbers import find_numbers, numbers_in, to_num
from .schema import FACT_TYPES, ROLES, Fact, Message

AREA = "reading"

FACT_SPEC = (
    'Fact: t=param|option|expense|block|constraint|request; k=key; v=value (plain number, no commas or currency); '
    'u=unit; q=exact verbatim quote holding the numbers; x=extra; up=id of an earlier fact this updates; '
    'cx=id of an earlier fact this contradicts.\n'
    'param keys: people.students people.staff team.size event.minutes event.start budget.cap judges.available '
    'judge.minutes_per_team judge.max_teams judge.fee food.qty; unknown keys allowed.\n'
    'option x:{category:venue|food|other,name,price,basis:flat|per_head,capacity,features:[],tier:default|standard|basic|premium}\n'
    'expense x:{item,amount,status:committed|requested}\n'
    'block x:{name,minutes,at}\n'
    'constraint x:{metric,op:<=|>=|==|!=|includes|excludes,value}; metric one of people.total venue.capacity venue.cost '
    'venue.features venue.name food.per_head food.cost food.qty judges.used judging.teams_per_judge judging.window_minutes '
    'schedule.total_minutes schedule.blocks schedule.end budget.total budget.remaining, else "unsupported".\n'
    'request: asked for, not decided. For a stated total add x.parts=[component numbers]. '
    'Convert lakh/k to full numbers. Never invent; quotes must be verbatim.'
)

SYSTEM = (
    'Extract facts from event messages (English or Roman Urdu) as JSON. '
    'Roman Urdu: ab=now, hoga=will be, wala=the one, nahi=not, kal=tomorrow/yesterday, hai=is.\n'
    'Return {"m":[...]}, one entry per message in order: a=first 6-8 words verbatim, s=sender, '
    'r=role (organizer_authority|finance|venue_vendor|food_vendor|judging|participant_group|individual|other), '
    'd=date YYYY-MM-DD or null, rel=1 if about the event else 0, f=[facts], ign=[numbers present but deliberately not facts].\n'
    + FACT_SPEC
)

UPDATE_NOTE = "\nActive facts are listed as id|type|key|value|role|date. Set up or cx when a new fact changes or contradicts one."

REPAIR_SYSTEM = (
    'Numbers in some messages were not covered by any fact. For each message #i return '
    '{"m":[{"i":i,"f":[missing facts],"ign":[numbers that are not facts]}]} as JSON. Add only what is missing.\n' + FACT_SPEC
)

_HEADER = re.compile(
    r"\[[^\]\n]{0,45}\]"
    r"|^\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?\s*-"
    r"|^\s*(?:date|sent)\s*:.*$", re.I | re.M)


def _tok(s: str):
    return [(re.sub(r"\W+", "", m.group(0)).lower(), m.start(), m.end()) for m in re.finditer(r"\S+", s)]


def _locate(anchor: str, toks, frm: int):
    words = [w for w, _, _ in _tok(anchor) if w]
    if not words:
        return None
    for n in dict.fromkeys([len(words), 6, 4, 3]):
        if n > len(words):
            continue
        for start in (frm, 0):
            for i in range(start, len(toks) - n + 1):
                if [toks[i + k][0] for k in range(n)] == words[:n]:
                    return i
    return None


def _parse(text: str):
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?|```$", "", t, flags=re.M).strip()
    try:
        return json.loads(t)
    except Exception:
        a, b = t.find("{"), t.rfind("}")
        if a >= 0 and b > a:
            try:
                return json.loads(t[a:b + 1])
            except Exception:
                return None
    return None


def _fact_lines(facts: list[Fact]) -> str:
    return "\n".join(f"{f.id}|{f.type}|{f.key}|{primary(f)}|{f.role}|{f.date or ''}" for f in facts if f.status == "active")


def _expand(fd: dict, fid: str, msg: Message, step: int) -> Fact | None:
    t = str(fd.get("t", "")).lower()
    if t not in FACT_TYPES:
        return None
    x = dict(fd.get("x") or {})
    v, k = fd.get("v"), str(fd.get("k") or "")
    key = k
    if t == "option":
        x.setdefault("price", v)
        key = str(x.get("name") or k)
    elif t == "expense":
        x.setdefault("amount", v)
        key = str(x.get("item") or k)
    elif t == "block":
        x.setdefault("minutes", v)
        key = str(x.get("name") or k)
    elif t == "constraint":
        x.setdefault("value", v)
        x.setdefault("metric", k)
        x.setdefault("op", "==")
        key = str(x.get("metric") or k)
    for fld in ("price", "amount", "minutes", "capacity", "value", "qty"):
        if fld in x:
            n = to_num(x[fld])
            if n is not None:
                x[fld] = n
    if isinstance(x.get("parts"), list):
        x["parts"] = [to_num(p) if to_num(p) is not None else p for p in x["parts"]]
    value = to_num(v) if to_num(v) is not None else v
    return Fact(id=fid, msg_id=msg.id, type=t, key=key, value=value, unit=str(fd.get("u") or ""),
                quote=str(fd.get("q") or ""), x=x, step=step, sender=msg.sender, role=msg.role, date=msg.date,
                up=fd.get("up") or None, cx=fd.get("cx") or None)


def _ign_values(ign) -> set:
    out = set()
    for i in ign or []:
        n = to_num(i)
        if n is not None:
            out.add(n)
        else:
            out |= {m.value for m in find_numbers(str(i), skip_dates=False)}
    return out


def _uncovered(text: str, quotes: list[str], ign: set) -> list:
    masked = [(m.start(), m.end()) for m in _HEADER.finditer(text)]
    have = set(ign)
    for q in quotes:
        have |= numbers_in(q)
    out = []
    for n in find_numbers(text):
        if any(s <= n.start < e for s, e in masked):
            continue
        if n.value not in have and n.value not in out:
            out.append(n.value)
    return out


def read(llm, trace, raw: str, active: list[Fact] | None, next_msg: int, next_fact: int, step: int):
    """Returns (messages, facts). `active` is None on a full run, the active facts on an update."""
    system = SYSTEM + (UPDATE_NOTE if active else "")
    user = (f"Active facts:\n{_fact_lines(active)}\n\nMessages:\n{raw}" if active else raw)

    def call(sys_, usr):
        r = llm.chat(AREA, sys_, usr)
        trace.call(r["model"], AREA, f"[system]\n{sys_}\n\n[user]\n{usr}", r["content"], r["usage"], r["ms"])
        return r

    data = _parse(call(system, user)["content"])
    if data is None or not isinstance(data.get("m"), list):
        trace.event("warn", "reader JSON did not parse, making one repair call")
        data = _parse(call(system, user + "\n\nYour previous reply was not valid JSON. Reply with valid JSON only.")["content"])
        if data is None or not isinstance(data.get("m"), list):
            trace.event("reject", "reader JSON still invalid after repair; nothing extracted")
            return [], []

    toks = [t for t in _tok(raw) if t[0]]
    entries, cursor = [], 0
    for item in data["m"]:
        idx = _locate(str(item.get("a") or ""), toks, cursor)
        if idx is not None:
            cursor = idx
        entries.append((idx, item))
    found = sorted({toks[i][1] for i, _ in entries if i is not None})
    messages, facts, per_msg = [], [], []
    mn, fn = next_msg, next_fact
    for idx, item in entries:
        role = item.get("r") if item.get("r") in ROLES else "other"
        m = Message(id=f"M{mn}", sender=str(item.get("s") or ""), role=role, date=item.get("d") or None,
                    anchor=str(item.get("a") or ""), step=step)
        mn += 1
        if idx is not None:
            s = toks[idx][1]
            nxt = [p for p in found if p > s]
            m.pos, m.text = s, raw[s:(nxt[0] if nxt else len(raw))].strip()
        else:
            m.reason = "anchor not found in the file"
            trace.event("warn", f"{m.id}: anchor not found, message boundary unknown")
        if not m.date:
            d = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", m.text)
            m.date = d.group(1) if d else None
        mf = []
        if str(item.get("rel", 1)) == "0":
            m.reason = "not about the event"
        else:
            for fd in item.get("f") or []:
                f = _expand(fd, f"F{fn}", m, step)
                if f is None:
                    trace.event("warn", f"{m.id}: dropped a fact with unknown type")
                    continue
                fn += 1
                mf.append(f)
        messages.append(m)
        facts.extend(mf)
        per_msg.append((m, mf, _ign_values(item.get("ign"))))

    # coverage check: numbers neither inside a fact quote nor deliberately ignored
    flagged = []
    for m, mf, ign in per_msg:
        if m.text and not m.reason == "not about the event":
            un = _uncovered(m.text, [f.quote for f in mf], ign)
            if un:
                flagged.append((m, mf, ign, un))
    if flagged:
        trace.event("warn", "possibly missed numbers in " + ", ".join(f"{m.id} ({len(un)})" for m, _, _, un in flagged)
                    + "; making one targeted repair call")
        body = "\n\n".join(f"#{i} {m.text}\nUncovered numbers: {', '.join(str(u) for u in un)}"
                           for i, (m, _, _, un) in enumerate(flagged))
        rd = _parse(call(REPAIR_SYSTEM, body)["content"])
        if rd and isinstance(rd.get("m"), list):
            for r in rd["m"]:
                try:
                    m, mf, ign, un = flagged[int(r.get("i"))]
                except (TypeError, ValueError, IndexError):
                    continue
                for fd in r.get("f") or []:
                    f = _expand(fd, f"F{fn}", m, step)
                    if f is not None:
                        fn += 1
                        facts.append(f)
                        trace.event("info", f"repair added {f.id} ({f.type} {f.key}) to {m.id}")
        else:
            trace.event("warn", "repair reply unusable; keeping the first reading")
    return messages, facts
