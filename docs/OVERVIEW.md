# Muntazim: what it does today

A plain-English overview for someone who has not seen the code. It ends with questions we want help with: what to add, what to cut, what is weak.

## 1. The idea in one paragraph

An event organiser receives a pile of messy messages: emails, WhatsApp texts, notices, in English and Roman Urdu. Facts change, some messages are wrong, some come from people who have no authority. Muntazim reads that pile and produces one event plan (venue, people, food, judging, schedule, budget). The twist is how it earns trust:

- Messages are treated like **source code**. They are compiled into facts and rules.
- A language model is used for **reading only**. Everything after that is ordinary code that can be explained line by line.
- The plan is **solved and verified** against the rules, the **margin** is measured (how far each input can move before the plan breaks), and the system **attacks itself** to prove its checks work.

This was built for a hackathon (the event is called "Mind to Machine") with strict rules: no facts from the sample messages may appear in the code, one command per input, a full numbered trace of every model call with real token counts, and no more than 2 minutes per full run.

## 2. How you use it

```
python run.py <path-to-text-file>
```

- First time: a **full run**. The whole file goes to the model in one call.
- If a saved `state/` folder exists: the file is treated as **new messages** and the plan is **updated** (at most 5 model calls, normally 1 or 2).
- It prints a trace and writes `out/plan.md` (plan, audit, rulebook, margins, rejected messages) and `out/trace.txt` (every model call, in full).
- `python server.py` serves a dashboard at http://127.0.0.1:8000 that updates live after each run.
- `python attack.py` reruns the self-attack with no model calls. `python preflight.py` is a pre-test safety check.

## 3. The pipeline, step by step

```
raw text -> Reader (the only model call) -> Ledger -> Gatekeeper -> Solver -> Rulebook, Margins, Red team, Audit -> Plan
```

### Reader (uses the model)
- Sends the whole file in one request. The prompt is small and contains a tiny Roman Urdu glossary but no examples from the sample.
- The model returns messages with sender, role, date and a list of **facts**. Each fact has a type (parameter, option, expense, block, constraint, request), a value and an **exact quote** from the message.
- Code then checks the output:
  - **Splits** the file into messages using the first few words the model reports for each one.
  - **Coverage check:** every number in a message must be inside a fact's quote or be marked as deliberately ignored. If numbers are missing, one targeted repair call is made.
  - If the model forgets a quote, code picks the sentence in the message that contains the fact's numbers. If a number is not in the text at all, the fact stays ungrounded.
  - Bad JSON or missing quotes get one repair call. A run never makes more than 3 calls.

### Ledger
- A list of facts that is only ever added to. Facts are **superseded** (replaced by a newer one, linked both ways) or **rejected**, never edited. This allows replaying any earlier step.

### Gatekeeper (plain code, first failure rejects)
1. **Grounding:** the quote must be in the original text and the numbers must be recoverable from it.
2. **Recency:** an older message cannot overwrite a newer fact.
3. **Authority:** every role has things it may set. A caterer can set food prices, not attendee counts. Students can make requests, not decisions. Finance and the organiser own the budget. A claimed approval from a role that cannot approve becomes a mere request.
4. **Hard rules:** meals for everyone on site, teams per judge within the cap, required blocks kept, schedule must fit the duration.
5. **Internal consistency:** if a message states a total, it is recomputed from its parts.
6. **Contradictions:** the higher rank wins, then the newer date. Equal rank and date keeps the existing fact and flags it.
7. **Trial replan:** the change is applied to a copy and solved. If a working plan becomes impossible, it is rejected. If the plan only gets more expensive, it is accepted (a legitimate change that costs more is not a wrong message).

Every rejection records the rule id, a plain reason, and a **drafted reply** to the sender filled from a template (no model).

### Solver (plain code, a pure function)
- `solve(facts)` returns a plan. Same facts in, same plan out.
- It lists every combination of venue, food option and number of judges, drops combinations that break a hard rule or a constraint from a message, and picks: the cheapest feasible venue, the default or standard food tier unless the budget forces a downgrade, the fewest judges that meet the cap, ties to the lowest total.
- Builds a schedule that adds up exactly to the event length: opening, build time, required blocks, a meal, a judging window (judges work in parallel), results.
- Budget lines carry the ids of the facts they came from. Requested items (a DJ, for example) are shown as optional and never counted.
- Constraint types the system does not know are kept visible as "unsupported" and never dropped silently.

### Rulebook, margins, red team, audit (plain code, no model)
- **Rulebook:** every active fact and invariant becomes a readable rule with its source quote and its **slack** (how much room is left). Rejected facts are listed under the rule that blocked them.
- **Margins:** for each sensitive input (budget cap, head counts, prices, fees, event length) a binary search finds when the plan **changes** and when it **breaks**.
- **Red team:** about a dozen kinds of deterministic mutations (stale date, authority swap, an altered number, too few meals, removing a required block, too many teams per judge, a budget cut, a false approval, a wrong total, plus two legitimate changes that must be accepted). Each has an expected verdict. The score is shown as matched out of total.
- **Audit:** six checks that recompute figures independently of the solver: correct figures, within budget, venue fits, schedule valid, enough judges, all areas covered.
- **Ablation:** any gatekeeper or solver check can be switched off (without saving) to show what it was protecting, for example "N people without lunch".

## 4. The dashboard

One page, dark editorial design ("Ink and Signal").
- Command bar with status, model calls, tokens, budget used, audit score, attacks caught, export buttons.
- A pipeline strip with a signal pulse per run (only the Reader is marked as using a model).
- Cards for budget, people, venue, food, judging, schedule and audit, each with a slack meter. Clicking a figure highlights the quote it came from in the inbox.
- An inbox of messages with status stamps (Used, Superseded, Rejected, No impact), a strip of rejected messages with drafted replies, and a trace console.
- A scroll-driven **Lab**: compiled facts beside raw text, the rulebook, margins, the red team with "break it live" switches, and a "try to fool it" box (clearly labelled as changing the saved plan).
- **Judge mode** (press J): a four-step guided tour with talking points.
- Command palette (Ctrl K) and keyboard shortcuts.

## 5. What we measured on the real sample (one real model, six rotating keys)

- A full run takes roughly ten seconds, 2 model calls, a few thousand tokens.
- An update run takes about 6 seconds, 2 calls, roughly 2,700 tokens.
- Across four consecutive full runs the final plan was identical and arithmetically correct. The red team scored full marks every time.
- A legitimate newer price was accepted and only the food and budget areas were recomputed. An unauthorised price change from a student was rejected.

## 6. Known weaknesses (please attack these)

1. **The audit cannot see what the reader missed.** If the model fails to extract a fact (for example the event length), the plan is built without it and the audit still passes, because the audit checks consistency, not completeness. We saw an update run with a build period far longer than the stated event. This is the biggest gap.
2. **Model output is not stable.** The same input can produce different shapes (quotes missing, options without a category, fees typed as expenses). We patched many of these in code, so the output converges, but it took repeated fixes, and the model is run at low reasoning effort because higher effort returned empty output.
3. **Fixed vocabulary.** Parameters and metrics come from a short list. Unknown ones are kept visible but cannot influence the plan.
4. **One event shape.** The solver assumes one venue, one food option, parallel judges, one meal. Multi-day events, several sessions or several meals do not fit.
5. **Dates:** many messages have no year. We use a placeholder year so ordering still works, but mixed formats could mis-order messages.
6. **Authority is a hand-written table.** An unfamiliar role is allowed to act unless it contradicts a higher-ranked fact, which can be too permissive or too strict.
7. **Planner policy is arbitrary.** Opening, meal, results and minimum build lengths are named constants chosen by us, not learned or asked for.
8. **The red team tests our code, not the reader.** It mutates facts we already extracted, so it cannot say whether the reader missed or invented anything.
9. **Only tried on one sample pack.** Extra test packs (Roman Urdu, lakh and k numbers, unknown senders, plausible but wrong updates) have not been run yet.
10. **Drafted replies are templates.** They are accurate but stiff.

## 7. Questions for brainstorming

**Add**
- A completeness check: a list of things any plan needs (duration, headcount, cap) and a clear warning when one is missing, instead of silently planning around it.
- A second independent reader (a different model or a rule-based pass) to cross-check numbers. Worth the extra call?
- Letting the user answer questions the system has ("I could not find the event length, what is it?") inside the dashboard.
- Multiple plan options with trade-offs (cheaper vs safer margin) instead of one answer.
- Exporting the drafted replies as ready-to-send messages.
- What would make the margins more useful to a real organiser?

**Remove or simplify**
- Is the Lab too much for a judge with limited time? Which panels carry the pitch, and which are decoration?
- Is judge mode necessary, or is the terminal output enough?
- Are the "try to fool it" and break-it-live features worth the risk of a demo going wrong?

**Challenge**
- Is "only reading uses a model" a strength, or does it just hide the model's mistakes in a place the audit cannot see?
- What would a hostile judge send to break the gatekeeper? What input would produce a confident but wrong plan?
- Is the authority table the right idea, or should authority come from the messages themselves?
- Which of the weaknesses above would you fix first with a few hours left?
