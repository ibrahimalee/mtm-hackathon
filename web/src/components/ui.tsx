import { motion, useReducedMotion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

export const STATUS_COLOR: Record<string, string> = {
  used: "var(--ok)", holds: "var(--ok)", superseded: "var(--warn)", rejected: "var(--bad)", violated: "var(--bad)",
  ignored: "var(--mute)", unsupported: "var(--warn)",
};
export const STATUS_LABEL: Record<string, string> = { used: "Used", superseded: "Superseded", rejected: "Rejected", ignored: "No impact" };

export function Digit({ d, size }: { d: number; size: number }) {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "inline-block", height: size, overflow: "hidden", lineHeight: `${size}px` }}>
      <motion.span
        style={{ display: "flex", flexDirection: "column" }}
        initial={false}
        animate={{ y: -d * size }}
        transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 180, damping: 22 }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{ height: size, lineHeight: `${size}px`, display: "block" }}>{i}</span>
        ))}
      </motion.span>
    </span>
  );
}

export function Odometer({ value, size = 44, className = "serif" }: { value: number | null | undefined; size?: number; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={className} style={{ fontSize: size }}>-</span>;
  const s = Math.round(value).toLocaleString("en-US");
  return (
    <span className={className} style={{ fontSize: size, lineHeight: `${size}px`, display: "inline-flex" }} aria-label={s}>
      {s.split("").map((ch, i) => (/\d/.test(ch) ? <Digit key={s.length - i} d={+ch} size={size} /> : <span key={s.length - i}>{ch}</span>))}
    </span>
  );
}

export function Stamp({ status }: { status: string }) {
  const reduce = useReducedMotion();
  const c = STATUS_COLOR[status] || "var(--mute)";
  return (
    <motion.span
      initial={reduce ? { opacity: 0 } : { scale: 1.7, rotate: -3, opacity: 0 }}
      animate={{ scale: 1, rotate: reduce ? 0 : -3, opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="num"
      style={{ display: "inline-block", border: `1px solid ${c}`, color: c, padding: "1px 6px", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 3 }}
    >
      {STATUS_LABEL[status] || status}
    </motion.span>
  );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="chip">
      {color && <span className="dot" style={{ background: color }} />}
      {children}
    </span>
  );
}

/** Thin slack meter: marker is the current value, the tall tick is the limit. Amber within 10% of the limit. */
export function Meter({ current, limit, atMost = true }: { current: number; limit: number; atMost?: boolean }) {
  const max = Math.max(current, limit, 1) * 1.15;
  const slack = atMost ? limit - current : current - limit;
  const near = slack >= 0 && slack <= 0.1 * Math.abs(limit);
  const color = slack < 0 ? "var(--bad)" : near ? "var(--warn)" : "var(--ok)";
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div title={`${current} of ${limit} (${atMost ? "at most" : "at least"}); slack ${slack}`} style={{ position: "relative", height: 14 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 6, height: 2, background: "var(--line)" }} />
      {[0.25, 0.5, 0.75].map((t) => (
        <div key={t} style={{ position: "absolute", left: `${t * 100}%`, top: 4, width: 1, height: 6, background: "rgba(255,255,255,0.12)" }} />
      ))}
      <motion.div initial={false} animate={{ width: at(current) }} style={{ position: "absolute", left: 0, top: 6, height: 2, background: color }} />
      <div style={{ position: "absolute", left: at(limit), top: 0, width: 1, height: 14, background: "var(--dim)" }} />
      <motion.div initial={false} animate={{ left: at(current) }} style={{ position: "absolute", top: 3, width: 2, height: 8, background: color, marginLeft: -1 }} />
    </div>
  );
}

export function useTick(dep: any, ms = 2000) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [dep]);
  return on;
}

/** Value that flashes an amber underline and shows the old value struck through for 2s after it changes. */
export function Delta({ value, children }: { value: any; children?: ReactNode }) {
  const prev = useRef(value);
  const [old, setOld] = useState<any>(null);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setOld(prev.current);
      const t = setTimeout(() => setOld(null), 2000);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return (
    <span className={old !== null ? "flash" : ""}>
      {old !== null && <s style={{ color: "var(--mute)", marginRight: 6 }}>{typeof old === "number" ? old.toLocaleString("en-US") : String(old)}</s>}
      {children ?? (typeof value === "number" ? value.toLocaleString("en-US") : value)}
    </span>
  );
}

export function SrcBtn({ ids, onSource, children }: { ids?: string[]; onSource: (ids: string[]) => void; children: ReactNode }) {
  if (!ids || !ids.length) return <>{children}</>;
  return (
    <button onClick={(e) => { e.stopPropagation(); onSource(ids); }} title={`Source: ${ids.join(", ")}`} className="text-left underline decoration-dotted decoration-mute underline-offset-4 hover:text-signal">
      {children}
    </button>
  );
}
