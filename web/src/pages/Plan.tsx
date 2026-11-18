import { motion } from "framer-motion";
import { ReactNode, useState } from "react";
import { State } from "../api";
import { Meter, Odometer, PageHeader, Reveal, Help } from "../kit";
import { cap, money } from "../lib";

type P = { s: State; go: (to: string) => void; onSource: (ids: string[]) => void };

const Src = ({ ids, onSource, children }: { ids?: string[]; onSource: (ids: string[]) => void; children?: ReactNode }) =>
  ids && ids.length ? (
    <button onClick={() => onSource(ids)} className="mono inline-flex items-center gap-1 rounded border border-line2 px-1.5 text-[11px] text-ink2 hover:border-ink hover:text-ink" title="Show the message this came from">
      {children ?? ids.join(", ")} <span aria-hidden>↗</span>
    </button>
  ) : null;

function Section({ id, kicker, title, help, children }: { id: string; kicker: string; title: string; help?: string; children: ReactNode }) {
  return (
    <Reveal className="mb-10">
      <section id={`sec-${id}`} data-tour={id} className="sheet pad crop">
        <div className="kicker">{kicker}</div>
        <h2 className="serif mb-4 text-[34px] leading-tight">{title}{help && <Help>{help}</Help>}</h2>
        {children}
      </section>
    </Reveal>
  );
}

const SEG = ["var(--ink)", "var(--accent)", "var(--green)", "var(--blue)", "var(--amber)", "var(--ink3)", "var(--ink2)"];

function Budget({ s, onSource }: { s: State; onSource: (ids: string[]) => void }) {
  const b = s.plan.budget;
  const [hover, setHover] = useState<number | null>(null);
  const total = b.total || 1;
  const rule = (s.rules || []).find((r) => r.id === "H-BUDGET");
  return (
    <Section id="budget" kicker="Money" title="Budget" help="Every line is a cost the plan commits to. Click the arrow on a line to see the message it came from.">
      <div className="mb-5 flex flex-wrap items-end gap-6">
        <div><div className="kicker">Total</div><Odometer value={b.total} size={56} /></div>
        {b.cap != null && <div><div className="kicker">Cap</div><div className="serif text-[34px] text-ink2">{money(b.cap)}</div></div>}
        {b.remaining != null && <div><div className="kicker">Left</div><div className="serif text-[34px]" style={{ color: b.remaining >= 0 ? "var(--green)" : "var(--accent)" }}>{money(b.remaining)}</div></div>}
      </div>
      <div className="mb-4 flex h-5 gap-[3px]" onMouseLeave={() => setHover(null)}>
        {b.lines.map((l: any, i: number) => (
          <motion.div key={l.item} onMouseEnter={() => setHover(i)} initial={{ scaleX: 0 }} animate={{ scaleX: 1, opacity: hover === null || hover === i ? 1 : 0.3 }} transition={{ delay: i * 0.07, duration: 0.5 }}
            style={{ width: `${(l.amount / total) * 100}%`, background: SEG[i % SEG.length], transformOrigin: "left", minWidth: 3 }} />
        ))}
      </div>
      <div>
        {b.lines.map((l: any, i: number) => (
          <div key={l.item} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`dash flex items-center gap-3 py-2.5 ${hover === i ? "bg-sheet2" : ""}`}>
            <span className="h-3 w-3 shrink-0" style={{ background: SEG[i % SEG.length] }} />
            <span className="flex-1 text-[15px]">{cap(l.item)}</span>
            <span className="chip">{l.status === "chosen" ? "chosen by the planner" : "already committed"}</span>
            <span className="mono w-28 text-right text-[15px]">{money(l.amount)}</span>
            <Src ids={l.sources} onSource={onSource} />
          </div>
        ))}
      </div>
      {b.optional.length > 0 && (
        <div className="mt-5 rounded border border-dashed border-line2 p-3">
          <div className="kicker mb-1">Asked for, not decided (never counted)</div>
          {b.optional.map((o: any) => (
            <div key={o.item} className="flex items-center gap-3 py-1 text-[14px]"><span className="flex-1">{cap(o.item)}</span><span className="mono">{money(o.amount)}</span><span className="chip" style={{ color: o.fits ? "var(--green)" : "var(--accent)" }}>{o.fits ? "would fit" : "would not fit"}</span><Src ids={o.sources} onSource={onSource} /></div>
          ))}
        </div>
      )}
      {rule && rule.rhs != null && <div className="mt-5"><Meter current={rule.lhs} limit={rule.rhs} label="Spent against the cap" /></div>}
    </Section>
  );
}

function Options({ s, cat, chosenName, onSource }: { s: State; cat: "venue" | "food"; chosenName?: string; onSource: (ids: string[]) => void }) {
  const opts = s.facts.filter((f) => f.status === "active" && f.type === "option" && String(f.x?.category).toLowerCase() === cat);
  const chosen = opts.find((o) => (o.x?.name || o.key) === chosenName);
  const need = s.plan.people.total;
  return (
    <div className="mt-4">
      <div className="kicker mb-2">Everything that was on the table</div>
      {opts.map((o) => {
        const name = o.x?.name || o.key;
        const isChosen = name === chosenName;
        let why = "";
        if (isChosen) why = cat === "venue" ? "Cheapest option that fits everyone" : "Right tier for the budget";
        else if (cat === "venue" && typeof o.x?.capacity === "number" && o.x.capacity < need) why = `Too small: seats ${o.x.capacity}, needs ${need}`;
        else if (cat === "venue") why = "Fits, but costs more";
        else if (["basic"].includes(String(o.x?.tier))) why = "Cheaper, lower tier: used only if the budget forces it";
        else why = "Not needed";
        return (
          <motion.div key={o.id} layout className={`dash flex flex-wrap items-center gap-3 py-2.5 ${isChosen ? "bg-sheet2" : ""}`}>
            <span className="w-4 text-center" style={{ color: isChosen ? "var(--green)" : "var(--ink3)" }}>{isChosen ? "●" : "○"}</span>
            <span className="flex-1 text-[15px]">{name}{(o.x?.features || []).length > 0 && <span className="ml-2 text-[12px] text-ink3">{o.x.features.join(", ")}</span>}</span>
            {cat === "venue" && <span className="mono text-[13px] text-ink2">seats {o.x?.capacity ?? "?"}</span>}
            <span className="mono text-[14px]">{money(o.x?.price)}{o.x?.basis === "per_head" ? " / head" : ""}</span>
            <span className="w-72 text-right text-[13px]" style={{ color: isChosen ? "var(--green)" : "var(--ink2)" }}>{why}</span>
            <Src ids={[o.id]} onSource={onSource} />
          </motion.div>
        );
      })}
      {!opts.length && <p className="text-ink2">No options were found in the messages.</p>}
      {chosen && null}
    </div>
  );
}

function Judging({ s, onSource }: { s: State; onSource: (ids: string[]) => void }) {
  const j = s.plan.judging;
  const [hover, setHover] = useState<number | null>(null);
  const hue = (i: number) => `hsl(${(i * 47) % 360} 45% ${document.documentElement.getAttribute("data-theme") === "dark" ? 58 : 42}%)`;
  const owner = (t: number) => j.assignments.findIndex((a: any) => { const [x, y] = String(a.teams).split("-").map(Number); return t >= x && t <= (y || x); });
  return (
    <Section id="judging" kicker="People who score" title="Judging" help="Each square is a team. Colours show which judge scores it. A judge scores a limited number of teams, so the planner uses the fewest judges that respect that limit.">
      <div className="mb-4 flex flex-wrap gap-8">
        <div><div className="kicker">Judges</div><Odometer value={j.judges} size={52} /></div>
        <div><div className="kicker">Teams</div><Odometer value={j.teams} size={52} /></div>
        <div><div className="kicker">Teams each</div><div className="serif text-[48px] leading-[52px]">{j.teams_per_judge}<span className="text-[22px] text-ink3"> / max {j.max_teams_per_judge ?? "?"}</span></div></div>
        <div><div className="kicker">Fees</div><div className="serif text-[48px] leading-[52px]">{money(j.fees_total)}</div></div>
      </div>
      <div className="flex flex-wrap gap-1.5" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: j.teams }, (_, i) => i + 1).map((t) => {
          const o = owner(t);
          return (
            <motion.button key={t} onMouseEnter={() => setHover(t)} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: hover === null || owner(hover) === o ? 1 : 0.25, scale: 1 }} transition={{ delay: Math.min(t, 60) * 0.012 }}
              className="mono flex h-9 w-9 items-center justify-center rounded text-[11px] text-white" style={{ background: hue(o) }} title={`Team ${t}: Judge ${o + 1}`}>{t}</motion.button>
          );
        })}
      </div>
      <div className="mt-3 text-[13px] text-ink2">{hover ? `Team ${hover} is scored by Judge ${owner(hover) + 1}.` : "Hover a team to see its judge."} <Src ids={j.sources} onSource={onSource} /></div>
      {j.window_minutes > 0 && <div className="mt-2 text-[13px] text-ink2">Judging runs {j.window_minutes} minutes because the busiest judge sees {j.teams_per_judge} teams at {j.minutes_per_team} minutes each.</div>}
    </Section>
  );
}

function Schedule({ s, onSource }: { s: State; onSource: (ids: string[]) => void }) {
  const sch = s.plan.schedule as any[];
  const total = sch.reduce((n, x) => n + x.minutes, 0) || 1;
  const [sel, setSel] = useState(0);
  const step = total > 480 ? 60 : total > 240 ? 30 : 15;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const b = sch[sel] || sch[0];
  let acc = 0; const starts = sch.map((x) => { const a = acc; acc += x.minutes; return a; });
  return (
    <Section id="schedule" kicker="Time" title="Schedule" help="Blocks always add up to exactly the length of the event. Click a block for details.">
      <div className="relative">
        <div className="flex h-16 gap-[3px]">
          {sch.map((x, i) => (
            <motion.button key={i} onClick={() => setSel(i)} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 200, damping: 18 }}
              style={{ width: `${(x.minutes / total) * 100}%`, transformOrigin: "bottom", background: sel === i ? "var(--accent)" : i % 2 ? "var(--sheet2)" : "var(--ink)", color: sel === i ? "#fff" : i % 2 ? "var(--ink)" : "var(--sheet2)" }}
              className="min-w-0 overflow-hidden border border-ink px-2 text-left text-[12px]">
              <div className="truncate font-medium">{x.label}</div><div className="mono truncate opacity-70">{x.minutes}m</div>
            </motion.button>
          ))}
        </div>
        <div className="relative mt-1 h-6">
          {ticks.map((t) => <div key={t} className="absolute top-0" style={{ left: `${(t / total) * 100}%` }}><div className="h-2 w-px bg-ink" /><div className="mono -ml-4 w-8 text-center text-[10px] text-ink3">{t}</div></div>)}
        </div>
      </div>
      <motion.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center gap-6 rounded border border-line2 bg-sheet2 p-4">
        <div className="serif text-[32px]">{b.label}</div>
        <div><div className="kicker">From</div><div className="mono">{b.start}</div></div>
        <div><div className="kicker">To</div><div className="mono">{b.end}</div></div>
        <div><div className="kicker">Length</div><div className="mono">{b.minutes} min</div></div>
        <div><div className="kicker">Starts after</div><div className="mono">{starts[sel]} min</div></div>
      </motion.div>
      <div className="mt-2"><Src ids={s.plan.schedule_meta?.sources} onSource={onSource}>sources of the schedule</Src></div>
    </Section>
  );
}

export default function Plan({ s, go, onSource }: P) {
  const p = s.plan;
  const links = [["budget", "Budget"], ["venue", "Venue"], ["food", "Food"], ["people", "People"], ["judging", "Judging"], ["schedule", "Schedule"]];
  return (
    <div>
      <PageHeader kicker="The plan" title="Everything decided, and why." actions={<button className="btn" onClick={() => go("/whatif")}>Try what-if</button>}>
        Each section shows the choice the planner made, the options it turned down, and the exact message every figure came from.
      </PageHeader>
      <div className="sticky top-3 z-30 mb-8 flex flex-wrap gap-2 rounded border border-line2 bg-sheet p-2">
        {links.map(([id, l]) => <button key={id} className="btn ghost px-3 py-1 text-[13px]" onClick={() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{l}</button>)}
      </div>
      <Budget s={s} onSource={onSource} />
      <Section id="venue" kicker="Place" title={p.venue?.name || "No venue"} help="The planner picks the cheapest venue that seats everyone and meets any requirement from the messages.">
        {p.venue ? <div className="flex flex-wrap gap-8"><div><div className="kicker">Seats</div><div className="serif text-[40px]">{p.venue.capacity ?? "?"}</div></div><div><div className="kicker">Cost</div><div className="serif text-[40px]">{money(p.venue.cost)}</div></div><div><div className="kicker">Features</div><div className="serif text-[28px] pt-2">{(p.venue.features || []).join(", ") || "none listed"}</div></div></div> : <p className="text-ink2">No venue option was found.</p>}
        <Options s={s} cat="venue" chosenName={p.venue?.name} onSource={onSource} />
      </Section>
      <Section id="food" kicker="Meals" title={p.food?.name || "No food"} help="One meal per person on site. The standard tier is preferred; a cheaper tier is used only when the budget forces it.">
        {p.food ? <div className="flex flex-wrap gap-8"><div><div className="kicker">Meals</div><div className="serif text-[40px]">{p.food.qty}</div></div><div><div className="kicker">Per head</div><div className="serif text-[40px]">{money(p.food.per_head)}</div></div><div><div className="kicker">Cost</div><div className="serif text-[40px]">{money(p.food.cost)}</div></div></div> : <p className="text-ink2">No food option was found.</p>}
        <Options s={s} cat="food" chosenName={p.food?.name} onSource={onSource} />
      </Section>
      <Section id="people" kicker="Headcount" title={`${p.people.total} people on site`} help="Students + staff + the judges actually used. Everyone gets a seat and a meal.">
        <div className="flex flex-wrap gap-8">
          {[["Students", p.people.students], ["Staff", p.people.staff], ["Judges", p.people.judges], ["Teams", p.people.teams]].map(([k, v]: any) => <div key={k}><div className="kicker">{k}</div><Odometer value={v} size={44} /></div>)}
        </div>
        <div className="mt-3"><Src ids={p.people.sources} onSource={onSource}>where the counts came from</Src></div>
      </Section>
      <Judging s={s} onSource={onSource} />
      <Schedule s={s} onSource={onSource} />
    </div>
  );
}
