import { motion } from "framer-motion";
import { useState } from "react";
import { State } from "../api";
import { Chip, Empty, Odometer, PageHeader, Reveal } from "../kit";

const EV: Record<string, string> = { retry: "var(--amber)", info: "var(--blue)", reject: "var(--accent)", convert: "var(--amber)", warn: "var(--amber)", ok: "var(--green)" };

export default function Activity({ s }: { s: State }) {
  const [open, setOpen] = useState<number | null>(null);
  const runs = s.trace.runs;
  const calls = runs.reduce((n, r) => n + r.calls.length, 0);
  if (!runs.length) return <Empty title="No AI activity yet">Every call to the AI model will be listed here with its full input, output and token count.</Empty>;
  const maxTok = Math.max(...runs.flatMap((r) => r.calls.map((c) => c.tokens.total)), 1);
  return (
    <div>
      <PageHeader kicker="AI activity" title="Every time the AI was used.">
        Only the reading step uses AI. Each call is numbered and shows exactly what it was sent and what it returned. Token counts come from the model provider, never estimated.
      </PageHeader>
      <div className="mb-8 grid gap-4 sm:grid-cols-3" data-tour="activity">
        {[["AI calls", calls], ["Tokens used", s.trace.grand_total_tokens], ["Runs", runs.length]].map(([k, v]: any) => <div key={k} className="sheet sheet-hard p-4"><div className="kicker">{k}</div><Odometer value={v} size={46} /></div>)}
      </div>
      {[...runs].reverse().map((r) => (
        <Reveal key={r.run_id} className="mb-8">
          <div className="sheet pad">
            <div className="mb-4 flex flex-wrap items-center gap-3"><span className="serif text-[28px]">Run {r.run_id}</span><Chip>{r.mode === "full" ? "full run" : "update"}</Chip><span className="mono text-[13px] text-ink2">{r.total_tokens.toLocaleString("en-US")} tokens · {r.calls.length} call(s){r.duration_s != null && ` · ${r.duration_s} s`}</span></div>
            {r.calls.map((c) => (
              <div key={c.n} className="dash py-3">
                <button className="flex w-full flex-wrap items-center gap-3 text-left" onClick={() => setOpen(open === c.n ? null : c.n)}>
                  <span className="mono text-[13px] text-accent">call #{c.n}</span><span className="mono text-[13px]">{c.model}</span><Chip>{c.area}</Chip>
                  <span className="relative ml-auto h-2 w-40 bg-line2"><motion.span initial={{ width: 0 }} animate={{ width: `${(c.tokens.total / maxTok) * 100}%` }} className="absolute inset-y-0 left-0 bg-ink" /></span>
                  <span className="mono w-52 text-right text-[12px] text-ink2">{c.tokens.prompt} in + {c.tokens.completion} out = {c.tokens.total} · {c.ms} ms</span>
                  <span className="text-ink3">{open === c.n ? "−" : "+"}</span>
                </button>
                {open === c.n && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 grid gap-3 md:grid-cols-2">
                    <div><div className="kicker mb-1">Sent</div><pre className="mono max-h-80 overflow-auto rounded border border-line2 bg-sheet2 p-3 text-[12px]">{c.input}</pre></div>
                    <div><div className="kicker mb-1">Returned</div><pre className="mono max-h-80 overflow-auto rounded border border-line2 bg-sheet2 p-3 text-[12px]">{c.output}</pre></div>
                  </motion.div>
                )}
              </div>
            ))}
            {r.events.length > 0 && <div className="mt-3"><div className="kicker mb-2">What else happened</div>{r.events.map((e, i) => <div key={i} className="mono flex gap-2 py-0.5 text-[12px]"><span className="dot mt-[7px]" style={{ background: EV[e.kind] || "var(--ink3)" }} /><span className="text-ink2">{e.text}</span></div>)}</div>}
          </div>
        </Reveal>
      ))}
      <div className="flex gap-3"><a className="btn" href="/api/export/trace" download>Download trace.txt</a><a className="btn" href="/api/export/plan" download>Download plan.md</a></div>
    </div>
  );
}
