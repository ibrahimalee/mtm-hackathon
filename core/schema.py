from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

ROLES = [
    "organizer_authority", "finance", "judging", "venue_vendor", "food_vendor",
    "participant_group", "individual", "other",
]

# Policy: who outranks whom when two messages disagree about the same fact.
RANK = {
    "organizer_authority": 6, "finance": 5, "judging": 4,
    "venue_vendor": 3, "food_vendor": 3,
    "participant_group": 2, "individual": 1, "other": 0,
}

FACT_TYPES = ["param", "option", "expense", "block", "constraint", "request"]

PARAM_KEYS = [
    "people.students", "people.staff", "team.size", "event.minutes", "event.start",
    "budget.cap", "judges.available", "judge.minutes_per_team", "judge.max_teams", "judge.fee",
    "food.qty", "food.surcharge_pct",
]

METRICS = [
    "people.total", "venue.capacity", "venue.cost", "venue.features", "venue.name",
    "food.per_head", "food.cost", "food.qty", "judges.used", "judging.teams_per_judge",
    "judging.window_minutes", "schedule.total_minutes", "schedule.blocks", "schedule.end",
    "budget.total", "budget.remaining",
]

AREAS = ["venue", "people", "food", "judging", "schedule", "budget"]
CALL_AREAS = ["reading", "venue", "schedule", "food", "judging", "budget"]


class Message(BaseModel):
    id: str
    sender: str = ""
    role: str = "other"
    date: Optional[str] = None
    text: str = ""
    status: str = "ignored"  # used | superseded | ignored | rejected
    reason: str = ""
    step: int = 0
    pos: Optional[int] = None
    anchor: str = ""


class Fact(BaseModel):
    id: str
    msg_id: str
    type: str
    key: str = ""
    value: Any = None
    unit: str = ""
    quote: str = ""
    x: dict = Field(default_factory=dict)
    status: str = "active"  # active | superseded | rejected | duplicate
    superseded_by: Optional[str] = None
    supersedes: Optional[str] = None
    reason: str = ""
    step: int = 0
    superseded_step: Optional[int] = None
    sender: str = ""
    role: str = "other"
    date: Optional[str] = None
    up: Optional[str] = None
    cx: Optional[str] = None


class Rejection(BaseModel):
    msg_id: str
    fact_id: str
    quote: str = ""
    rule_id: str
    failed_check: str
    reason: str
    drafted_reply: str = ""
    step: int = 0


class State(BaseModel):
    run_id: str = ""
    updated_at: str = ""
    steps: list[dict] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    plan: dict = Field(default_factory=dict)
    rules: list[dict] = Field(default_factory=list)
    margins: dict = Field(default_factory=dict)
    attack: dict = Field(default_factory=dict)
    audit: list[dict] = Field(default_factory=list)
    rejections: list[Rejection] = Field(default_factory=list)
    changes: dict = Field(default_factory=dict)
    trace: dict = Field(default_factory=lambda: {"runs": [], "grand_total_tokens": 0})
