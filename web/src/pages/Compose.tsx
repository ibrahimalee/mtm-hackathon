import { motion } from "framer-motion";
import { useState } from "react";
import { State, post } from "../api";
import { Chip, PageHeader } from "../kit";

export default function Compose({ s, refresh, go }: { s: State | null; refresh: () => Promise<void> | void; go: (to: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const has = !!s && !s.empty;
  const send = async () => {
    setBusy(true); setOut(null);
    window.dispatchEvent(new CustomEvent("muntazim:busy", { detail: true }));
    try {
      const r = await post("/api/send", { text });
      await refresh();
      setOut({ ok: r.rc === 0, text: r.rc === 0 ? "Read, checked and planned. See what changed on the overview." : r.tail });
      if (r.rc === 0) setText("");
    } catch (e: any) { setOut({ ok: false, text: e.message }); }
    window.dispatchEvent(new CustomEvent("muntazim:busy", { detail: false }));
    setBusy(false);
  };
  return (
    <div>
      <PageHeader kicker="Add a message" title={has ? "Something new came in?" : "Start with the messages."}>
        Paste any message about the event: an email, a WhatsApp text, a notice, in English or Roman Urdu. Several at once is fine. {has ? "The plan will update, and anything wrong will be rejected with a reason." : "A full plan is built from them."}
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="sheet pad crop">
            <div className="mb-2 flex items-center gap-2"><span className="kicker">Message text</span>{has && <span className="chip" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>Changes the saved plan</span>}</div>
            <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type here. Include who it is from and the date if you have them." aria-label="Message text" />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <motion.button whileTap={{ scale: 0.97 }} className="btn primary" disabled={busy || !text.trim()} onClick={send}>{busy ? "Reading…" : has ? "Update the plan" : "Build the plan"}</motion.button>
              <button className="btn ghost" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { /* clipboard blocked */ } }}>Paste from clipboard</button>
              {text && <span className="mono text-[12px] text-ink3">{text.length.toLocaleString("en-US")} characters</span>}
            </div>
            {busy && <div className="mt-4"><div className="skeleton h-2 w-full" /><p className="mt-2 text-[13px] text-ink2">Reading the messages, then checking every fact. This takes a few seconds.</p></div>}
            {out && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded border p-3 text-[14px]" style={{ borderColor: out.ok ? "var(--green)" : "var(--accent)" }}>
              <pre className="mono text-[12px]">{out.text}</pre>
              {out.ok && <button className="btn mt-3" onClick={() => go("/")}>Back to the overview</button>}
            </motion.div>}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="sheet pad"><div className="serif mb-2 text-[26px]">What happens next</div>
            {["The AI reads the text once and lists the facts it contains, with the exact words it used.", "Plain code checks each fact. Wrong, stale or unauthorised ones are rejected.", "The plan is rebuilt, and you see exactly which parts changed."].map((t, i) => (
              <div key={i} className="dash flex gap-3 py-3"><span className="serif text-[28px] leading-none text-accent">{i + 1}</span><span className="text-[14px] text-ink2">{t}</span></div>
            ))}
          </div>
          <div className="sheet pad"><div className="kicker mb-2">Good to know</div><div className="flex flex-wrap gap-2"><Chip>any format</Chip><Chip>English and Roman Urdu</Chip><Chip>lakh, k and commas understood</Chip><Chip>one AI call</Chip></div></div>
          {has && <div className="sheet pad"><div className="kicker mb-2">Missing something?</div><p className="text-[14px] text-ink2">Items the plan could not find are listed under <button className="underline" onClick={() => go("/review")}>Needs attention</button>.</p></div>}
        </div>
      </div>
    </div>
  );
}
