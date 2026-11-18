import { motion } from "framer-motion";
import { useEffect } from "react";
import judge from "../judge.json";

export const JUDGE_TARGETS = ["plan", "rejected", "verifier", "rulebook"];

export function JudgeMode({ step, setStep, onExit }: { step: number; setStep: (n: number) => void; onExit: () => void }) {
  const steps = judge as { title: string; points: string[] }[];
  useEffect(() => {
    document.body.classList.add("judge-on");
    return () => document.body.classList.remove("judge-on");
  }, []);
  useEffect(() => {
    const el = document.querySelector(`[data-judge="${JUDGE_TARGETS[step]}"]`) as HTMLElement | null;
    document.querySelectorAll("[data-judge-active]").forEach((n) => n.removeAttribute("data-judge-active"));
    if (step === 3) document.querySelector('[data-judge="pipeline"]')?.setAttribute("data-judge-active", "");
    if (el) { el.setAttribute("data-judge-active", ""); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    return () => document.querySelectorAll("[data-judge-active]").forEach((n) => n.removeAttribute("data-judge-active"));
  }, [step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setStep(Math.min(steps.length - 1, step + 1));
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step]);
  const cur = steps[step];
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[60] bg-ink/60 backdrop-blur-sm" />
      <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-4 left-1/2 z-[90] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 rounded-card border border-line bg-raised p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="num text-12 text-signal">{step + 1} / {steps.length}</span>
          <h3 className="serif text-[28px] leading-none">{cur.title}</h3>
          <button className="chip ml-auto hover:text-text" onClick={onExit}>Exit <kbd className="num">Esc</kbd></button>
        </div>
        <ul className="space-y-1.5 text-16 text-dim">{cur.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        <div className="mt-3 flex gap-2">
          <button className="chip hover:text-text disabled:opacity-40" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          <button className="chip border-signal text-signal disabled:opacity-40" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next</button>
          <span className="ml-auto text-12 text-mute">Arrow keys move between steps</span>
        </div>
      </motion.div>
    </>
  );
}
