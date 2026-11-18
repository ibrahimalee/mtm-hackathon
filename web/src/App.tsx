import { AnimatePresence, MotionConfig } from "framer-motion";
import Lenis from "lenis";
import { useCallback, useEffect, useRef, useState } from "react";
import { State, fetchState } from "./api";
import { Bento, CardDetail, CommandBar, Inbox, Pipeline, Rejected, TraceConsole } from "./components/Control";
import { JudgeMode } from "./components/JudgeMode";
import { Lab } from "./components/Lab";
import { Act, Palette, ShortcutSheet } from "./components/Palette";

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function App() {
  const [s, setS] = useState<State | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [judge, setJudge] = useState(false);
  const [jStep, setJStep] = useState(0);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const failed = useRef(false);

  const refresh = useCallback(async () => {
    try { setS(await fetchState()); if (failed.current) { failed.current = false; setToast(""); } }
    catch { if (!failed.current) { failed.current = true; setToast("Cannot reach the server. Start it with: python server.py"); } }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 1000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const h = (e: any) => setBusy(!!e.detail); window.addEventListener("muntazim:busy", h); return () => window.removeEventListener("muntazim:busy", h); }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis();
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  const exportBoth = () => ["plan", "trace"].forEach((n, i) => setTimeout(() => { const a = document.createElement("a"); a.href = `/api/export/${n}`; a.download = ""; a.click(); }, i * 250));
  const startJudge = () => { setJStep(0); setJudge(true); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j") judge ? setJudge(false) : startJudge();
      else if (key === "t") { setTraceOpen((o) => !o); go("trace"); }
      else if (key === "r") go("rejected");
      else if (key === "e") exportBoth();
      else if (e.key === "?") setHelp((h) => !h);
      else if (e.key === "Escape") { setHelp(false); setOpenCard(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [judge]);

  const onSource = useCallback((ids: string[]) => {
    setHighlight(ids);
    const f = s?.facts.find((x) => x.id === ids[0]);
    if (f) document.getElementById(`msg-${f.msg_id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => setHighlight([]), 6000);
  }, [s]);

  const actions: Act[] = [
    { id: "plan", label: "Go to plan", run: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { id: "rej", label: "Go to rejected messages", hint: "R", run: () => go("rejected") },
    { id: "trace", label: "Go to trace", hint: "T", run: () => go("trace") },
    { id: "lab", label: "Go to lab", run: () => go("lab") },
    { id: "exp", label: "Export plan.md and trace.txt", hint: "E", run: exportBoth },
    { id: "judge", label: "Toggle judge mode", hint: "J", run: () => (judge ? setJudge(false) : startJudge()) },
    { id: "help", label: "Show shortcuts", hint: "?", run: () => setHelp(true) },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div id="top">
        <CommandBar s={s ?? ({ audit: [], rejections: [], trace: { runs: [], grand_total_tokens: 0 }, run_id: "" } as any)} busy={busy} onJudge={() => (judge ? setJudge(false) : startJudge())} onPalette={() => setPalette(true)} />
        {!s ? (
          <div className="mx-auto max-w-[1800px] space-y-3 px-4 py-6"><div className="skeleton h-14" /><div className="grid grid-cols-6 gap-3"><div className="skeleton col-span-3 h-44" /><div className="skeleton col-span-3 h-44" /><div className="skeleton col-span-2 h-32" /><div className="skeleton col-span-2 h-32" /><div className="skeleton col-span-2 h-32" /></div></div>
        ) : s.empty || !s.plan?.feasible ? (
          <Empty infeasible={!s.empty} />
        ) : (
          <>
            <Pipeline s={s} />
            <main className="mx-auto grid max-w-[1800px] gap-3 px-4 pt-0 lg:grid-cols-12">
              <div className="lg:col-span-9"><Bento s={s} open={setOpenCard} onSource={onSource} /></div>
              <div className="relative min-h-[320px] lg:col-span-3"><div className="absolute inset-0"><Inbox s={s} highlight={highlight} /></div></div>
            </main>
            <div className="mx-auto grid max-w-[1800px] gap-4 px-4 pt-4 pb-6 lg:grid-cols-12">
              <div className="lg:col-span-7"><Rejected rs={s.rejections} /></div>
              <div className="lg:col-span-5"><TraceConsole s={s} expanded={traceOpen} setExpanded={setTraceOpen} /></div>
            </div>
            <Lab s={s} refresh={refresh} />
            <div className="h-32" />
            <AnimatePresence>{openCard && <CardDetail id={openCard} s={s} onClose={() => setOpenCard(null)} onSource={onSource} />}</AnimatePresence>
          </>
        )}
        {judge && s && !s.empty && <JudgeMode step={jStep} setStep={setJStep} onExit={() => setJudge(false)} />}
        <Palette open={palette} setOpen={setPalette} actions={actions} />
        <ShortcutSheet open={help} onClose={() => setHelp(false)} />
        {toast && <div role="alert" className="fixed bottom-4 right-4 z-[120] rounded-card border border-bad/50 bg-raised px-4 py-2 text-13 text-bad">{toast}</div>}
      </div>
    </MotionConfig>
  );
}

function Empty({ infeasible }: { infeasible: boolean }) {
  const cmd = "python run.py <file>";
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto mt-16 max-w-xl px-4">
      <h2 className="serif text-[44px] leading-none">{infeasible ? "No valid plan yet" : "Nothing planned yet"}</h2>
      <p className="mt-3 text-14 text-dim">{infeasible ? "The messages read so far do not give enough facts for a valid plan. Run another file to add more." : "Run the pipeline on a text file of messages and this page fills in as it works."}</p>
      <button className="card num mt-5 flex w-full items-center justify-between px-4 py-3 text-left text-14 hover:border-white/20" onClick={() => { navigator.clipboard?.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        <span>{cmd}</span><span className="text-12 text-mute">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
