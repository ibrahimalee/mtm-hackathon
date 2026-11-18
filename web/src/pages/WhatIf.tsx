import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { State, post } from "../api";
import { Chip, Empty, Odometer, PageHeader, Stamp } from "../kit";
import { cap, money } from "../lib";

const FRIENDLY: Record<string, string> = {
  "budget.cap": "Budget cap", "people.students": "Number of students", "people.staff": "Number of staff", "event.minutes": "Event length (minutes)",
  "judge.fee": "Fee per judge", "judges.available": "Judges available", "judge.max_teams": "Teams one judge may cover", "judge.minutes_per_team": "Judging minutes per team",
  "team.size": "Team size", "food.qty": "Meals ordered",
};
const IMPACT: Record<string, (n: number) => string> = {
  people_without_meal: (n) => `${n} people without a meal`, people_without_seat: (n) => `${n} people without a seat`,
  over_budget: (n) => `${money(n)} over budget`, teams_unjudged: (n) => `${n} teams unjudged`, minutes_overrun: (n) => `${n} minutes past the end`,
};

export default function WhatIf({ s, go }: { s: State; go: (to: string) => void }) {
  const points = useMemo(() => {
    const seen = new Set<string>(); const out: any[] = [];
    (s.margins?.breaking_points || []).forEach((p: any) => { if (!seen.has(p.fact_id)) { seen.add(p.fact_id); out.push(p); } });
    return out.map((p) => {
      const c = [p.current, p.changes_at, p.breaks_at].filter((v) => v !== null && v !== undefined) as number[];
      let lo = Math.min(...c), hi = Math.max(...c);
      if (lo === hi) { lo = Math.floor(p.current * 0.5); hi = Math.ceil(p.current * 1.5) + 1; }
      else { const pad = (hi - lo) * 0.25; lo = Math.max(0, Math.floor(lo - pad)); hi = Math.ceil(hi + pad); }
      return { ...p, lo, hi, step: Math.max(1, Math.round((hi - lo) / 400)) };
    });
  }, [s.margins]);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const t = useRef<any>(null);
  const changed = points.filter((p) => vals[p.fact_id] !== undefined && vals[p.fact_id] !== p.current);
  useEffect(() => {
    clearTimeout(t.current);
    if (!changed.length) { setRes(null); return; }
    setBusy(true);
    t.current = setTimeout(() => {
      post("/api/whatif", { overrides: Object.fromEntries(changed.map((p) => [p.fact_id, vals[p.fact_id]])) }).then(setRes).catch(() => setRes(null)).finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(t.current);
  }, [JSON.stringify(vals), s.run_id]);

  if (!points.length) return <Empty title="Nothing to adjust yet" action={<button className="btn primary" onClick={() => go("/compose")}>Add messages</button>}>Once a plan exists, its inputs show up here as sliders.</Empty>;
  const base = s.plan;
  const r = res?.plan;
  const ok = !res || r?.feasible;
  const impacts = res ? Object.entries(res.impact || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => IMPACT[k]?.(v as number)).filter(Boolean) : [];
  return (
    <div>
      <PageHeader kicker="What-if" title="Move an input. Watch the plan react." actions={<button className="btn ghost" onClick={() => setVals({})}>Reset all</button>}>
        Drag a slider to see what would happen if a number were different. The amber mark shows where the plan starts to change; the red mark is where it becomes impossible. Nothing here is saved and no AI is used.
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3" data-tour="sliders">
          {points.map((p, i) => {
            const v = vals[p.fact_id] ?? p.current;
            const pct = (x: number) => `${((x - p.lo) / (p.hi - p.lo)) * 100}%`;
            const dirty = v !== p.current;
            return (
              <motion.div key={p.fact_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="sheet p-4">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-[15px] font-medium">{FRIENDLY[p.input] || cap(p.input)}</span>
                  <span className="mono ml-auto text-[18px]" style={{ color: dirty ? "var(--accent)" : "var(--ink)" }}>{money(v)}</span>
                  {dirty && <button className="mono text-[11px] text-ink3 underline" onClick={() => setVals((o) => { const n = { ...o }; delete n[p.fact_id]; return n; })}>reset</button>}
                </div>
                <div className="relative">
                  <input type="range" min={p.lo} max={p.hi} step={p.step} value={v} aria-label={p.input} onChange={(e) => setVals((o) => ({ ...o, [p.fact_id]: +e.target.value }))} />
                  <div className="pointer-events-none absolute inset-x-[9px] top-[18px] h-3">
                    <div className="absolute top-0 h-3 w-px bg-ink" style={{ left: pct(p.current) }} title="current" />
                    {p.changes_at != null && <div className="absolute top-0 h-3 w-[2px] bg-amber" style={{ left: pct(p.changes_at) }} />}
                    {p.breaks_at != null && <div className="absolute top-0 h-3 w-[2px] bg-accent" style={{ left: pct(p.breaks_at) }} />}
                  </div>
                </div>
                <div className="mono mt-3 flex justify-between text-[11px] text-ink3">
                  <span>current {money(p.current)}</span>
                  <span>{p.changes_at != null && <span className="text-amber">changes at {money(p.changes_at)} </span>}{p.breaks_at != null && <span className="text-accent">· breaks at {money(p.breaks_at)}</span>}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="lg:col-span-2">
          <div className="sticky top-6"><div className="sheet pad crop" data-tour="whatif-result">
            <div className="mb-3 flex items-center gap-2"><span className="serif text-[28px]">Result</span><span className="ml-auto">{!changed.length ? <Chip>unchanged</Chip> : busy ? <Chip color="var(--amber)">calculating</Chip> : ok ? <Stamp status="used" label="Still works" /> : <Stamp status="rejected" label="Breaks" />}</span></div>
            <AnimatePresence mode="wait">
              {ok ? (
                <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {[["Total cost", base.budget.total, r?.budget?.total], ["Left in budget", base.budget.remaining, r?.budget?.remaining], ["Judges", base.judging.judges, r?.judging?.judges], ["People on site", base.people.total, r?.people?.total]].map(([k, a, b]: any) => (
                    <div key={k} className="dash flex items-center justify-between py-2.5"><span className="text-ink2">{k}</span><span className="flex items-baseline gap-2">{b !== undefined && b !== null && b !== a && <span className="mono text-[12px] text-ink3 line-through">{money(a)}</span>}<Odometer value={b ?? a} size={26} className="mono" /></span></div>
                  ))}
                  <div className="dash flex justify-between py-2.5"><span className="text-ink2">Venue</span><span className="serif text-[22px]">{r?.venue?.name ?? base.venue?.name}</span></div>
                  <div className="dash flex justify-between py-2.5"><span className="text-ink2">Food</span><span className="serif text-[22px]">{r?.food?.name ?? base.food?.name}</span></div>
                  {res?.changed?.length > 0 && <div className="dash pt-3"><div className="kicker mb-1">Parts of the plan that changed</div><div className="flex flex-wrap gap-1">{res.changed.map((a: string) => <Chip key={a} color="var(--accent)">{a}</Chip>)}</div></div>}
                  {res?.audit && <div className="mono mt-3 text-[12px] text-ink2">Audit would score {res.audit.filter((a: any) => a.pass).length}/{res.audit.length}</div>}
                </motion.div>
              ) : (
                <motion.div key="bad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-[15px]">With those values no plan can satisfy every rule. {r?.reasons?.[0]?.msg ? <>The closest attempt failed because: <b>{r.reasons[0].msg}</b>.</> : null}</p>
                  {impacts.length > 0 && <div className="mt-3 rounded border border-accent p-3 text-accent">{impacts.map((x) => <div key={x as string}>{x}</div>)}</div>}
                </motion.div>
              )}
            </AnimatePresence>
            <p className="mt-4 text-[12px] text-ink3">Nothing is saved. This runs the same plain-code solver as the real plan.</p>
          </div></div>
        </div>
      </div>
    </div>
  );
}
