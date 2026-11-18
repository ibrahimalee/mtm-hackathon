"""The ONLY module that calls the model (area 'reading'). Extracts facts; everything after is plain code."""
from __future__ import annotations

import json
import re

from .ledger import primary
from .audit import REQUIRED
from .gatekeeper import _numeric_fields
from .numbers import find_numbers, numbers_in, quote_has_number, to_num
from .schema import FACT_TYPES, METRICS, PARAM_KEYS, ROLES, Fact, Message

AREA = "reading"

FACT_SPEC = (
    'Fact shape: {"t":type,"k":key,"v":number,"q":"words copied from the message","x":{...}} and q is never omitted.\n'
    'Fact: t=param|option|expense|block|constraint|request; k=key; v=value (plain number, no commas or currency); '
    'u=unit; q=REQUIRED exact verbatim quote holding the numbers; x=extra; up=id of an earlier fact this updates; '
    'cx=id of an earlier fact this contradicts.\n'
    'param keys: people.students people.staff team.size event.minutes(total, convert hours) event.start budget.cap '
    'judges.available judge.minutes_per_team judge.max_teams(teams one judge may cover) judge.fee(per judge) food.qty; '
    'any numeric limit on one of these keys is that param, not a constraint; unknown keys allowed.\n'
    'option x:{category:venue|food|other,name,price,basis:flat|per_head,capacity,features:[],tier:default|standard|basic|premium}\n'
    'expense x:{item,amount,status:committed if already ordered, paid or approved; requested if only asked or proposed}\n'
    'block x:{name,minutes,at}\n'
    'constraint x:{metric,op:<=|>=|==|!=|includes|excludes,value}; metric one of people.total venue.capacity venue.cost '
    'venue.features venue.name food.per_head food.cost food.qty judges.used judging.teams_per_judge judging.window_minutes '
    'schedule.total_minutes schedule.blocks schedule.end budget.total budget.remaining, else "unsupported".\n'
    'A requirement or prohibition with no number is still a constraint (op includes or excludes). request: asked for, not decided. For a stated total add x.parts=[component numbers]. '
    'Convert lakh/k to full numbers. Never invent; quotes must be verbatim. '
    'A number giving a duration, count, price or limit is always a fact; ign is only for clock times, list or page numbers and small talk.'
)

SYSTEM = (
    'Extract facts from event messages (English or Roman Urdu) as JSON. '
    'Roman Urdu: ab=now, hoga=will be, wala=the one, nahi=not, kal=tomorrow/yesterday, hai=is.\n'
    'Return {"m":[...]}, one entry per message in order: a=first 6-8 words verbatim, s=sender, '
    'r=role (organizer_authority|finance|venue_vendor|food_vendor|judging|participant_group|individual|other), '
    'd=date YYYY-MM-DD (use 0000 for an unknown year) or null, rel=1 if about the event else 0, f=[facts], ign=[numbers present but deliberately not facts].\n'
    + FACT_SPEC
)

UPDATE_NOTE = "\nActive facts are listed as id|type|key|value|role|date. Set up or cx when a new fact changes or contradicts one."

REPAIR_SYSTEM = (
    'Some facts are missing or unverified. For each message #i give the facts it states that are missing, or restate unverified ones with q copied exactly from the message. '
    'A duration, count, price or limit is a fact; only clock times, list or page numbers and small talk are not. For "Not found yet" items search the text and add them only if stated. '
    'Return {"m":[{"i":i,"f":[facts]}]} as JSON. Add only what is missing.\n' + FACT_SPEC
)

_HEADER = re.compile(
    r"\bpage\s+\d+\s+of\s+\d+"
    r"|\A\s*#?\s*(?:message\s+)?\d{1,3}(?=[\s.):])"
    r"|\[[^\]\n]{0,45}\]"
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


def _ptr(v) -> str | None:
    m = re.fullmatch(r"F?(\d+)", str(v).strip()) if v not in (None, "", False) else None
    return f"F{m.group(1)}" if m else None


def _expand(fd: dict, fid: str, msg: Message, step: int) -> Fact | None:
    if not isinstance(fd, dict):
        return None
    t = str(fd.get("t", "")).lower()
    if t not in FACT_TYPES:
        return None
    x = dict(fd["x"]) if isinstance(fd.get("x"), dict) else {}
    v, k = fd.get("v"), str(fd.get("k") or "")
    key = k
    if t == "expense" and re.search(r"judge", f"{k} {x.get('item', '')}", re.I) and re.search(r"fee|stipend|pay|rate", f"{k} {x.get('item', '')}", re.I):
        t, key, x = "param", "judge.fee", {}  # a per-judge payment is the judge fee, not a one-off expense
    if t == "option":
        if str(x.get("category", "")).lower() not in ("venue", "food", "other"):
            hint = f"{k} {x.get('category', '')}".lower()
            x["category"] = "venue" if "venue" in hint else "food" if "food" in hint else \
                {"venue_vendor": "venue", "food_vendor": "food"}.get(msg.role, "other")
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
        x["op"] = x.get("op") or "=="
        key = str(x.get("metric") or k)
    if t == "constraint" and x.get("metric") not in METRICS and x.get("metric") in PARAM_KEYS and x.get("op") in ("<=", "==", ">=", ""):
        t, key, v = "param", str(x["metric"]), x.get("value", v)  # a limit on a param key is the param itself
        x = {}
    if t == "option" and str(x.get("category", "")).lower() == "food":
        name = str(x.get("name") or k).lower()
        words = {"basic": ("basic", "economy", "budget", "lite", "value"), "premium": ("premium", "deluxe", "gold", "vip"), "standard": ("standard",)}
        x["tier"] = next((t for t, ws in words.items() if any(w in name for w in ws)), x.get("tier"))
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
                up=_ptr(fd.get("up")), cx=_ptr(fd.get("cx")))


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _ground(f: Fact, m: Message, trace) -> None:
    """If the model's quote is missing or not in the message, use the shortest sentence of the message that holds all of
    the fact's numbers. The quote still has to be real text from the file, and a number that is not there stays ungrounded."""
    if f.type == "request":
        return
    nums = _numeric_fields(f)
    if f.quote and _norm(f.quote) in _norm(m.text) and all(quote_has_number(f.quote, n) for n in nums):
        return
    if not nums or not m.text:
        return
    sentences = [x.strip() for x in re.split(r"(?<=[.!?”\"])\s+|\n+", m.text) if x.strip()]
    ok = [x for x in sentences if all(quote_has_number(x, n) for n in nums)]
    if ok:
        f.quote = min(ok, key=len)
        trace.event("info", f"{f.id}: quote taken from the message text (the model's quote was missing or not found)")


def _ign_values(ign) -> set:
    out = set()
    for i in ign or []:
        n = to_num(i)
        if n is not None:
            out.add(n)
        else:
            out |= {m.value for m in find_numbers(str(i), skip_dates=False)}
    return out


_NOT_UNITS = {"of", "st", "nd", "rd", "th", "am", "pm", "and", "or", "to", "is", "in", "on", "at"}  # words after a number that do not make it a fact
_UNIT = re.compile(r"\b(?:min|mins|minutes?|hours?|hrs?|students?|staff|people|persons?|teams?|judges?|seats?|head|rs|pkr|usd|per|each|guests?|meals?)\b|%", re.I)


def _uncovered(text: str, quotes: list[str], ign: set) -> list:
    """Numbers no fact quote covers. Small bare integers (list markers, page counts) are only flagged beside a unit word."""
    masked = [(m.start(), m.end()) for m in _HEADER.finditer(text)]
    have = set(ign)
    for q in quotes:
        have |= numbers_in(q)
    out = []
    for n in find_numbers(text):
        if any(s <= n.start < e for s, e in masked) or n.value in have or n.value in out:
            continue
        after = text[n.end:n.end + 14].lstrip(" -")
        before = text[max(0, n.start - 5):n.start]
        nxt = re.match(r"([a-z]+)", after)
        word = nxt.group(1) if nxt else ""
        currency = re.search(r"(?:rs|pkr|usd|\$)\.?\s*$", before, re.I)
        if n.value >= 100 or _UNIT.match(after) or currency or (word and word not in _NOT_UNITS):
            out.append(n.value)
    return out


_MODAL = re.compile(r"\b(?:must|required|requires?|mandatory|compulsory|only|at least|at most|no more than|not allowed|cannot|should not|remove|exclude)\b", re.I)


def _unrecorded(text: str, quotes: list[str]) -> list[str]:
    """Sentences that state a requirement (must, at least, only, remove...) which no fact quote touches."""
    qs = [_norm(q) for q in quotes if q]
    out = []
    for sent in (x.strip() for x in re.split(r"(?<=[.!?”\"])\s+|\n+", text) if x.strip()):
        if _MODAL.search(sent) and not any(q in _norm(sent) or _norm(sent) in q for q in qs):
            out.append(sent[:160])
    return out


def _unverified(f: Fact, m: Message) -> bool:
    """A numeric fact whose quote is not in its message, even after the quote fallback."""
    if f.type == "request" or not _numeric_fields(f):
        return False
    return not (f.quote and _norm(f.quote) in _norm(m.text))


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
    repaired = False

    toks = [t for t in _tok(raw) if t[0]]
    entries, cursor = [], 0
    for item in [i for i in data["m"] if isinstance(i, dict)]:
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
            for fd in (item.get("f") if isinstance(item.get("f"), list) else []):
                f = _expand(fd, f"F{fn}", m, step)
                if f is None:
                    trace.event("warn", f"{m.id}: dropped a fact with unknown type")
                    continue
                fn += 1
                _ground(f, m, trace)
                mf.append(f)
        messages.append(m)
        facts.extend(mf)
        per_msg.append((m, mf, _ign_values(item.get("ign"))))

    # One targeted repair call for everything the code could not settle: numbers no fact covers, facts whose quote
    # cannot be verified, and required inputs nobody stated.
    have = {f.key for f in facts if f.type == "param"} | {f.key for f in (active or []) if f.type == "param"}
    gaps = [(k, label) for k, label in REQUIRED.items() if k not in have]
    flagged = []
    for m, mf, ign in per_msg:
        if m.text and m.reason != "not about the event":
            un = _uncovered(m.text, [f.quote for f in mf], ign) + _unrecorded(m.text, [f.quote for f in mf])
            bad = [f for f in mf if _unverified(f, m)]
            if un or bad:
                flagged.append((m, mf, un, bad))
    if flagged or gaps:
        bits = [f"{m.id} ({len(un)} number(s), {len(bad)} unverified fact(s))" for m, _, un, bad in flagged]
        if gaps:
            bits.append("not found anywhere: " + ", ".join(l for _, l in gaps))
        trace.event("warn", "making one targeted repair call for " + "; ".join(bits))
        parts = []
        for i, (m, mf, un, bad) in enumerate(flagged):
            line = f"#{i} {m.text}"
            if un:
                line += f"\nNot yet recorded (numbers or stated requirements): {'; '.join(str(u) for u in un)}"
            if bad:
                line += "\nFacts whose quote could not be verified: " + "; ".join(f"{b.key} {primary(b)}" for b in bad)
            parts.append(line)
        if gaps:
            parts.append(f"#{len(flagged)} (all messages, find these) {raw}\nNot found yet: " + ", ".join(f"{l} ({k})" for k, l in gaps))
        rd = _parse(call(REPAIR_SYSTEM, "\n\n".join(parts))["content"])
        repaired = True
        if rd and isinstance(rd.get("m"), list):
            for r in [i for i in rd["m"] if isinstance(i, dict)]:
                try:
                    k = int(r.get("i"))
                except (TypeError, ValueError):
                    continue
                for fd in (r.get("f") if isinstance(r.get("f"), list) else []):
                    owner = flagged[k][0] if 0 <= k < len(flagged) else None
                    q = _norm(str(fd.get("q") or "")) if isinstance(fd, dict) else ""
                    if owner is None or (q and q not in _norm(owner.text)):
                        owner = next((mm for mm in messages if q and q in _norm(mm.text)), owner)
                    if owner is None:
                        continue
                    f = _expand(fd, f"F{fn}", owner, step)
                    if f is None:
                        continue
                    _ground(f, owner, trace)
                    if _unverified(f, owner):
                        continue
                    if any(o.msg_id == f.msg_id and o.type == f.type and o.key == f.key and primary(o) == primary(f) for o in facts):
                        continue
                    fn += 1
                    facts.append(f)
                    trace.event("info", f"repair added {f.id} ({f.type} {f.key}) to {owner.id}")
            for m, mf, un, bad in flagged:  # facts the repair replaced or could not verify are dropped, not guessed
                for b in bad:
                    twin = any(o is not b and o.msg_id == b.msg_id and o.type == b.type and o.key == b.key for o in facts)
                    if twin:
                        facts.remove(b)
        else:
            trace.event("warn", "repair reply unusable; keeping the first reading")
    return messages, facts
