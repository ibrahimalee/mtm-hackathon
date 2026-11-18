import { motion } from "framer-motion";
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fact, State } from "../api";
import { Chip, Empty, PageHeader, Stamp } from "../kit";
import { ROLE_LABEL, STATUS_TEXT, STATUS_VAR, describeFact, whyOf } from "../lib";

const FILTERS = ["all", "used", "superseded", "rejected", "ignored"];

function mark(text: string, facts: Fact[], active: string | null, reg: (id: string, el: HTMLElement | null) => void): ReactNode {
  const hits = facts.map((f) => ({ f, i: f.quote ? text.toLowerCase().indexOf(f.quote.toLowerCase()) : -1 })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
  if (!hits.length) return text;
  const out: ReactNode[] = []; let at = 0;
  hits.forEach(({ f, i }) => {
    if (i < at) return;
    out.push(text.slice(at, i));
    const c = STATUS_VAR[f.status === "active" ? "used" : f.status] || "var(--ink3)";
    out.push(<mark key={f.id} ref={(el) => reg(f.id, el)} className={active === f.id ? "hl" : ""} style={{ background: active === f.id ? undefined : "transparent", textDecoration: "underline", textDecorationColor: c, textDecorationThickness: 2, textUnderlineOffset: 4 }}>{text.slice(i, i + f.quote.length)}</mark>);
    at = i + f.quote.length;
  });
  out.push(text.slice(at));
  return out;
}

export default function Messages({ s, focus, go }: { s: State; focus?: string; go: (to: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(focus || s.messages[0]?.id || null);
  const [active, setActive] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const marks = useRef<Record<string, HTMLElement | null>>({});
  const rows = useRef<Record<string, HTMLElement | null>>({});
  const [line, setLine] = useState<{ d: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const b = box.current, a = active ? marks.current[active] : null, r = active ? rows.current[active] : null;
    if (!b || !a || !r) { setLine(null); return; }
    const bb = b.getBoundingClientRect(), ab = a.getBoundingClientRect(), rb = r.getBoundingClientRect();
    const x1 = ab.right - bb.left, y1 = ab.top + ab.height / 2 - bb.top, x2 = rb.right - bb.left - 6, y2 = rb.top + 18 - bb.top, gx = bb.width - 14;
    setLine({ d: `M ${x1} ${y1} H ${gx} V ${y2} H ${x2}`, w: bb.width, h: bb.height });
  }, [active, sel]);
  useEffect(() => { if (focus) setSel(focus); }, [focus]);
  const list = useMemo(() => s.messages.filter((m) => (filter === "all" || m.status === filter) && (!q || `${m.sender} ${m.text}`.toLowerCase().includes(q.toLowerCase()))), [s.messages, filter, q]);
  const m = s.messages.find((x) => x.id === sel) || s.messages[0];
  const facts = m ? s.facts.filter((f) => f.msg_id === m.id) : [];
  const counts = (st: string) => (st === "all" ? s.messages.length : s.messages.filter((x) => x.status === st).length);
  if (!s.messages.length) return <Empty title="No messages yet" action={<button className="btn primary" onClick={() => go("/compose")}>Add a message</button>}>Messages appear here as they are read.</Empty>;
  return (
    <div>
      <PageHeader kicker="Messages" title="What people actually said.">
        Every message that was read, what the AI took from it, and what happened to each fact. Underlined words are the exact quotes the plan relies on.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <input type="text" placeholder="Search by sender or words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
          <div className="my-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`chip ${filter === f ? "!border-ink !bg-ink !text-sheet2" : "hover:border-ink"}`}>{f === "all" ? "All" : STATUS_TEXT[f]} <span className="mono">{counts(f)}</span></button>)}
          </div>
          <div className="sheet max-h-[640px] overflow-y-auto">
            {list.map((x, i) => (
              <motion.button key={x.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} onClick={() => { setSel(x.id); setActive(null); }}
                className={`dash block w-full px-4 py-3 text-left first:border-t-0 ${m?.id === x.id ? "bg-sheet2" : "hover:bg-sheet2"}`} style={m?.id === x.id ? { boxShadow: "inset 4px 0 0 var(--accent)" } : undefined}>
                <div className="flex items-center gap-2"><span className="mono text-[11px] text-ink3">{x.id}</span><span className="flex-1 truncate text-[14px] font-medium">{x.sender || "Unknown sender"}</span><Stamp status={x.status} /></div>
                <div className="mt-1 line-clamp-2 text-[13px] text-ink2">{x.text || "(message boundary not found)"}</div>
              </motion.button>
            ))}
            {!list.length && <p className="p-4 text-ink2">No messages match.</p>}
          </div>
        </div>
        {m && (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-3">
            <div ref={box} className="sheet pad crop pr-9" data-tour="message">
              {line && <svg className="pointer-events-none absolute inset-0" width={line.w} height={line.h} aria-hidden><motion.path d={line.d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" pathLength={1} strokeDasharray={1} initial={{ strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 0.35 }} /></svg>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="serif text-[30px] leading-none">{m.sender || "Unknown sender"}</span>
                <Chip>{ROLE_LABEL[m.role] || m.role}</Chip><Chip>{m.date && !m.date.startsWith("0000") ? m.date : m.date ? m.date.slice(5) : "no date"}</Chip>
                <span className="ml-auto"><Stamp status={m.status} /></span>
              </div>
              {m.reason && m.status !== "used" && <p className="mt-2 text-[14px]" style={{ color: STATUS_VAR[m.status] }}>{m.reason}</p>}
              <p className="mt-4 whitespace-pre-line rounded border border-line2 bg-sheet2 p-4 text-[15px] leading-7">{mark(m.text || "(boundary not found)", facts, active, (id, el) => { marks.current[id] = el; })}</p>
              <div className="kicker mb-2 mt-6">What was taken from it ({facts.length})</div>
              {facts.length === 0 && <p className="text-ink2">Nothing in this message affects the plan.</p>}
              {facts.map((f) => {
                const rej = s.rejections.find((r) => r.fact_id === f.id);
                const st = f.status === "active" ? "used" : f.status === "duplicate" ? "used" : f.status;
                return (
                  <button key={f.id} ref={(el) => { rows.current[f.id] = el; }} onMouseEnter={() => setActive(f.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(f.id)} className="dash block w-full py-3 text-left">
                    <div className="flex items-center gap-2"><span className="mono text-[11px] text-ink3">{f.id}</span><span className="flex-1 text-[15px]">{describeFact(f)}</span><Stamp status={st} label={f.type === "request" ? "Request" : f.status === "duplicate" ? "Repeat" : undefined} /></div>
                    {rej && <div className="mt-1 text-[13px] text-ink2"><b style={{ color: "var(--accent)" }}>{whyOf(rej.rule_id).title}.</b> {rej.reason}</div>}
                    {f.status === "superseded" && <div className="mt-1 text-[13px] text-ink2">Replaced by {f.superseded_by}.</div>}
                    {f.reason && !rej && f.status !== "superseded" && <div className="mt-1 text-[13px] text-ink2">{f.reason}</div>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
