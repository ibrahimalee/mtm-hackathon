# Muntazim

We treat messages like source code. We compile them into rules, solve and verify the plan against those rules, measure how much margin the plan has, and attack our own system to prove it holds. Only reading uses a model. Everything else is plain, explainable code.

## Run

```bash
pip install -r requirements.txt
cp .env.example .env        # add your keys, model and allowlist
python run.py <path-to-txt>
```

- No `state/` folder: a full run (one model call, two at most with a repair).
- `state/` exists: the file holds new message(s) and the plan is updated (at most five calls).
- Output: `out/plan.md` and `out/trace.txt`, plus a full terminal trace.

## Other commands

```bash
python server.py            # dashboard at http://127.0.0.1:8000 (the CLI never needs it)
python attack.py            # red team against the saved state, zero model calls
python preflight.py         # pre-test safety check, zero model calls
cd web && npm install && npm run build   # only needed to change the dashboard; web/dist is committed
```

## Layout

| path | role |
|---|---|
| `run.py` | CLI: read, gatekeep, solve, compile rules, margins, attack, audit, save, print trace |
| `core/reader.py` | the only module that calls the model |
| `core/gatekeeper.py` | grounding, recency, authority, hard rules, totals, conflicts, trial replan |
| `core/solver.py` | pure planner: `solve(facts, disabled_checks, overrides)` |
| `core/rules.py`, `margins.py`, `attack.py`, `audit.py` | rulebook, breaking points, red team, six-check audit |
| `core/llm.py`, `trace.py` | key rotation on one model, numbered trace with API token counts |
| `server.py`, `web/` | dashboard (React, Tailwind, Framer Motion) |
| `docs/WHY.md` | why each part exists, and answers to likely judge questions |

## Dashboard endpoints

`GET /api/state`, `POST /api/whatif`, `POST /api/ablate` (neither writes state), and `POST /api/send` (calls the model and changes the saved plan, so the UI labels it as a demo).
