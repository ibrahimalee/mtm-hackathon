import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import judge from "./judge.json";

const STOPS = [
  { to: "/", target: "verdict" },
  { to: "/review", target: "rejected" },
  { to: "/verify?tab=break", target: "breakit" },
  { to: "/verify?tab=rulebook", target: "rulebook" },
];

export function Tour({ step, setStep, go, onExit }: { step: number; setStep: (n: number) => void; go: (to: string) => void; onExit: () => void }) {
  const steps = judge as { title: string; points: string[] }[];
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => { go(STOPS[step].to); }, [step]);
  useEffect(() => {
    let alive = true, tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${STOPS[step].target}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => alive && setRect(el.getBoundingClientRect()), 450);
      } else if (tries++ < 20) setTimeout(find, 100);
      else setRect(null);
    };
    setRect(null);
    setTimeout(find, 250);
    const upd = () => { const el = document.querySelector(`[data-tour="${STOPS[step].target}"]`); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, { passive: true });
    return () => { alive = false; window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd); };
  }, [step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowRight") setStep(Math.min(steps.length - 1, step + 1));
      if (e.key === "ArrowLeft") setStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step]);
  const cur = steps[step];
  return (
    <>
      {rect ? <div className="tour-hole" style={{ left: rect.left - 10, top: rect.top - 10, width: rect.width + 20, height: rect.height + 20 }} /> : <div className="fixed inset-0 z-[190] bg-ink/60" />}
      <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="sheet fixed bottom-5 left-1/2 z-[200] w-[min(680px,calc(100vw-24px))] -translate-x-1/2 p-5" style={{ boxShadow: "5px 5px 0 var(--hard)", borderColor: "var(--ink)" }}>
        <div className="mb-2 flex items-center gap-3"><span className="mono text-[12px] text-accent">STEP {step + 1} OF {steps.length}</span><h3 className="serif text-[30px] leading-none">{cur.title}</h3><button className="btn ghost ml-auto px-3 py-1" onClick={onExit}>Exit</button></div>
        <ul className="space-y-1.5 text-[16px] text-ink2">{cur.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <div className="mt-4 flex items-center gap-2">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < steps.length - 1 ? <button className="btn primary" onClick={() => setStep(step + 1)}>Next</button> : <button className="btn primary" onClick={onExit}>Finish</button>}
          <div className="ml-auto flex gap-1.5">{steps.map((_, i) => <span key={i} className="h-2 w-6" style={{ background: i === step ? "var(--accent)" : "var(--line2)" }} />)}</div>
        </div>
      </motion.div>
    </>
  );
}
