import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";
import { Msg, Rej, State, money } from "../api";
import { Chip, Delta, Meter, Odometer, SrcBtn, STATUS_COLOR, Stamp, useTick } from "./ui";

export const latestRun = (s: State) => s.trace.runs[s.trace.runs.length - 1];
const allCalls = (s: State) => s.trace.runs.reduce((n, r) => n + r.calls.length, 0);

/* ------------------------------------------------------------------ command bar */
export function CommandBar({ s, busy, onJudge, onPalette }: { s: State; busy: boolean; onJudge: () => void; onPalette: () => void }) {
  const a = s.audit || [];
  const pass = a.filter((x) => x.pass).length;
  const rejected = s.rejections.length;
  const status = busy ? "Reading" : !s.run_id ? "Idle" : rejected ? `${rejected} rejected` : pass === a.length && a.length ? "Verified" : "Solving";
  const color = busy ? "var(--signal)" : rejected ? "var(--bad)" : pass === a.length && a.length ? "var(--ok)" : "var(--mute)";
  const b = s.plan?.budget;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur-none" data-judge-keep>
      <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-2">
        <span className="serif text-[28px] leading-none tracking-tight">Muntazim</span>
        <Chip color={color}>{status}</Chip>
        <div className="ml-2 hidden items-center gap-2 lg:flex">
          <Chip><span className="num">{allCalls(s)}</span> model calls</Chip>
          <Chip><span className="num">{(s.trace.grand_total_tokens || 0).toLocaleString("en-US")}</span> tokens</Chip>
          {b && <Chip><span className="num">{money(b.total)}</span>{b.cap != null && <> of <span className="num">{money(b.cap)}</span></>} used</Chip>}
          <Chip color={pass === a.length && a.length ? "var(--ok)" : "var(--bad)"}>audit <span className="num">{pass}/{a.length || 6}</span></Chip>
          {s.attack?.total != null && <Chip>attacks caught <span className="num">{s.attack.matched}/{s.attack.total}</span></Chip>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="chip hover:text-text" onClick={onJudge}>Judge mode <kbd className="num text-mute">J</kbd></button>
          <button className="chip hover:text-text" onClick={onPalette}><kbd className="num">Ctrl K</kbd></button>
          <a className="chip hover:text-text" href="/api/export/plan" download>plan.md</a>
          <a className="chip hover:text-text" href="/api/export/trace" download>trace.txt</a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ pipeline strip */
export function Pipeline({ s }: { s: State }) {
  const reduce = useReducedMotion();
  const pulse = useTick(s.run_id, 1600);
  const run = latestRun(s);
  const nodes = [
    { name: "Reader", n: run?.calls.length ?? 0, sub: "calls", model: true },
    { name: "Ledger", n: s.facts.filter((f) => f.status === "active").length, sub: "active facts" },
    { name: "Gatekeeper", n: s.rejections.length, sub: "rejected" },
    { name: "Solver", n: s.plan?.budget?.lines?.length ?? 0, sub: "budget lines" },
    { name: "Verifier", n: (s.audit || []).filter((x) => x.pass).length, sub: "of 6 checks" },
  ];
  return (
    <div className="relative mx-auto max-w-[1800px] px-4 py-2" data-judge="pipeline">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
        {pulse && !reduce && (
          <motion.div className="absolute top-1/2 -mt-[3px] h-[6px] w-[6px] rounded-full bg-signal" initial={{ left: "0%" }} animate={{ left: "100%" }} transition={{ duration: 1.4, ease: "easeInOut" }} />
        )}
        {nodes.map((n) => (
          <div key={n.name} className="relative z-10 flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-1">
            <div className="flex items-center gap-2 text-13">
              {n.name}
              {n.model && <span className="num rounded border border-signal/40 px-1 text-12 text-signal">model</span>}
              <span className="text-12 text-mute"><span className="num text-dim">{n.n}</span> {n.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cards */
function Card({ id, title, span, children, open, onOpen, right }: { id: string; title: string; span: string; children: ReactNode; open: (id: string) => void; onOpen?: never; right?: ReactNode }) {
  return (
    <motion.div layoutId={`card-${id}`} data-judge={id} onClick={() => open(id)} className={`card cursor-pointer p-3 hover:border-white/20 ${span}`} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">{title}</span>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

function ruleMeters(s: State, area: string) {
  return (s.rules || []).filter((r) => r.kind === "hard" && r.area === area && typeof r.lhs === "number" && typeof r.rhs === "number");
}
function Meters({ s, area }: { s: State; area: string }) {
  const r = ruleMeters(s, area)[0];
  if (!r) return null;
  return (
    <div className="mt-2" title={r.expr}>
      <Meter current={r.lhs} limit={r.rhs} atMost={r.expr.includes("<=") || r.expr.includes("==")} />
      <div className="mt-0.5 flex justify-between text-[11px] leading-none text-mute"><span className="truncate">{r.expr}</span><span className="num ml-2 shrink-0">slack {r.slack}</span></div>
    </div>
  );
}

const SEG = ["rgba(236,234,228,0.9)", "rgba(236,234,228,0.65)", "rgba(236,234,228,0.45)", "rgba(236,234,228,0.3)", "rgba(236,234,228,0.2)", "rgba(236,234,228,0.12)"];

function BudgetCard({ s, open, onSource }: any) {
  const b = s.plan.budget;
  const [hover, setHover] = useState<number | null>(null);
  const total = b.total || 1;
  return (
    <Card id="budget" title="Budget" span="col-span-12 md:col-span-4" open={open} right={b.cap != null && <span className="num text-12 text-mute">cap {money(b.cap)}</span>}>
      <div className="flex items-end gap-3">
        <Odometer value={b.total} size={40} />
        {b.remaining != null && <span className="mb-1 text-13 text-dim"><span className="num">{money(b.remaining)}</span> left</span>}
      </div>
      <div className="mt-3 flex h-2 gap-px" onMouseLeave={() => setHover(null)}>
        {b.lines.map((l: any, i: number) => (
          <motion.div key={l.item} onMouseEnter={() => setHover(i)} initial={false} animate={{ opacity: hover === null || hover === i ? 1 : 0.25 }} style={{ width: `${(l.amount / total) * 100}%`, background: SEG[i % SEG.length], minWidth: 2 }} />
        ))}
      </div>
      <div className="mt-1.5 h-4 text-12">
        {hover !== null ? (
          <span><span className="text-dim">{b.lines[hover].item}</span> <span className="num">{money(b.lines[hover].amount)}</span> <SrcBtn ids={b.lines[hover].sources} onSource={onSource}><span className="num text-mute">{b.lines[hover].sources.join(", ")}</span></SrcBtn></span>
        ) : (
          <span className="text-mute">{b.lines.length} lines, hover a segment for its source</span>
        )}
      </div>
      <Meters s={s} area="budget" />
    </Card>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-3 py-0.5 text-13"><span className="text-mute">{k}</span><span className="num text-right">{v}</span></div>;
}

function Line({ children }: { children: ReactNode }) {
  return <div className="num mt-1 flex flex-wrap gap-x-3 text-12 text-dim">{children}</div>;
}

function PeopleCard({ s, open, onSource }: any) {
  const p = s.plan.people;
  return (
    <Card id="people" title="People" span="col-span-6 md:col-span-2" open={open}>
      <SrcBtn ids={p.sources} onSource={onSource}><Odometer value={p.total} size={36} /></SrcBtn>
      <Line><span><Delta value={p.students} /> students</span><span><Delta value={p.staff} /> staff</span><span><Delta value={p.judges} /> judges</span><span><Delta value={p.teams} /> teams</span></Line>
    </Card>
  );
}
function VenueCard({ s, open, onSource }: any) {
  const v = s.plan.venue;
  return (
    <Card id="venue" title="Venue" span="col-span-6 md:col-span-3" open={open}>
      {v ? (<>
        <div className="serif text-[28px] leading-9"><SrcBtn ids={v.sources} onSource={onSource}><Delta value={v.name} /></SrcBtn></div>
        <Line><span>seats {v.capacity ?? "-"}</span><span><Delta value={v.cost} /></span></Line>
      </>) : <span className="text-mute">no venue option</span>}
      <Meters s={s} area="venue" />
    </Card>
  );
}
function FoodCard({ s, open, onSource }: any) {
  const f = s.plan.food;
  return (
    <Card id="food" title="Food" span="col-span-6 md:col-span-3" open={open}>
      {f ? (<>
        <div className="serif text-[28px] leading-9"><SrcBtn ids={f.sources} onSource={onSource}><Delta value={f.name} /></SrcBtn></div>
        <Line><span>{f.tier}</span><span><Delta value={f.qty} /> meals</span></Line>
      </>) : <span className="text-mute">no food option</span>}
      <Meters s={s} area="food" />
    </Card>
  );
}
function JudgingCard({ s, open, onSource }: any) {
  const j = s.plan.judging;
  return (
    <Card id="judging" title="Judging" span="col-span-6 md:col-span-3" open={open}>
      <div className="flex items-end gap-2"><SrcBtn ids={j.sources} onSource={onSource}><Odometer value={j.judges} size={36} /></SrcBtn><span className="mb-1 text-13 text-dim">judges</span></div>
      <Line><span><Delta value={j.teams_per_judge} /> teams each</span><span><Delta value={j.window_minutes} /> min</span></Line>
      <Meters s={s} area="judging" />
    </Card>
  );
}

function ScheduleCard({ s, open, onSource }: any) {
  const sch = s.plan.schedule as any[];
  const total = sch.reduce((n, x) => n + x.minutes, 0) || 1;
  const step = total > 480 ? 60 : total > 240 ? 30 : 15;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  return (
    <Card id="schedule" title="Schedule" span="col-span-12 md:col-span-6" open={open} right={<span className="num text-12 text-mute">{total} min</span>}>
      <div className="relative">
        <div className="flex h-8 gap-px">
          {sch.map((b, i) => (
            <motion.div key={b.label + i} initial={{ opacity: 0, scaleX: 0.9 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: i * 0.04 }} style={{ width: `${(b.minutes / total) * 100}%`, transformOrigin: "left" }} title={`${b.label} ${b.start}-${b.end}`}
              className="flex min-w-0 flex-col justify-center overflow-hidden border border-line bg-raised px-1.5 text-12 leading-tight">
              <span className="truncate">{b.label}</span>
              <span className="num truncate text-mute">{b.minutes}</span>
            </motion.div>
          ))}
        </div>
        <div className="relative mt-1 h-4">
          {ticks.map((t) => (
            <div key={t} className="absolute top-0" style={{ left: `${(t / total) * 100}%` }}>
              <div className="h-1.5 w-px bg-white/20" />
              <div className="num -ml-3 w-6 text-center text-[10px] text-mute">{t}</div>
            </div>
          ))}
        </div>
      </div>
      <Meters s={s} area="schedule" />
    </Card>
  );
}

function AuditCard({ s, open }: any) {
  const a = s.audit || [];
  const pass = a.filter((x: any) => x.pass).length;
  return (
    <Card id="audit" title="Audit" span="col-span-12 md:col-span-3" open={open} right={<span className="num text-13" style={{ color: pass === a.length ? "var(--ok)" : "var(--bad)" }}>{pass}/{a.length}</span>}>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {a.map((x: any, i: number) => (
          <motion.li key={s.run_id + x.check} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * i }} className="flex items-start gap-2 text-13" title={x.detail}>
            <span className="num mt-0.5" style={{ color: x.pass ? "var(--ok)" : "var(--bad)" }}>{x.pass ? "✓" : "✗"}</span>
            <span>{x.check}</span>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ inbox: ledger tape */
function markText(text: string, quotes: string[]): ReactNode {
  const hits = quotes.map((q) => ({ q, i: text.toLowerCase().indexOf(q.toLowerCase()) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
  if (!hits.length) return text;
  const out: ReactNode[] = []; let at = 0;
  hits.forEach((h, k) => { if (h.i >= at) { out.push(text.slice(at, h.i)); out.push(<mark key={k} className="hl text-text">{text.slice(h.i, h.i + h.q.length)}</mark>); at = h.i + h.q.length; } });
  out.push(text.slice(at));
  return out;
}

export function Inbox({ s, highlight }: { s: State; highlight: string[] }) {
  const factsBy = (mid: string) => s.facts.filter((f) => f.msg_id === mid);
  return (
    <div className="card flex h-full flex-col" data-judge="inbox">
      <div className="flex items-center justify-between px-4 pt-4"><span className="label">Inbox</span><span className="num text-12 text-mute">{s.messages.length} messages</span></div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {s.messages.map((m: Msg) => {
          const fs = factsBy(m.id);
          const hl = fs.filter((f) => highlight.includes(f.id));
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`tape py-3 ${hl.length ? "bg-signal/5" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-12 text-mute">{m.id}</span>
                <span className="text-13">{m.sender || "unknown"}</span>
                <span className="chip">{m.role.replace("_", " ")}</span>
                <span className="num text-12 text-mute">{m.date || "no date"}</span>
                <span className="ml-auto"><Stamp status={m.status} /></span>
              </div>
              <p className="mt-1 line-clamp-4 whitespace-pre-line text-13 text-dim">{markText(m.text || "(boundary not found)", hl.map((f) => f.quote))}</p>
              {m.status !== "used" && m.reason && <p className="mt-1 text-12" style={{ color: STATUS_COLOR[m.status] }}>{m.reason}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rejected strip */
export function Rejected({ rs }: { rs: Rej[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (r: Rej) => { navigator.clipboard?.writeText(r.drafted_reply); setCopied(r.fact_id); setTimeout(() => setCopied(null), 1500); };
  return (
    <section id="rejected" data-judge="rejected" className="min-w-0">
      <div className="mb-2 flex items-baseline gap-3"><h2 className="serif text-[24px] leading-none">Rejected messages</h2><span className="num text-13 text-mute">{rs.length}</span></div>
      {!rs.length ? <div className="card px-4 py-3 text-13 text-mute">Nothing rejected so far. Every fact passed grounding, recency, authority and the hard rules.</div> : (
        <div className="grid max-h-[250px] gap-3 overflow-y-auto md:grid-cols-2">
          {rs.map((r) => (
            <motion.div key={r.fact_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-3" style={{ borderColor: "rgba(240,106,93,0.5)" }}>
              <div className="flex items-center gap-2"><Stamp status="rejected" /><span className="num text-12 text-mute">{r.fact_id} from {r.msg_id}</span><span className="chip num ml-auto" style={{ color: "var(--bad)" }}>{r.rule_id}</span></div>
              <p className="mt-1.5 text-13">“{r.quote}”</p>
              <p className="mt-0.5 line-clamp-2 text-12 text-dim" title={r.reason}>{r.reason}</p>
              <div className="mt-2 rounded border border-line bg-ink p-2 text-12 text-dim">
                <div className="label mb-0.5">Drafted reply</div><span className="line-clamp-2" title={r.drafted_reply}>{r.drafted_reply}</span>
              </div>
              <button className="chip mt-2 hover:text-text" onClick={() => copy(r)}>{copied === r.fact_id ? "Copied" : "Copy reply"}</button>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ trace console */
const EV: Record<string, string> = { retry: "var(--warn)", info: "var(--signal)", reject: "var(--bad)", convert: "var(--warn)", warn: "var(--warn)", ok: "var(--ok)" };

export function TraceConsole({ s, expanded, setExpanded }: { s: State; expanded: boolean; setExpanded: (b: boolean) => void }) {
  const [openCall, setOpenCall] = useState<number | null>(null);
  const lines: { key: string; node: ReactNode }[] = [];
  s.trace.runs.forEach((r) => {
    lines.push({ key: r.run_id, node: <span className="text-mute">run {r.run_id} <span className="chip">{r.mode}</span></span> });
    r.calls.forEach((c) => lines.push({ key: `c${c.n}`, node: (
      <button className="text-left" onClick={() => setOpenCall(openCall === c.n ? null : c.n)}>
        <span className="num text-signal">call #{c.n}</span> <span className="num text-dim">{c.model}</span> <span className="chip">{c.area}</span>{" "}
        <span className="num text-mute">{c.tokens.prompt}+{c.tokens.completion}={c.tokens.total} tok · {c.ms} ms</span>
        {openCall === c.n && (<div className="mt-2 grid gap-2 md:grid-cols-2"><pre className="num max-h-72 overflow-auto rounded border border-line bg-ink p-2 text-12 text-dim">{c.input}</pre><pre className="num max-h-72 overflow-auto rounded border border-line bg-ink p-2 text-12 text-dim">{c.output}</pre></div>)}
      </button>) }));
    r.events.forEach((e, i) => lines.push({ key: `${r.run_id}e${i}`, node: <span className="num text-12" style={{ color: EV[e.kind] || "var(--dim)" }}>· {e.text}</span> }));
    lines.push({ key: r.run_id + "t", node: <span className="num text-12 text-dim">run total {r.total_tokens} tokens{r.duration_s != null && ` in ${r.duration_s}s`}</span> });
  });
  if (s.changes?.recomputed) {
    lines.push({ key: "fc", node: <span className="num text-12 text-signal">forecast areas: {(s.changes.forecast || []).join(", ") || "-"} · changed areas: {s.changes.recomputed.join(", ") || "none"}</span> });
  }
  const shown = expanded ? lines : lines.slice(-5);
  return (
    <section id="trace" data-judge="trace" className="min-w-0">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="serif text-[24px] leading-none">Trace</h2>
        <span className="num text-13 text-mute">{allCalls(s)} calls · {(s.trace.grand_total_tokens || 0).toLocaleString("en-US")} tokens total</span>
        <button className="chip ml-auto hover:text-text" onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse" : "Expand"} <kbd className="num">T</kbd></button>
      </div>
      <motion.div layout className="card space-y-1 p-3 font-mono text-13">
        {shown.map((l) => <div key={l.key}>{l.node}</div>)}
        {!lines.length && <span className="text-mute">No runs yet.</span>}
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ expanded card detail */
export function CardDetail({ id, s, onClose, onSource }: { id: string; s: State; onClose: () => void; onSource: (ids: string[]) => void }) {
  const area = id === "audit" ? "all" : id;
  const rs = (s.rules || []).filter((r) => area === "all" || r.area === area);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <motion.div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div layoutId={`card-${id}`} onClick={(e) => e.stopPropagation()} className="card mt-12 w-full max-w-3xl p-6" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <div className="flex items-center justify-between"><h3 className="serif text-[28px] capitalize">{id}</h3><button className="chip hover:text-text" onClick={onClose}>Close <kbd className="num">Esc</kbd></button></div>
        <div className="label mt-4 mb-2">Rules that govern this area</div>
        {rs.length ? (
          <table className="w-full text-left text-13"><tbody>
            {rs.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="num py-1.5 pr-3 text-mute">{r.id}</td>
                <td className="py-1.5 pr-3">{r.expr}</td>
                <td className="num py-1.5 pr-3">{r.lhs === null ? "" : String(r.lhs)}{r.rhs !== null && ` / ${String(r.rhs)}`}</td>
                <td className="num py-1.5" style={{ color: STATUS_COLOR[r.status] }}>{r.status}{r.slack !== null && ` · slack ${r.slack}`}</td>
              </tr>))}
          </tbody></table>
        ) : <p className="text-13 text-mute">No rules compiled for this area.</p>}
        {id === "budget" && (
          <>
            <div className="label mt-4 mb-2">Lines and sources</div>
            {s.plan.budget.lines.map((l: any) => (
              <div key={l.item} className="flex justify-between border-t border-line py-1.5 text-13"><span>{l.item}</span><span className="num"><SrcBtn ids={l.sources} onSource={(ids) => { onClose(); onSource(ids); }}>{money(l.amount)}</SrcBtn> <span className="text-mute">{l.status}</span></span></div>
            ))}
            {s.plan.budget.optional.map((o: any) => <div key={o.item} className="flex justify-between border-t border-line py-1.5 text-13 text-dim"><span>optional: {o.item}</span><span className="num">{money(o.amount)} {o.fits ? "fits" : "does not fit"}</span></div>)}
          </>
        )}
        {id === "audit" && (s.audit || []).map((a) => <div key={a.check} className="border-t border-line py-1.5 text-13"><span style={{ color: a.pass ? "var(--ok)" : "var(--bad)" }}>{a.pass ? "✓" : "✗"}</span> {a.check}: <span className="text-dim">{a.detail}</span></div>)}
      </motion.div>
    </motion.div>
  );
}
/* ------------------------------------------------------------------ bento */
export function Bento({ s, open, onSource }: { s: State; open: (id: string) => void; onSource: (ids: string[]) => void }) {
  const p = { s, open, onSource };
  const changed = (s.changes?.recomputed || []).length > 0;
  return (
    <div className="grid grid-cols-12 content-start gap-3" data-judge="plan">
      <BudgetCard {...p} /><AuditCard {...p} />
      <PeopleCard {...p} /><VenueCard {...p} /><FoodCard {...p} />
      <JudgingCard {...p} /><ScheduleCard {...p} />
      {changed && (
        <div className="card col-span-12 flex flex-wrap items-center gap-2 px-4 py-2 text-13">
          <span className="label">What changed</span>
          <span className="text-dim">recomputed:</span>{(s.changes.recomputed || []).map((a) => <span key={a} className="chip flash">{a}</span>)}
          <span className="ml-3 text-dim">unchanged:</span>{(s.changes.unchanged || []).map((a) => <span key={a} className="chip">{a}</span>)}
        </div>
      )}
    </div>
  );
}

export { AnimatePresence };
