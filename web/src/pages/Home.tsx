import { motion } from "framer-motion";
import { useState } from "react";
import { State } from "../api";
import { Chip, Empty, Odometer, Reveal, Stamp } from "../kit";
import { attention, isVerified, money } from "../lib";

type P = { s: State | null; go: (to: string) => void };

function Steps({ s, go }: { s: State | null; go: (to: string) => void }) {
  const [on, setOn] = useState(0);
  const facts = s?.facts?.length ?? 0;
  const steps = [
    { n: "01", name: "Read", ai: true, stat: s ? `${s.messages.length} messages → ${facts} facts` : "messages → facts", to: "/messages",
      text: "Every message is read once, in English or Roman Urdu. The AI pulls out facts and copies the exact words it relied on. This is the only step that uses AI." },
    { n: "02", name: "Check", stat: s ? `${s.rejections.length} rejected` : "bad facts are stopped", to: "/review",
      text: "Plain code checks each fact: is it really in the message, is it current, is the sender allowed to decide it, and does it keep the plan possible? Anything that fails is rejected with a reason and a drafted reply." },
    { n: "03", name: "Plan", stat: s?.plan?.budget ? `${s.plan.budget.lines.length} budget lines` : "venue, food, judges, schedule", to: "/plan",
      text: "A solver tries every venue, meal option and judge count, then picks the cheapest combination that obeys every rule. Same facts in, same plan out, with no AI involved." },
    { n: "04", name: "Prove", stat: s?.audit ? `${s.audit.filter((a) => a.pass).length} of ${s.audit.length} checks pass` : "the plan must prove itself", to: "/verify",
      text: "Six checks recompute the figures independently. We measure how much room each input has, and the system attacks itself to show its checks really work." },
  ];
  return (
    <div className="sheet pad crop" data-tour="how">
      <div className="kicker mb-1">How a pile of messages becomes a plan</div>
      <div className="serif mb-5 text-[30px]">Four steps, one of them uses AI</div>
      <div className="relative grid gap-3 md:grid-cols-4">
        <div className="absolute left-[12%] right-[12%] top-[34px] hidden h-px bg-line2 md:block">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" initial={{ left: "0%", opacity: 0 }} animate={{ left: "100%", opacity: [0, 1, 1, 0] }} transition={{ duration: 3.2, repeat: Infinity, delay: i * 1.05, ease: "linear" }} />
          ))}
        </div>
        {steps.map((st, i) => (
          <button key={st.n} onMouseEnter={() => setOn(i)} onFocus={() => setOn(i)} onClick={() => go(st.to)} className={`relative rounded border p-4 text-left transition ${on === i ? "border-ink bg-sheet2" : "border-line2 bg-transparent"}`} style={on === i ? { boxShadow: "3px 3px 0 var(--hard)", transform: "translate(-1px,-1px)" } : undefined}>
            <div className="flex items-center justify-between"><span className="mono text-[12px] text-ink3">{st.n}</span>{st.ai ? <span className="mono rounded bg-accent px-1.5 text-[10px] uppercase tracking-wider text-white">uses AI</span> : <span className="mono text-[10px] uppercase tracking-wider text-ink3">plain code</span>}</div>
            <div className="serif mt-2 text-[30px] leading-none">{st.name}</div>
            <div className="mono mt-2 text-[12px] text-ink2">{st.stat}</div>
          </button>
        ))}
      </div>
      <motion.p key={on} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 max-w-3xl text-[15px] text-ink2">{steps[on].text}</motion.p>
    </div>
  );
}

function Figure({ label, children, sub, to, go, delay }: { label: string; children: any; sub?: string; to: string; go: (to: string) => void; delay: number }) {
  return (
    <Reveal delay={delay}>
      <button onClick={() => go(to)} className="sheet sheet-hard lift block w-full p-4 text-left">
        <div className="kicker">{label}</div>
        <div className="mt-2 min-h-[48px]">{children}</div>
        {sub && <div className="mt-1 text-[13px] text-ink2">{sub}</div>}
      </button>
    </Reveal>
  );
}

export default function Home({ s, go }: P) {
  if (!s || s.empty || !s.plan?.feasible) {
    return (
      <div>
        <header className="mb-10 max-w-3xl">
          <div className="kicker mb-3">Muntazim · event planner</div>
          <h1 className="serif text-[56px] leading-[1.02] md:text-[76px]">Messy messages in.<br /><span className="text-accent">A verified plan</span> out.</h1>
          <p className="mt-5 max-w-xl text-[17px] text-ink2">Paste in the emails and WhatsApp texts about your event. Muntazim works out the venue, food, judges, schedule and budget, rejects anything that does not hold up, and shows its working.</p>
        </header>
        <div className="mb-8"><Steps s={null} go={go} /></div>
        <Empty title={s && !s.empty ? "Not enough to plan yet" : "Nothing planned yet"} action={<button className="btn primary" onClick={() => go("/compose")}>Add your first messages</button>}>
          {s && !s.empty ? "The messages so far do not give enough facts for a valid plan. Add more." : "Or run python run.py <file> in a terminal and this page fills in as it works."}
        </Empty>
      </div>
    );
  }
  const verified = isVerified(s);
  const items = attention(s);
  const open = items.filter((i) => i.kind !== "tight");
  const p = s.plan;
  const run = s.trace.runs[s.trace.runs.length - 1];
  const total = p.schedule.reduce((n: number, x: any) => n + x.minutes, 0) || 1;
  const senders = Array.from(new Set(s.messages.map((m) => m.sender).filter(Boolean)));
  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6" data-tour="verdict">
        <div className="max-w-3xl">
          <div className="kicker mb-3">Event overview</div>
          <h1 className="serif text-[50px] leading-[1.02] md:text-[68px]">{verified ? <>Your plan is <span className="text-green">verified</span>.</> : <>Your plan <span className="text-accent">needs a look</span>.</>}</h1>
          <p className="mt-4 max-w-xl text-[16px] text-ink2">
            {s.messages.length} messages were read, {s.facts.filter((f) => f.status === "active").length} facts were kept and {s.rejections.length} were rejected. {verified ? "Every check passed." : `${s.audit.filter((a) => !a.pass).length} check(s) did not pass.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-3"><button className="btn primary" onClick={() => go("/plan")}>See the plan</button><button className="btn" onClick={() => go("/compose")}>Add a message</button>{open.length > 0 && <button className="btn ghost" onClick={() => go("/review")}>{open.length} thing(s) need attention</button>}</div>
        </div>
        <div className="pt-4"><Stamp big status={verified ? "used" : "rejected"} label={verified ? "Verified" : "Check it"} /></div>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Total cost" to="/plan" go={go} delay={0} sub={p.budget.cap != null ? `of ${money(p.budget.cap)} budget · ${money(p.budget.remaining)} left` : "no cap stated"}><Odometer value={p.budget.total} size={46} /></Figure>
        <Figure label="People on site" to="/plan" go={go} delay={0.06} sub={`${p.people.students} students, ${p.people.staff} staff, ${p.people.judges} judges`}><Odometer value={p.people.total} size={46} /></Figure>
        <Figure label="Venue" to="/plan" go={go} delay={0.12} sub={p.venue ? `seats ${p.venue.capacity} · ${money(p.venue.cost)}` : ""}><div className="serif text-[40px] leading-[46px]">{p.venue?.name || "None"}</div></Figure>
        <Figure label="Judges" to="/plan" go={go} delay={0.18} sub={`${p.judging.teams} teams, ${p.judging.teams_per_judge} each`}><Odometer value={p.judging.judges} size={46} /></Figure>
      </div>

      <Reveal className="mb-8"><Steps s={s} go={go} /></Reveal>

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <Reveal className="lg:col-span-3">
          <div className="sheet pad h-full" data-tour="attention">
            <div className="mb-4 flex items-baseline justify-between"><div className="serif text-[30px]">Needs attention</div><button className="mono text-[12px] text-ink3 hover:text-ink" onClick={() => go("/review")}>open all →</button></div>
            {items.length === 0 && <p className="text-ink2">Nothing needs your attention.</p>}
            {items.slice(0, 5).map((it, i) => (
              <button key={i} onClick={() => go(it.to)} className="dash flex w-full items-start gap-3 py-3 text-left hover:bg-sheet2">
                <span className="dot mt-2" style={{ background: it.kind === "rejected" || it.kind === "missing" ? "var(--accent)" : it.kind === "tight" ? "var(--amber)" : "var(--blue)" }} />
                <span><span className="block text-[15px]">{it.title}</span><span className="block text-[13px] text-ink2">{it.detail}</span></span>
              </button>
            ))}
          </div>
        </Reveal>
        <Reveal className="lg:col-span-2" delay={0.08}>
          <div className="sheet pad h-full">
            <div className="serif mb-4 text-[30px]">Last run</div>
            {run ? (
              <div className="space-y-2 text-[14px]">
                <div className="flex justify-between"><span className="text-ink2">Mode</span><span className="mono">{run.mode === "full" ? "full run" : "update"}</span></div>
                <div className="flex justify-between"><span className="text-ink2">AI calls</span><span className="mono">{run.calls.length}</span></div>
                <div className="flex justify-between"><span className="text-ink2">Tokens</span><span className="mono">{run.total_tokens.toLocaleString("en-US")}</span></div>
                <div className="flex justify-between"><span className="text-ink2">Time</span><span className="mono">{run.duration_s ?? "-"} s</span></div>
                <div className="flex justify-between"><span className="text-ink2">Model</span><span className="mono">{run.calls[0]?.model || "-"}</span></div>
                {s.changes?.recomputed?.length ? <div className="dash pt-3"><div className="kicker mb-1">Changed in this update</div><div className="flex flex-wrap gap-1">{s.changes.recomputed.map((a) => <Chip key={a} color="var(--accent)">{a}</Chip>)}</div></div> : null}
                <button className="btn ghost mt-3 w-full justify-center" onClick={() => go("/activity")}>See every AI call</button>
              </div>
            ) : <p className="text-ink2">No runs yet.</p>}
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="sheet pad">
          <div className="mb-3 flex items-baseline justify-between"><div className="serif text-[30px]">The day at a glance</div><button className="mono text-[12px] text-ink3 hover:text-ink" onClick={() => go("/plan")}>full schedule →</button></div>
          <div className="flex h-12 gap-[3px]">
            {p.schedule.map((b: any, i: number) => (
              <motion.div key={i} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }} style={{ width: `${(b.minutes / total) * 100}%`, transformOrigin: "left", background: i % 2 ? "var(--sheet2)" : "var(--ink)", color: i % 2 ? "var(--ink)" : "var(--sheet2)" }} className="flex min-w-0 items-center overflow-hidden border border-ink px-2 text-[12px]" title={`${b.label}: ${b.minutes} min`}>
                <span className="truncate">{b.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </Reveal>

      {senders.length > 0 && (
        <div className="mt-8 overflow-hidden border-y border-line2 py-3" aria-hidden>
          <div className="ticker">
            {[...senders, ...senders].map((n, i) => <span key={i} className="mono text-[12px] uppercase tracking-[0.14em] text-ink3">● {n}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
