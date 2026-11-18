import { motion } from "framer-motion";
import { useState } from "react";
import { State } from "../api";
import { Chip, Empty, PageHeader, Reveal, Stamp } from "../kit";
import { money, whyOf } from "../lib";

export default function Review({ s, go }: { s: State; go: (to: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const missing: any[] = (s.audit || []).find((a: any) => a.missing?.length)?.["missing"] || [];
  const requests = s.plan?.budget?.optional || [];
  const near = (s.margins?.slack || []).filter((x: any) => x.near);
  const copy = (id: string, t: string) => { navigator.clipboard?.writeText(t); setCopied(id); setTimeout(() => setCopied(null), 1600); };
  const nothing = !missing.length && !s.rejections.length && !requests.length && !near.length;
  return (
    <div>
      <PageHeader kicker="Needs attention" title="What a person should look at.">
        Anything the system would not accept, could not find, or that has very little room left. Each item says why and what to do about it.
      </PageHeader>
      {nothing && <Empty title="All clear">Every fact was accepted, nothing is missing and every limit has room to spare.</Empty>}

      {missing.length > 0 && (
        <Reveal className="mb-10">
          <h2 className="serif mb-1 text-[34px]">Missing information</h2>
          <p className="mb-4 max-w-2xl text-ink2">The plan was built without these because no message states them. The audit will keep failing until they are found.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {missing.map((m) => (
              <div key={m.key} className="sheet sheet-hard flex items-center gap-3 p-4" style={{ borderColor: "var(--accent)" }}>
                <Stamp status="rejected" label="Missing" />
                <div className="flex-1"><div className="text-[16px]">{m.label}</div><div className="mono text-[11px] text-ink3">{m.key}</div></div>
                <button className="btn" onClick={() => go("/compose")}>Add it</button>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {s.rejections.length > 0 && (
        <section className="mb-10" data-tour="rejected">
          <Reveal><h2 className="serif mb-1 text-[34px]">Rejected messages</h2>
            <p className="mb-4 max-w-2xl text-ink2">These were stopped before they could change the plan. Each has a reply you can copy and send.</p></Reveal>
          <div className="grid gap-5 xl:grid-cols-2">
            {s.rejections.map((r, i) => {
              const w = whyOf(r.rule_id);
              return (
                <Reveal key={r.fact_id} delay={i * 0.05}>
                  <div className="sheet pad crop h-full" style={{ borderColor: "var(--accent)" }}>
                    <div className="mb-3 flex items-center gap-2"><Stamp status="rejected" /><span className="serif text-[24px] leading-none">{w.title}</span><span className="mono ml-auto text-[11px] text-ink3">{r.rule_id}</span></div>
                    <blockquote className="border-l-4 border-accent pl-3 text-[16px]">“{r.quote}”</blockquote>
                    <button onClick={() => go(`/messages?m=${r.msg_id}`)} className="mono mt-1 text-[11px] text-ink3 underline decoration-dotted hover:text-ink">in message {r.msg_id}</button>
                    <p className="mt-3 text-[14px] text-ink2"><b className="text-ink">Why:</b> {w.plain}</p>
                    <p className="mt-1 text-[13px] text-ink3">{r.reason}</p>
                    <div className="mt-4 rounded border border-dashed border-line2 bg-sheet2 p-3">
                      <div className="kicker mb-1">Drafted reply</div>
                      <p className="text-[14px]">{r.drafted_reply}</p>
                    </div>
                    <motion.button whileTap={{ scale: 0.97 }} className="btn mt-3" onClick={() => copy(r.fact_id, r.drafted_reply)}>{copied === r.fact_id ? "Copied ✓" : "Copy reply"}</motion.button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {requests.length > 0 && (
        <Reveal className="mb-10">
          <h2 className="serif mb-1 text-[34px]">Asked for, not decided</h2>
          <p className="mb-4 max-w-2xl text-ink2">Requests from people who cannot approve spending. They are never counted in the budget.</p>
          {requests.map((o: any) => (
            <div key={o.item} className="sheet mb-2 flex items-center gap-3 p-4"><span className="flex-1 text-[16px]">{o.item}</span><span className="mono">{money(o.amount)}</span><Chip color={o.fits ? "var(--green)" : "var(--accent)"}>{o.fits ? "would fit the budget" : "would not fit"}</Chip></div>
          ))}
        </Reveal>
      )}

      {near.length > 0 && (
        <Reveal className="mb-10">
          <h2 className="serif mb-1 text-[34px]">Very little room left</h2>
          <p className="mb-4 max-w-2xl text-ink2">These limits are within a tenth of being broken. A small change to the inputs could make the plan impossible.</p>
          <div className="grid gap-3 md:grid-cols-2">{near.map((x: any) => <div key={x.rule} className="sheet flex items-center gap-3 p-4"><span className="dot" style={{ background: "var(--amber)" }} /><span className="flex-1 text-[14px]">{x.expr}</span><span className="mono text-[12px] text-ink2">{x.slack} to spare</span></div>)}</div>
          <button className="btn ghost mt-3" onClick={() => go("/verify?tab=margins")}>See how far each input can move</button>
        </Reveal>
      )}
    </div>
  );
}
