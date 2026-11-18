"""FastAPI: serves web/dist and the API. The core CLI never depends on this."""
from __future__ import annotations

import datetime
import os
import subprocess
import sys

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core import attack
from core.audit import audit, impact
from core.schema import State
from core.solver import changed_areas, diff_plans, solve

STATE_PATH = os.path.join("state", "state.json")
CHECKS = [
    {"id": "grounding", "label": "Grounding", "layer": "gatekeeper"},
    {"id": "recency", "label": "Recency", "layer": "gatekeeper"},
    {"id": "authority", "label": "Authority", "layer": "gatekeeper"},
    {"id": "hard", "label": "Hard rules", "layer": "gatekeeper"},
    {"id": "consistency", "label": "Totals", "layer": "gatekeeper"},
    {"id": "conflict", "label": "Conflicts", "layer": "gatekeeper"},
    {"id": "trial", "label": "Trial replan", "layer": "gatekeeper"},
    {"id": "capacity", "label": "Venue capacity", "layer": "solver"},
    {"id": "meals", "label": "Meals for everyone", "layer": "solver"},
    {"id": "judge_cap", "label": "Judge limits", "layer": "solver"},
    {"id": "schedule", "label": "Schedule fits", "layer": "solver"},
    {"id": "budget", "label": "Budget cap", "layer": "solver"},
    {"id": "constraints", "label": "Message requirements", "layer": "solver"},
]
app = FastAPI(title="Muntazim")


def load() -> State | None:
    if not os.path.exists(STATE_PATH):
        return None
    return State.model_validate_json(open(STATE_PATH, encoding="utf-8").read())


class WhatIf(BaseModel):
    overrides: dict = {}
    disabled: list[str] = []


class Ablate(BaseModel):
    disabled: list[str] = []


class Send(BaseModel):
    text: str


@app.get("/api/state")
def get_state():
    s = load()
    return JSONResponse(s.model_dump() if s else {"empty": True})


@app.get("/api/checks")
def get_checks():
    return CHECKS


@app.post("/api/whatif")
def whatif(body: WhatIf):
    s = load()
    if not s:
        raise HTTPException(404, "no state yet")
    act = [f for f in s.facts if f.status == "active"]
    plan = solve(act, frozenset(body.disabled), body.overrides)
    d = diff_plans(s.plan, plan) if plan["feasible"] else []
    return {"plan": plan, "diff": d, "changed": changed_areas(d),
            "audit": audit(act, plan), "impact": impact(plan)}


@app.post("/api/ablate")
def ablate(body: Ablate):
    s = load()
    if not s:
        raise HTTPException(404, "no state yet")
    dis = frozenset(body.disabled)
    act = [f for f in s.facts if f.status == "active"]
    plan = solve(act, dis)
    a = audit(act, plan)
    res = attack.run(s.facts, "\n".join(m.text for m in s.messages), s.plan, dis)
    return {"disabled": sorted(dis), "audit": a, "audit_passed": sum(1 for x in a if x["pass"]),
            "attack": res, "impact": impact(plan), "feasible": plan["feasible"]}


@app.post("/api/send")
def send(body: Send):
    if not body.text.strip():
        raise HTTPException(400, "empty message")
    os.makedirs(os.path.join("packs", "inbox"), exist_ok=True)
    path = os.path.join("packs", "inbox", datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".txt")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body.text)
    r = subprocess.run([sys.executable, "-X", "utf8", "run.py", path], capture_output=True, text=True, encoding="utf-8")
    return {"rc": r.returncode, "tail": (r.stdout or "")[-1500:] + (r.stderr or "")[-500:]}


@app.get("/api/export/{name}")
def export(name: str):
    files = {"plan": ("out/plan.md", "plan.md"), "trace": ("out/trace.txt", "trace.txt")}
    if name not in files or not os.path.exists(files[name][0]):
        raise HTTPException(404, "not generated yet")
    return FileResponse(files[name][0], filename=files[name][1])


if os.path.isdir(os.path.join("web", "dist")):
    app.mount("/", StaticFiles(directory=os.path.join("web", "dist"), html=True), name="web")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
