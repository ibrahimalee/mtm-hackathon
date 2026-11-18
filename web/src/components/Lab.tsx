import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Fact, State, money, post } from "../api";
import { Odometer, STATUS_COLOR } from "./ui";

const STAGES = [
  { id: "reader", name: "Reader", model: true, line: "The only step that uses a model. It turns messy text into quoted facts." },
  { id: "gatekeeper", name: "Gatekeeper", line: "Facts become rules. A fact that breaks one is rejected with a reason." },
  { id: "solver", name: "Solver", line: "Plain code plans against the rules, then measures how much room is left." },
  { id: "verifier", name: "Verifier", line: "We attack our own system and switch checks off to prove each one matters." },
  { id: "fool", name: "Try to fool it", line: "Send your own message through the full pipeline." },
];

const fmtFact = (f: Fact) => {
  const x = f.x || {};
  if (f.type === "param") return `${f.key} = ${f.value}`;
  if (f.type === "option") return `${x.category || "option"} "${x.name || f.key}" ${x.basis || ""} price ${x.price}${x.capacity != null ? `, seats ${x.capacity}` : ""}${x.tier ? `, ${x.tier}` : ""}`;
  if (f.type === "expense") return `expense "${x.item || f.key}" = ${x.amount} (${x.status || "committed"})`;
  if (f.type === "block") return `block "${x.name || f.key}" = ${x.minutes} min${x.at ? ` at ${x.at}` : ""}`;
  if (f.type === "constraint") return `${x.metric} ${x.op} ${x.value}`;
  return `request: ${f.quote}`;
};

function Section({ id, title, line, children }: { id: string; title: string; line: string; children: ReactNode }) {
  return (
    <section id={`lab-${id}`} data-stage={id} className="min-h-[70vh] py-10">
      <h3 className="serif text-[44px] leading-none">{title}</h3>
      <p className="mt-2 mb-6 max-w-xl text-14 text-dim">{line}</p>
      {children}
    </section>
  );
}

/* ---- reader: compile view ---- */
function Compile({ s }: { s: State }) {
  const [hover, setHover] = useState<string | null>(null);
  const facts = s.facts.filter((f) => f.status === "active");
  const reduce = useReducedMotion();
  const quoteOf = hover ? s.facts.find((f) => f.id === hover)?.quote : null;
  const render = (text: string, msgId: string) => {
    const mine = facts.filter((f) => f.msg_id === msgId && f.quote && text.toLowerCase().includes(f.quote.toLowerCase()));
    if (!mine.length) return text;
    const hits = mine.map((f) => ({ f, i: text.toLowerCase().indexOf(f.quote.toLowerCase()) })).sort((a, b) => a.i - b.i);
    const out: ReactNode[] = []; let at = 0;
    hits.forEach(({ f, i }) => {
      if (i < at) return;
      out.push(text.slice(at, i));
      out.push(<mark key={f.id} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)} className={hover === f.id ? "hl text-text" : "bg-transparent text-text underline decoration-mute decoration-dotted underline-offset-4"}>{text.slice(i, i + f.quote.length)}</mark>);
      at = i + f.quote.length;
    });
    out.push(text.slice(at));
    return out;
  };
  void quoteOf;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card max-h-[520px] overflow-y-auto p-4">
        <div className="label mb-2">Raw messages</div>
        {s.messages.map((m) => (
          <div key={m.id} className="tape py-3 font-mono text-13 text-dim"><span className="text-mute">{m.id} {m.sender}</span><div className="mt-1 whitespace-pre-line">{render(m.text, m.id)}</div></div>
        ))}
      </div>
      <div className="card max-h-[520px] overflow-y-auto p-4">
        <div className="label mb-2">Compiled facts</div>
        {facts.map((f, i) => (
          <motion.div key={s.run_id + f.id} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 20) * 0.04 }}
            onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
            className={`tape cursor-default py-1.5 font-mono text-13 ${hover === f.id ? "bg-signal/10 text-text" : "text-dim"}`}>
            <span className="text-mute">{f.id}</span> {fmtFact(f)}
          </motion.div>
        ))}
        {s.facts.filter((f) => f.status === "rejected").map((f) => (
          <div key={f.id} className="tape py-1.5 font-mono text-13 text-mute"><span className="text-bad">{f.id}</span> <s>{fmtFact(f)}</s> <span className="text-bad">rejected</span></div>
        ))}
      </div>
    </div>
  );
}

/* ---- gatekeeper: rulebook ---- */
function Rulebook({ s }: { s: State }) {
  const areas = useMemo(() => ["all", ...Array.from(new Set((s.rules || []).map((r) => r.area)))], [s.rules]);
  const [area, setArea] = useState("all");
  const rs = (s.rules || []).filter((r) => area === "all" || r.area === area);
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap gap-2">{areas.map((a) => <button key={a} onClick={() => setArea(a)} className={`chip ${a === area ? "border-signal text-signal" : "hover:text-text"}`}>{a}</button>)}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left font-mono text-13">
          <thead><tr className="text-mute"><th className="py-1 pr-3 font-normal">id</th><th className="pr-3 font-normal">kind</th><th className="pr-3 font-normal">rule</th><th className="pr-3 font-normal">slack</th><th className="pr-3 font-normal">status</th><th className="font-normal">source</th></tr></thead>
          <tbody>
            {rs.map((r) => (
              <>
                <tr key={r.id} className="tape align-top">
                  <td className="py-1.5 pr-3 text-mute">{r.id}</td><td className="pr-3 text-dim">{r.kind.replace("message_", "")}</td><td className="pr-3">{r.expr}</td>
                  <td className="pr-3">{r.slack === null ? "-" : r.slack}</td><td className="pr-3" style={{ color: STATUS_COLOR[r.status] }}>{r.status}</td>
                  <td className="text-dim">{typeof r.source === "string" ? r.source : `${r.source.msg_id} ${r.source.sender}: “${r.source.quote}”`}</td>
                </tr>
                {r.rejected.map((x) => (
                  <tr key={r.id + x.fact_id} className="align-top"><td /><td className="py-1 pr-3 text-bad">rejected</td><td colSpan={4} className="py-1"><s className="text-mute">“{x.quote}”</s> <span className="text-dim">{x.reason}</span></td></tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- solver: margins ---- */
function Margins({ s }: { s: State }) {
  const pts = s.margins?.breaking_points || [];
  return (
    <div className="card p-4">
      <div className="mb-3 text-13 text-dim">How far each input can move before the plan changes (amber) or becomes impossible (red). Found by searching the solver, with no model calls.</div>
      {pts.map((p: any, i: number) => {
        const vals = [p.current, p.changes_at, p.breaks_at].filter((v) => v !== null && v !== undefined);
        const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
        const pos = (v: number) => `${((v - lo) / span) * 94 + 3}%`;
        return (
          <div key={i} className="tape grid grid-cols-12 items-center gap-3 py-2 text-13">
            <div className="col-span-4"><div>{p.input}</div><div className="text-12 text-mute">{p.direction} <span className="num">{p.current}</span></div></div>
            <div className="relative col-span-5 h-5">
              <div className="absolute left-0 right-0 top-2 h-px bg-white/20" />
              {p.changes_at != null && <div className="absolute top-0 h-5 w-px bg-warn" style={{ left: pos(p.changes_at) }} title={`changes at ${p.changes_at}`} />}
              {p.breaks_at != null && <div className="absolute top-0 h-5 w-px bg-bad" style={{ left: pos(p.breaks_at) }} title={`breaks at ${p.breaks_at}`} />}
              <div className="absolute top-1 h-3 w-1 bg-text" style={{ left: pos(p.current) }} title={`current ${p.current}`} />
            </div>
            <div className="num col-span-3 text-right text-12"><span className="text-warn">{p.changes_at ?? "-"}</span> / <span className="text-bad">{p.breaks_at ?? "never"}</span></div>
          </div>
        );
      })}
      {!pts.length && <p className="text-13 text-mute">No margins yet.</p>}
    </div>
  );
}

/* ---- verifier: red team + break it live ---- */
const IMPACT: Record<string, (n: number) => string> = {
  people_without_meal: (n) => `${n} people without lunch`,
  people_without_seat: (n) => `${n} people without a seat`,
  over_budget: (n) => `${money(n)} over budget`,
  teams_unjudged: (n) => `${n} teams unjudged`,
  minutes_overrun: (n) => `${n} minutes past the event end`,
};

function RedTeam({ s }: { s: State }) {
  const [checks, setChecks] = useState<{ id: string; label: string; layer: string }[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetch("/api/checks").then((r) => r.json()).then(setChecks).catch(() => {}); }, []);
  useEffect(() => {
    if (!off.length) { setRes(null); return; }
    post("/api/ablate", { disabled: off }).then(setRes).catch((e) => setErr(e.message));
  }, [off, s.run_id]);
  const a = res?.attack || s.attack;
  const toggle = (id: string) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const impacts = res ? Object.entries(res.impact || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => IMPACT[k]?.(v as number)).filter(Boolean) : [];
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-end gap-4">
          <Odometer value={a?.matched} size={64} /><span className="serif mb-1 text-[28px] text-mute">of {a?.total ?? "-"}</span>
          <span className="mb-2 text-13 text-dim">mutated messages got the verdict we expected{off.length ? " (checks switched off)" : ""}</span>
        </div>
        <div className="mt-4 space-y-1.5">
          {Object.entries(a?.by_operator || {}).map(([op, v]: any) => (
            <div key={op} className="grid grid-cols-12 items-center gap-3 text-13">
              <span className="num col-span-4 text-dim">{op}</span>
              <div className="col-span-6 h-1.5 bg-line"><motion.div initial={false} animate={{ width: `${(v.matched / v.total) * 100}%` }} className="h-full" style={{ background: v.matched === v.total ? "var(--ok)" : "var(--bad)" }} /></div>
              <span className="num col-span-2 text-right text-mute">{v.matched}/{v.total} {v.expected}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-12 text-mute">Attacks mutate extracted facts. They test the gatekeeper and solver, not the reader.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between"><span className="label">Break it live</span><button className="chip hover:text-text" onClick={() => setOff([])}>Reset</button></div>
          <div className="space-y-2">
            {checks.map((c) => {
              const on = !off.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 text-13">
                  <span>{c.label} <span className="text-12 text-mute">{c.layer}</span></span>
                  <button role="switch" aria-checked={on} aria-label={c.label} className="toggle" onClick={() => toggle(c.id)} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-4">
          <div className="label mb-3">With those switched off</div>
          {!res ? <p className="text-13 text-mute">Everything is on. Turn a check off to see what it was protecting.</p> : (
            <div className="space-y-2 text-13">
              <div>Audit <span className="num" style={{ color: res.audit_passed === 6 ? "var(--ok)" : "var(--bad)" }}>{res.audit_passed}/6</span>{res.audit.filter((x: any) => !x.pass).map((x: any) => <div key={x.check} className="text-bad">✗ {x.check}: {x.detail}</div>)}</div>
              {impacts.length > 0 && <div className="rounded border border-bad/50 p-2 text-bad">{impacts.map((t) => <div key={t as string}>{t}</div>)}</div>}
              {err && <div className="text-bad">{err}</div>}
              <div className="text-12 text-mute">Nothing here is saved.</div>
            </div>
          )}
        </div>
      </div>
      <div className="card p-4">
        <div className="label mb-2">Examples</div>
        {(a?.examples || []).map((e: any, i: number) => (
          <div key={i} className="tape grid grid-cols-12 gap-2 py-1.5 font-mono text-12">
            <span className="col-span-3 text-dim">{e.operator}</span><span className="col-span-2" style={{ color: e.match ? "var(--ok)" : "var(--bad)" }}>{e.expected} → {e.got}</span>
            <span className="col-span-2 text-mute">{e.rule || "-"}</span><span className="col-span-5 text-mute">{e.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- try to fool it ---- */
function Fool({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  const send = async () => {
    setBusy(true); setOut("");
    window.dispatchEvent(new CustomEvent("muntazim:busy", { detail: true }));
    try { const r = await post("/api/send", { text }); setOut(r.tail); onDone(); } catch (e: any) { setOut(e.message); }
    window.dispatchEvent(new CustomEvent("muntazim:busy", { detail: false }));
    setBusy(false);
  };
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between"><span className="label">Message</span><span className="chip" style={{ color: "var(--warn)", borderColor: "rgba(232,176,75,0.5)" }}>Demo only, changes the saved plan</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste or write a message, in any format" className="w-full resize-y rounded border border-line bg-ink p-3 font-mono text-13 outline-none focus:border-signal" />
      <div className="mt-2 flex items-center gap-3"><button disabled={busy || !text.trim()} onClick={send} className="chip border-signal text-signal disabled:opacity-40">{busy ? "Reading" : "Send"}</button><span className="text-12 text-mute">Calls the model once and runs the full pipeline.</span></div>
      {out && <pre className="num mt-3 max-h-64 overflow-auto rounded border border-line bg-ink p-2 text-12 text-dim">{out}</pre>}
    </div>
  );
}

/* ---- lab shell with sticky diagram ---- */
export function Lab({ s, refresh }: { s: State; refresh: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.6", "end 0.6"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.max(0, Math.min(STAGES.length - 1, Math.floor(v * STAGES.length)))));
  return (
    <section id="lab" className="mx-auto max-w-[1800px] px-4 pt-16">
      <div className="mb-2 flex items-baseline gap-3"><h2 className="serif text-[64px] leading-none">Lab</h2><span className="text-14 text-dim">how we verify the plan</span></div>
      <p className="max-w-2xl text-14 text-dim">We treat messages like source code. We compile them into rules, solve and verify the plan against those rules, measure the margin, and attack our own system. Only reading uses a model.</p>
      <div ref={ref} className="mt-8 grid gap-8 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-24 space-y-1" data-judge="lab-diagram">
            {STAGES.map((st, i) => (
              <div key={st.id} className="relative pl-6">
                {i < STAGES.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-line" />}
                <motion.span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border" initial={false} animate={{ borderColor: i === active ? "var(--signal)" : "rgba(255,255,255,0.2)", backgroundColor: i === active ? "var(--signal)" : "transparent" }} />
                <a href={`#lab-${st.id}`} className={`block py-1 text-14 ${i === active ? "text-text" : "text-mute"} hover:text-text`}>
                  {st.name} {st.model && <span className="num ml-1 rounded border border-signal/40 px-1 text-12 text-signal">model</span>}
                </a>
                <div className={`pb-3 text-12 ${i === active ? "text-dim" : "text-mute/60"}`}>{st.line}</div>
              </div>
            ))}
          </div>
        </aside>
        <div className="lg:col-span-9">
          <Section id="reader" title="Reader" line={STAGES[0].line}><Compile s={s} /></Section>
          <Section id="gatekeeper" title="Gatekeeper" line={STAGES[1].line}><div data-judge="rulebook"><Rulebook s={s} /></div></Section>
          <Section id="solver" title="Solver" line={STAGES[2].line}><Margins s={s} /></Section>
          <Section id="verifier" title="Verifier" line={STAGES[3].line}><div data-judge="verifier"><RedTeam s={s} /></div></Section>
          <Section id="fool" title="Try to fool it" line={STAGES[4].line}><Fool onDone={refresh} /></Section>
        </div>
      </div>
    </section>
  );
}
