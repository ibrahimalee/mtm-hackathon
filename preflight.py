"""Pre-test safety check. Makes zero model calls. Run: python preflight.py"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys

from rich.console import Console

from core.llm import load_env
from core.numbers import find_numbers

console = Console(highlight=False)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GENERIC = set("""I A An The This That These Those It He She We You They Hi Hello Hey Dear Thanks Thank Regards Sir Madam Please
Subject From To Cc Bcc Date Sent Re Fwd Rs PKR USD Mon Tue Wed Thu Fri Sat Sun Monday Tuesday Wednesday Thursday Friday
Saturday Sunday Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec January February March April June July August
September October November December WhatsApp Gmail English Urdu Roman Ok Okay Yes No Also And But So If When Then Best Kind
Team All Note Update Final Okay Message""".split())
CODE_EXT = {".py", ".md", ".json", ".txt", ".yml", ".yaml", ".toml", ".example"}
WEB_EXT = {".ts", ".tsx", ".js", ".jsx", ".css", ".html"}
SKIP_NAMES = {"package-lock.json"}
ALLOWED_NUMBERS = set(range(0, 11))
WEB_MIN_NUMBER = 10 ** 3  # layout numbers (px, ms) are noisy in UI files; only money-sized values are checked there


def ok(msg):
    console.print(f"[green]PASS[/green] {msg}")


def bad(msg):
    console.print(f"[red]FAIL[/red] {msg}")


def pack_tokens():
    nums, words = set(), set()
    files = []
    for root, _, fs in os.walk("packs"):
        files += [os.path.join(root, f) for f in fs if f.lower().endswith(".txt")]
    for p in files:
        t = open(p, encoding="utf-8", errors="replace").read()
        nums |= {n.value for n in find_numbers(t, skip_dates=True)}
        lower = set(re.findall(r"\b[a-z]{3,}\b", t))
        for w in re.findall(r"(?<=[a-z,;:] )[A-Z][a-z]{2,}\b", t):
            if w not in GENERIC and w.lower() not in lower:
                words.add(w)
        for ph in re.findall(r"\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b", t):
            if not all(w in GENERIC or w.lower() in lower for w in ph.split()):
                words.add(ph)
    return files, nums - ALLOWED_NUMBERS, words


def git(*args):
    """Run git for this folder only. safe.directory is passed per command, so the user's git config is left alone."""
    here = os.path.abspath(".").replace(os.sep, "/")
    return subprocess.run(["git", "-c", f"safe.directory={here}", *args], capture_output=True, text=True)


def tracked_files():
    out = git("ls-files")
    if out.returncode != 0:
        return None, out.stderr.strip()
    fs = [f for f in out.stdout.splitlines() if not f.startswith("web/dist/") and os.path.basename(f) not in SKIP_NAMES]
    return fs, ""


def check_leaks() -> bool:
    files, nums, words = pack_tokens()
    if not files:
        console.print("[yellow]SKIP[/yellow] fact-leak scan: no files in packs/")
        return True
    tracked, err = tracked_files()
    if tracked is None:
        bad(f"fact-leak scan needs git: {err}")
        return False
    hits = []
    for f in tracked:
        ext = os.path.splitext(f)[1].lower()
        if ext not in CODE_EXT | WEB_EXT:
            continue
        try:
            lines = open(f, encoding="utf-8").read().splitlines()
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(lines, 1):
            for n in find_numbers(line, skip_dates=True):
                if n.value in nums and (ext in CODE_EXT or n.value >= WEB_MIN_NUMBER):
                    hits.append((f, i, f"number {n.value}"))
            for w in words:
                if re.search(rf"(?<![A-Za-z]){re.escape(w)}(?![A-Za-z])", line):
                    hits.append((f, i, f"name '{w}'"))
    if hits:
        bad(f"fact-leak scan: {len(hits)} match(es) between packs/ and tracked source")
        for f, i, what in hits[:40]:
            console.print(f"   {f}:{i}  {what}")
        return False
    ok(f"fact-leak scan: {len(tracked)} tracked files checked against {len(files)} pack file(s)")
    return True


def check_git() -> bool:
    st = git("status", "--porcelain")
    if st.returncode != 0:
        bad(f"git status failed: {st.stderr.strip()}")
        return False
    h = git("log", "-1", "--format=%h %s").stdout.strip()
    if st.stdout.strip():
        bad("git status is not clean:\n" + st.stdout.rstrip())
        return False
    ok(f"git status clean, HEAD {h or '(no commits)'}")
    return True


def check_dirs() -> bool:
    present = [d for d in ("state", "out") if os.path.isdir(d)]
    if not present:
        ok("state/ and out/ are absent")
        return True
    bad(f"{', '.join(present)} exist; a run would be an update, not a full run")
    try:
        answer = input("Delete them now? [y/N] ").strip().lower() if sys.stdin.isatty() else "n"
    except EOFError:
        answer = "n"
    if answer == "y":
        for d in present:
            shutil.rmtree(d)
        ok("deleted")
        return True
    return False


def check_env() -> bool:
    load_env()
    if not os.path.exists(".env"):
        bad(".env is missing (copy .env.example)")
        return False
    model = os.environ.get("LLM_MODEL", "")
    allowed = [m.strip() for m in os.environ.get("LLM_ALLOWED_MODELS", "").split(",") if m.strip()]
    keys = [k for k in os.environ.get("LLM_API_KEYS", "").split(",") if k.strip()]
    good = True
    if not model or model not in allowed:
        bad("LLM_MODEL is not in LLM_ALLOWED_MODELS")
        good = False
    if not keys:
        bad("no key in LLM_API_KEYS")
        good = False
    if good:
        ok(f".env ok: model {model} is allowed, {len(keys)} key(s)")
    return good


def check_dist() -> bool:
    if os.path.exists(os.path.join("web", "dist", "index.html")):
        ok("web/dist exists")
        return True
    bad("web/dist/index.html is missing (run npm run build in web/)")
    return False


def main() -> int:
    results = [check_leaks(), check_git(), check_dirs(), check_env(), check_dist()]
    console.print("\n[bold]preflight " + ("passed[/bold]" if all(results) else "FAILED[/bold]"))
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
