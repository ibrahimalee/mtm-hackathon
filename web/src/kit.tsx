import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";
import { STATUS_TEXT, STATUS_VAR } from "./lib";

/* ---------------------------------------------------------------- background */
export function Background() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        ref.current?.style.setProperty("--mx", `${e.clientX}px`);
        ref.current?.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", move);
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} className="bg-layer" aria-hidden>
      <div className="bg-grid" />
      <div className="bg-spot" />
      <div className="bg-noise" />
      <svg className="bg-compass" viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1">
        {[190, 160, 130, 100, 70].map((r) => <circle key={r} cx="200" cy="200" r={r} strokeDasharray={r % 20 === 0 ? "2 6" : undefined} />)}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          const l = i % 3 === 0 ? 24 : 12;
          return <line key={i} x1={200 + Math.cos(a) * 190} y1={200 + Math.sin(a) * 190} x2={200 + Math.cos(a) * (190 - l)} y2={200 + Math.sin(a) * (190 - l)} />;
        })}
        <line x1="10" y1="200" x2="390" y2="200" /><line x1="200" y1="10" x2="200" y2="390" />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- motion helpers */
export function Reveal({ children, delay = 0, className = "", y = 14 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? { opacity: 0 } : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function Digit({ d, size }: { d: number; size: number }) {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "inline-block", height: size * 1.12, width: "0.5em", textAlign: "center", overflow: "hidden", lineHeight: `${size * 1.12}px` }}>
      <motion.span style={{ display: "flex", flexDirection: "column" }} initial={{ y: 0 }} animate={{ y: -d * size * 1.12 }}
        transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 120, damping: 20 }}>
        {Array.from({ length: 10 }, (_, i) => <span key={i} style={{ height: size * 1.12, lineHeight: `${size * 1.12}px`, display: "block" }}>{i}</span>)}
      </motion.span>
    </span>
  );
}
export function Odometer({ value, size = 48, className = "serif" }: { value: number | null | undefined; size?: number; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={className} style={{ fontSize: size }}>-</span>;
  const s = Math.round(value).toLocaleString("en-US");
  return (
    <span className={className} style={{ fontSize: size, lineHeight: `${size * 1.12}px`, display: "inline-flex" }} aria-label={s}>
      {s.split("").map((ch, i) => (/\d/.test(ch) ? <Digit key={s.length - i} d={+ch} size={size} /> : <span key={s.length - i}>{ch}</span>))}
    </span>
  );
}

/* ---------------------------------------------------------------- pieces */
export function Stamp({ status, label, big }: { status: string; label?: string; big?: boolean }) {
  const reduce = useReducedMotion();
  const c = STATUS_VAR[status] || "var(--ink3)";
  return (
    <motion.span
      initial={reduce ? { opacity: 0 } : { scale: 2.2, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: reduce ? 0 : -3, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className="mono"
      style={{ display: "inline-block", border: `${big ? 3 : 1.5}px solid ${c}`, color: c, padding: big ? "6px 14px" : "1px 7px", fontSize: big ? 18 : 11, letterSpacing: "0.14em", textTransform: "uppercase", borderRadius: 3, fontWeight: 600, whiteSpace: "nowrap" }}
    >
      {label || STATUS_TEXT[status] || status}
    </motion.span>
  );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return <span className="chip">{color && <span className="dot" style={{ background: color }} />}{children}</span>;
}

export function PageHeader({ kicker, title, children, actions }: { kicker: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="kicker mb-2">{kicker}</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="serif text-[44px] leading-[1.02] md:text-[56px]">{title}</motion.h1>
        {children && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-3 text-[16px] text-ink2">{children}</motion.p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Help({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button aria-label="What is this?" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} className="mono ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line2 text-[11px] text-ink3 hover:border-ink hover:text-ink">?</button>
      <AnimatePresence>
        {open && (
          <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sheet sheet-hard absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 p-3 text-left text-[13px] font-normal normal-case tracking-normal text-ink2">
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Meter({ current, limit, atMost = true, label }: { current: number; limit: number; atMost?: boolean; label?: string }) {
  const max = Math.max(current, limit, 1) * 1.15;
  const slack = atMost ? limit - current : current - limit;
  const near = slack >= 0 && slack <= 0.1 * Math.abs(limit);
  const color = slack < 0 ? "var(--accent)" : near ? "var(--amber)" : "var(--green)";
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div title={label}>
      <div className="relative h-4">
        <div className="absolute left-0 right-0 top-[7px] h-[2px] bg-line2" />
        {[0.25, 0.5, 0.75].map((t) => <div key={t} className="absolute top-[4px] h-2 w-px bg-line2" style={{ left: `${t * 100}%` }} />)}
        <motion.div initial={{ width: 0 }} animate={{ width: at(current) }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} className="absolute left-0 top-[6px] h-[4px]" style={{ background: color }} />
        <div className="absolute top-0 h-4 w-[2px] bg-ink" style={{ left: at(limit) }} title="limit" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink3"><span>{label}</span><span className="mono">{slack >= 0 ? `${slack} to spare` : `${-slack} over`}</span></div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-line2">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`relative px-4 py-2 text-[14px] ${value === t.id ? "text-ink" : "text-ink3 hover:text-ink"}`}>
          {t.label}
          {value === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-[3px] bg-accent" />}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sheet pad crop mx-auto max-w-xl text-center">
      <div className="serif text-[32px]">{title}</div>
      {children && <p className="mt-2 text-ink2">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Money({ children }: { children: number | null | undefined }) {
  return <span className="mono">{children === null || children === undefined ? "-" : Math.round(children).toLocaleString("en-US")}</span>;
}
