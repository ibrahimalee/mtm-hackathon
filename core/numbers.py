"""Number normalizer and finder: '1,20,000', '120k', '1.2 lakh', 'Rs. 5000/-', '15 minute' -> number + span."""
from __future__ import annotations

import re
from dataclasses import dataclass

_MULT = {
    "k": 1_000, "thousand": 1_000, "hazaar": 1_000, "hazar": 1_000,
    "lakh": 100_000, "lakhs": 100_000, "lac": 100_000, "lacs": 100_000,
    "crore": 10_000_000, "million": 1_000_000,
}
_MONTH = (r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
          r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)")
_DATE = re.compile(
    r"\b\d{4}-\d{1,2}-\d{1,2}\b"
    r"|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b"
    rf"|\b\d{{1,2}}(?:st|nd|rd|th)?[-\s]{_MONTH}\b(?:[-\s,]+\d{{4}}\b)?"
    rf"|\b{_MONTH}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b(?:,?\s+\d{{4}}\b)?",
    re.I,
)
_NUM = re.compile(
    r"(?<!\w)(\d+(?:,\d+)*(?:\.\d+)?)(?:\s?(k|thousand|hazaar|hazar|lakhs?|lacs?|crore|million)\b)?",
    re.I,
)
_WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve".split())}


@dataclass
class Num:
    value: float | int
    start: int
    end: int
    text: str


def _clean(v: float) -> float | int:
    return int(round(v)) if abs(v - round(v)) < 1e-9 else v


def find_numbers(text: str, skip_dates: bool = True) -> list[Num]:
    masked: list[tuple[int, int]] = []
    if skip_dates:
        masked = [(m.start(), m.end()) for m in _DATE.finditer(text)]
    out: list[Num] = []
    for m in _NUM.finditer(text):
        if any(s <= m.start() < e for s, e in masked):
            continue
        digits = m.group(1)
        if "," not in digits and "." not in digits and len(digits) >= 10:
            continue  # phone-like
        val = float(digits.replace(",", ""))
        suf = m.group(2)
        if suf:
            val *= _MULT[suf.lower()]
        out.append(Num(_clean(val), m.start(), m.end(), m.group(0)))
    return out


def to_num(v) -> float | int | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return _clean(float(v))
    if not isinstance(v, str):
        return None
    s = re.sub(r"(?i)\b(rs|pkr|usd|rupees?|only)\b\.?|/-|[$₨]", " ", v).strip()
    ns = find_numbers(s, skip_dates=False)
    if len(ns) == 1 and ns[0].start == len(s) - len(s.lstrip()) and ns[0].end == len(s.rstrip()):
        return ns[0].value
    return None


def numbers_in(text: str) -> set:
    return {n.value for n in find_numbers(text, skip_dates=False)}


def quote_has_number(quote: str, value) -> bool:
    if value in numbers_in(quote):
        return True
    for w in re.findall(r"[a-z]+", quote.lower()):
        if _WORDS.get(w) == value:
            return True
    return False


def parse_clock(s) -> int | None:
    """'09:30', '9 am', '2pm' -> minutes after midnight."""
    if not isinstance(s, str):
        return None
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", s.strip().lower())
    if not m or not (m.group(2) or m.group(3)):
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return h * 60 + mi


def fmt_clock(minutes: int) -> str:
    minutes %= 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
