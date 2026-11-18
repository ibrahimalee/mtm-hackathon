import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { State, post } from "../api";
import { Help, Odometer, PageHeader, Stamp, Tabs } from "../kit";
import { STATUS_VAR, money } from "../lib";

const OP: Record<string, string> = {
  stale_date: "An out-of-date message tries to overwrite a newer fact", authority_swap: "Someone without authority changes a fact",
  ungrounded_number: "A number that is not in the message", below_headcount_quantity: "Fewer meals ordered than people",
  remove_required_block: "A required block is removed from the schedule", exceed_judge_cap: "More teams per judge than allowed",
  infeasible_budget_cut: "The budget is cut below the minimum possible", false_approval: "A sender claims an approval they cannot give",
  bad_total: "A stated total does not match its parts", legit_price_rise_within_budget: "A real price rise that still fits (must be accepted)",
  legit_newer_update: "A real newer update (must be accepted)",
};
const IMPACT: Record<string, (n: number) => string> = {
  people_without_meal: (n) => `${n} people without a meal`, people_without_seat: (n) => `${n} people without a seat`,
  over_budget: (n) => `${money(n)} over budget`, teams_unjudged: (n) => `${n} teams unjudged`, minutes_overrun: (n) => `${n} minutes past the end`,
};

function Rulebook({ s }: { s: State }) {
  const areas = useMemo(() => ["all", ...Array.from(new Set((s.rules || []).map((r) => r.area)))], [s.rules]);
  const [area, setArea] = useState("all");
  const rs = (s.rules || []).filter((r) => area === "all" || r.area === area);
  const kind = (k: string) => (k === "hard" ? "Must hold" : k === "message_constraint" ? "From a message" : "Planner default");
  return (
    <div data-tour="rulebook">
      <p className="mb-4 max-w-2xl text-ink2">Messages are compiled into rules, like source code. Each rule shows how much room (slack) is left and where it came from. A fact that would break a rule is rejected and listed under it.</p>
      <div className="mb-4 flex flex-wrap gap-1.5">{areas.map((a) => <button key={a} onClick={() => setArea(a)} className={`chip ${a === area ? "!border-ink !bg-ink !text-sheet2" : "hover:border-ink"}`}>{a}</button>)}</div>
      <div className="sheet">
        {rs.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.03 }} className="dash px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="mono w-24 text-[12px] text-ink3">{r.id}</span>
              <span className="flex-1 text-[15px]">{r.expr}</span>
              <span className="chip">{kind(r.kind)}</span>
              <span className="mono w-24 text-right text-[13px]" style={{ color: STATUS_VAR[r.status] }}>{r.status}{r.slack !== null && ` · ${r.slack}`}</span>
            </div>
            <div className="mt-1 pl-[108px] text-[12px] text-ink3">{typeof r.source === "string" ? r.source : `${r.source.sender}, ${r.source.msg_id}: “${r.source.quote}”`}</div>
            {r.rejected.map((x) => <div key={x.fact_id} className="mt-1 pl-[108px] text-[13px]"><s className="text-ink3">“{x.quote}”</s> <span className="text-accent">blocked:</span> <span className="text-ink2">{x.reason}</span></div>)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Margins({ s }: { s: State }) {
  const pts = s.margins?.breaking_points || [];
  return (
    <div data-tour="margins">
      <p className="mb-4 max-w-2xl text-ink2">How far can each input move before the plan <b className="text-amber">changes</b> or becomes <b className="text-accent">impossible</b>? Found by searching the planner, with no AI. A short distance means a fragile plan.</p>
      <div className="sheet">
        {pts.map((p: any, i: number) => {
          const vals = [p.current, p.changes_at, p.breaks_at].filter((v: any) => v !== null && v !== undefined);
          const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
          const pos = (v: number) => `${((v - lo) / span) * 92 + 4}%`;
          return (
            <div key={i} className="dash grid grid-cols-12 items-center gap-3 px-4 py-3 first:border-t-0">
              <div className="col-span-4"><div className="text-[14px]">{p.input}</div><div className="text-[12px] text-ink3">{p.direction} {money(p.current)}</div></div>
              <div className="relative col-span-5 h-6">
                <div className="absolute inset-x-0 top-3 h-px bg-line2" />
                {p.changes_at != null && <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03 }} className="absolute top-0 h-6 w-[2px] bg-amber" style={{ left: pos(p.changes_at) }} />}
                {p.breaks_at != null && <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.03 + 0.1 }} className="absolute top-0 h-6 w-[2px] bg-accent" style={{ left: pos(p.breaks_at) }} />}
                <div className="absolute top-[5px] h-[14px] w-[6px] bg-ink" style={{ left: pos(p.current) }} />
              </div>
              <div className="mono col-span-3 text-right text-[12px]"><span className="text-amber">{p.changes_at != null ? money(p.changes_at) : "-"}</span> / <span className="text-accent">{p.breaks_at != null ? money(p.breaks_at) : "never"}</span></div>
            </div>
          );
        })}
        {!pts.length && <p className="p-4 text-ink2">No margins yet.</p>}
      </div>
    </div>
  );
}

function Attack({ s }: { s: State }) {
  const a = s.attack;
  return (
    <div>
      <p className="mb-5 max-w-2xl text-ink2">We attack our own system with deliberately bad messages built from the real facts, and check that each is rejected. Two legitimate changes are included to prove good updates still get through. <i>These test the checks, not the AI reader.</i></p>
      <div className="sheet pad mb-6 flex flex-wrap items-end gap-4"><Odometer value={a?.matched} size={72} /><span className="serif mb-2 text-[34px] text-ink3">of {a?.total ?? "-"}</span><span className="mb-3 text-ink2">attacks got the expected verdict</span></div>
      <div className="sheet">
        {Object.entries(a?.by_operator || {}).map(([op, v]: any) => (
          <div key={op} className="dash grid grid-cols-12 items-center gap-3 px-4 py-3 first:border-t-0">
            <span className="col-span-6 text-[14px]">{OP[op] || op}</span>
            <div className="col-span-4 h-2 bg-line2"><motion.div initial={{ width: 0 }} animate={{ width: `${(v.matched / v.total) * 100}%` }} transition={{ duration: 0.8 }} className="h-full" style={{ background: v.matched === v.total ? "var(--green)" : "var(--accent)" }} /></div>
            <span className="mono col-span-2 text-right text-[12px] text-ink2">{v.matched}/{v.total} {v.expected === "reject" ? "blocked" : "accepted"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Break({ s }: { s: State }) {
  const [checks, setChecks] = useState<{ id: string; label: string; layer: string }[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [res, setRes] = useState<any>(null);
  useEffect(() => { fetch("/api/checks").then((r) => r.json()).then(setChecks).catch(() => {}); }, []);
  useEffect(() => { if (!off.length) { setRes(null); return; } post("/api/ablate", { disabled: off }).then(setRes).catch(() => setRes(null)); }, [off, s.run_id]);
  const toggle = (id: string) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const impacts = res ? Object.entries(res.impact || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => IMPACT[k]?.(v as number)).filter(Boolean) : [];
  const a = res?.attack || s.attack;
  return (
    <div data-tour="breakit">
      <p className="mb-5 max-w-2xl text-ink2">Every check protects something. Switch one off and see what goes wrong. This is a simulation: nothing is saved and no AI is used.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sheet pad">
          <div className="mb-3 flex items-center"><span className="serif text-[26px]">Checks</span><button className="btn ghost ml-auto" onClick={() => setOff([])}>Switch all on</button></div>
          {(["gatekeeper", "solver"] as const).map((layer) => (
            <div key={layer} className="mb-3">
              <div className="kicker mb-1">{layer === "gatekeeper" ? "Stops bad messages" : "Keeps the plan possible"}</div>
              {checks.filter((c) => c.layer === layer).map((c) => {
                const on = !off.includes(c.id);
                return <div key={c.id} className="dash flex items-center justify-between gap-3 py-2"><span className="text-[14px]">{c.label}</span><button role="switch" aria-checked={on} aria-label={c.label} className="toggle" onClick={() => toggle(c.id)} /></div>;
              })}
            </div>
          ))}
        </div>
        <div className="sheet pad crop">
          <div className="serif mb-3 text-[26px]">What happens</div>
          <div className="flex items-end gap-3"><Odometer value={a?.matched} size={56} /><span className="serif mb-1 text-[26px] text-ink3">of {a?.total ?? "-"} attacks handled</span></div>
          {!res ? <p className="mt-4 text-ink2">Everything is switched on, so every attack is stopped. Switch a check off.</p> : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3 text-[14px]">
              <div className="flex items-center gap-2">Audit <Stamp status={res.audit_passed === 6 ? "used" : "rejected"} label={`${res.audit_passed} of 6`} /></div>
              {res.audit.filter((x: any) => !x.pass).map((x: any) => <div key={x.check} className="text-accent">✗ {x.check}: {x.detail}</div>)}
              {impacts.length > 0 && <div className="rounded border-2 border-accent p-3 text-accent"><div className="kicker mb-1 !text-accent">Real-world impact</div>{impacts.map((t) => <div key={t as string} className="text-[16px]">{t}</div>)}</div>}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Verify({ s, tab, setTab }: { s: State; tab: string; setTab: (t: string) => void }) {
  return (
    <div>
      <PageHeader kicker="Stress tests" title="Proof that the plan holds.">
        A plan is only useful if you can trust it. These four views show the rules behind it, how much room it has, how it survives attack, and what each safety check is protecting.
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "rulebook", label: "Rulebook" }, { id: "margins", label: "Room to move" }, { id: "attack", label: "Self-attack" }, { id: "break", label: "Break it live" }]} />
      {tab === "rulebook" && <Rulebook s={s} />}
      {tab === "margins" && <Margins s={s} />}
      {tab === "attack" && <Attack s={s} />}
      {tab === "break" && <Break s={s} />}
    </div>
  );
}
