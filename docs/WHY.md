# Why Muntazim is built this way

Pitch: we treat messages like source code. We compile them into rules, solve and verify the plan against those rules, measure how much margin the plan has, and attack our own system to prove it holds. Only reading uses a model. Everything else is plain, explainable code.

Each entry: purpose, what breaks without it, and the alternative we rejected.

## Modules

**run.py**
- Purpose: one command for every input. No state means a full run; existing state means the file holds new messages and the plan is updated.
- Breaks without it: the user would need flags or a manual mode switch, and a wrong flag could wipe a good plan.
- Rejected: separate `init` and `update` commands. They invite the wrong command at the wrong time.

**core/reader.py**
- Purpose: the only code that calls a model. It sends the whole file once and gets quoted facts back.
- Breaks without it: Roman Urdu, WhatsApp threads and emails in free form cannot be parsed with rules.
- Rejected: one call per message (slower, more tokens, loses context across messages) and regex parsing (brittle on unseen formats).

**core/llm.py**
- Purpose: a small OpenAI-compatible client with key rotation on the same model, an allowlist, and token counts taken from the API `usage` field.
- Breaks without it: one rate-limited key stops the run; a wrong model name could silently change behaviour.
- Rejected: switching to a different model on failure. That would change results mid-run and make the trace misleading.

**core/numbers.py**
- Purpose: finds and normalizes every number in text (lakh, k, commas, currency marks, units).
- Breaks without it: the grounding check and the coverage check cannot tell whether a number came from the message.
- Rejected: asking the model to confirm its own numbers. A model checking itself is not independent.

**core/schema.py**
- Purpose: one definition of the state file so the CLI, server and dashboard agree.
- Breaks without it: the dashboard would guess field names and break when the CLI changes.
- Rejected: free-form dictionaries. They fail silently.

**core/ledger.py**
- Purpose: an event-sourced list of facts. Facts are added, superseded or rejected, never edited, so any earlier step can be replayed.
- Breaks without it: after an update nobody could say which message a figure came from or what it replaced.
- Rejected: overwriting values in place, which loses history.

**core/gatekeeper.py**
- Purpose: decides if a new fact may enter the ledger. Checks run in a fixed order and the first failure rejects with a reason and a drafted reply.
- Breaks without it: a stale quote, a message from someone without authority, or a total that does not add up would change the plan.
- Rejected: trusting the model to flag bad messages. It only flags contradictions; code decides.

**core/solver.py**
- Purpose: a pure function from facts to a plan. Same facts in, same plan out.
- Breaks without it: updates, margins, attacks and what-if would each need their own logic or a model call.
- Rejected: asking the model to write the plan. It cannot prove totals, and results would vary run to run.

**core/rules.py**
- Purpose: compiles active facts and invariants into a readable rulebook, each rule with its source quote and slack.
- Breaks without it: a judge sees a plan but not the reasons it is allowed to exist.
- Rejected: describing the rules in prose only. Prose cannot be checked.

**core/margins.py**
- Purpose: slack per rule and breaking points per input, found by searching the solver.
- Breaks without it: a plan that is valid but one small change from failing looks the same as a safe plan.
- Rejected: closed-form formulas per input. They go stale the moment the solver changes.

**core/attack.py**
- Purpose: deterministic mutations of known facts, each with an expected verdict, to test the gatekeeper and solver.
- Breaks without it: "the checks work" is a claim with no evidence.
- Rejected: asking the model to invent adversarial messages. It is slow, costs tokens and is not repeatable.

**core/audit.py**
- Purpose: six independent checks that recompute the figures from the facts rather than trusting the solver.
- Breaks without it: a solver bug would pass unnoticed.
- Rejected: reusing the solver's own numbers for the audit.

**core/trace.py**
- Purpose: records every model call with its input, output and API token counts, and prints the run.
- Breaks without it: nobody can verify what the model saw or what it cost.
- Rejected: estimating tokens locally. Only the API count is trustworthy.

**preflight.py**
- Purpose: a zero-call safety check before the test: no pack values in the source, clean git, no stale state, a valid `.env`, a built dashboard.
- Breaks without it: one leaked value in a comment would disqualify the entry.
- Rejected: relying on a manual review.

**server.py**
- Purpose: serves the dashboard and a few read-only endpoints. It never changes state except `/api/send`, which is labelled as a demo.
- Breaks without it: the dashboard has no data source.
- Rejected: making the CLI depend on the server. The core must work with the dashboard broken.

## Dashboard panels

- **Command bar**: run status and the numbers a judge asks for first. Without it they would have to hunt for model calls and tokens.
- **Pipeline strip**: shows Reader, Ledger, Gatekeeper, Solver and Verifier, with only Reader marked as using a model.
- **Budget, People, Venue, Food, Judging, Schedule**: the plan. Each figure links to its source quote.
- **Audit**: six checks that tick in sequence. Without it the plan is unverified.
- **Inbox**: every message with its status stamp. Without it, "ignored" and "rejected" would be invisible.
- **Rejected strip**: the rejected message, the rule and a drafted reply. This is the proof that wrong messages do not change the plan.
- **Trace console**: numbered calls and events. Collapsed to five lines by default.
- **Lab**: a scroll-driven walk through the pipeline: compile view, rulebook, margins, red team, break-it-live, and try-to-fool-it.
- **Judge mode**: a four step guided tour so any teammate can walk a judge through the system.

## Questions a judge may ask

**Why one model call?** Reading is the only step that needs language understanding, and the whole file fits in one call. One call keeps cross-message context and keeps the token count low. A second call happens only for a repair, and never more than three in a run.

**Why plain code for the arithmetic?** Code gives the same answer every time and can be proven. Models make arithmetic slips and cannot show their work in a way we can verify.

**How is a wrong message detected?** The quote must appear in the source and every number in the fact must be recoverable from the quote. Then recency (older never beats newer), authority (a role may only change what it owns), hard rules, total consistency and finally a trial replan. A message that makes the plan impossible is rejected; one that only makes it cost more is accepted.

**What about a constraint we have never seen?** It is kept as an unsupported constraint, shown in the plan, the rulebook and the trace. It is never dropped silently.

**How are token counts measured?** Only from the `usage` field the API returns. We never estimate. A response without usage is treated as a failed attempt.

**What happens with bad JSON?** One repair call. If that also fails, nothing is extracted and the saved state is untouched.

**Why do updates only touch some areas?** The solver recomputes everything, but we forecast which areas an input can reach and compare it with what actually changed. The trace prints both, so the forecast is checked every time.

**Why does key rotation keep the same model?** Different models read differently. Rotating keys only gets around rate limits and keeps the results comparable.

**What does the coverage check catch?** A number in a message that is neither inside an extracted fact nor deliberately ignored. That is a fact the model probably missed, so it gets one targeted repair call.

**What does the red team test, and what does it not?** It mutates facts that were already extracted and checks the gatekeeper and solver respond correctly. It does not test whether the reader extracts the right facts. That is covered by grounding, the coverage check and reading the output.

## Judge tour

### 1. The plan and the audit
- Every figure here comes from plain code and links back to a quoted message.
- The six audit checks recompute the figures independently of the solver.

### 2. A rejected message
- Each rejection names the rule, the reason and a drafted reply to the sender.
- A change that only costs more is accepted. Only changes that make the plan impossible, stale, ungrounded or unauthorised are rejected.

### 3. Break it live
- Switch a check off and the red team score drops, the audit fails and the human impact shows.
- Nothing here is saved, and no model is called.

### 4. The rulebook
- Messages compile into rules with a source quote and slack, next to the planner's own policy rules.
- Only the Reader uses a model. Everything else is plain, explainable code.
