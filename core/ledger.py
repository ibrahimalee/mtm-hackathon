"""Event-sourced fact ledger: append, supersede, reject, replay(upto_step)."""
from __future__ import annotations

import re

from .numbers import to_num
from .schema import Fact


def norm(s) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


def identity(f: Fact):
    x = f.x or {}
    if f.type == "param":
        return ("param", f.key)
    if f.type == "option":
        return ("option", norm(x.get("category") or "other"), norm(x.get("name") or f.key), norm(x.get("tier")))
    if f.type == "expense":
        return ("expense", norm(x.get("item") or f.key))
    if f.type == "block":
        return ("block", norm(x.get("name") or f.key))
    if f.type == "constraint":
        op = x.get("op") or ""
        # Membership constraints (includes, excludes, !=) each state a separate thing; limits replace each other.
        member = (norm(x.get("value")), tuple(sorted(norm(n) for n in x["names"]))) if op in ("includes", "excludes", "!=") and isinstance(x.get("names"), list) \
            else (norm(x.get("value")), ()) if op in ("includes", "excludes", "!=") else ("", ())
        return ("constraint", x.get("metric") or f.key, op) + member
    return None


def same_identity(a, b) -> bool:
    """Equal identities. Two options with one name but different tiers are different options; a missing tier matches any."""
    if a is None or b is None:
        return False
    if a[0] == "option" and b[0] == "option":
        return a[:3] == b[:3] and (not a[3] or not b[3] or a[3] == b[3])
    return a == b


def primary(f: Fact):
    x = f.x or {}
    if f.type == "param":
        n = to_num(f.value)
        return n if n is not None else f.value
    if f.type == "option":
        return to_num(x.get("price"))
    if f.type == "expense":
        return to_num(x.get("amount", f.value))
    if f.type == "block":
        return to_num(x.get("minutes", f.value))
    if f.type == "constraint":
        n = to_num(x.get("value", f.value))
        return n if n is not None else x.get("value", f.value)
    return f.value


def with_primary(f: Fact, v) -> Fact:
    g = f.model_copy(deep=True)
    if g.type == "param":
        g.value = v
    elif g.type == "option":
        g.x["price"] = v
    elif g.type == "expense":
        g.x["amount"] = v
    elif g.type == "block":
        g.x["minutes"] = v
    elif g.type == "constraint":
        g.x["value"] = v
    return g


class Ledger:
    def __init__(self, facts: list[Fact]):
        self.facts = facts

    def next_id(self) -> str:
        n = max([int(f.id[1:]) for f in self.facts if f.id[1:].isdigit()] + [0])
        return f"F{n + 1}"

    def get(self, fid) -> Fact | None:
        return next((f for f in self.facts if f.id == fid), None)

    def active(self) -> list[Fact]:
        return [f for f in self.facts if f.status == "active"]

    def replay(self, upto_step: int) -> list[Fact]:
        return [f for f in self.facts
                if f.status != "rejected" and f.step <= upto_step
                and (f.superseded_step is None or f.superseded_step > upto_step)
                and f.status != "duplicate"]

    def find_existing(self, f: Fact) -> Fact | None:
        ident = identity(f)
        by_name = None if ident is None else next(
            (e for e in self.facts if e.status == "active" and e.id != f.id and same_identity(identity(e), ident)), None)
        e = self.get(f.up) if f.up else None
        if e and e.status == "active" and e.type == f.type and e.id != f.id and (by_name is None or by_name.id == e.id):
            return e  # the model's pointer wins unless it disagrees with an exact name match
        return by_name

    def append(self, f: Fact) -> None:
        self.facts.append(f)

    def supersede(self, old: Fact, new: Fact, step: int) -> None:
        old.status = "superseded"
        old.superseded_by = new.id
        old.superseded_step = step
        new.supersedes = old.id

    def reject(self, f: Fact, reason: str) -> None:
        f.status = "rejected"
        f.reason = reason
