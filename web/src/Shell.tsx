import { motion } from "framer-motion";
import { ReactNode } from "react";
import { State } from "./api";
import { Stamp } from "./kit";
import { attention, isVerified } from "./lib";

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const NAV = [
  { to: "/", label: "Overview", icon: I("M3 11l9-8 9 8M5 10v10h14V10") },
  { to: "/plan", label: "The plan", icon: I("M4 4h16v16H4zM4 9h16M9 9v11") },
  { to: "/messages", label: "Messages", icon: I("M4 5h16v11H8l-4 4zM8 9h8M8 12h5") },
  { to: "/review", label: "Needs attention", icon: I("M12 3l10 18H2zM12 10v5M12 18h.01") },
  { to: "/whatif", label: "What-if", icon: I("M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6") },
  { to: "/verify", label: "Stress tests", icon: I("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4") },
  { to: "/activity", label: "AI activity", icon: I("M3 12h4l3-8 4 16 3-8h4") },
];

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg width="38" height="38" viewBox="0 0 38 38"><rect x="1.5" y="1.5" width="35" height="35" rx="5" fill="var(--ink)" /><circle cx="29" cy="9" r="3.4" fill="var(--accent)" /><path d="M8 29V10l8 11 8-11v19" stroke="var(--sheet2)" strokeWidth="2.6" fill="none" strokeLinejoin="round" strokeLinecap="round" /></svg>
      <div><div className="serif text-[26px] leading-none">Muntazim</div><div className="kicker mt-1">event planner</div></div>
    </div>
  );
}

export function Rail({ s, path, go, onTour, onPalette, theme, toggleTheme }: { s: State | null; path: string; go: (to: string) => void; onTour: () => void; onPalette: () => void; theme: string; toggleTheme: () => void }) {
  const items = s && !s.empty ? attention(s) : [];
  const badge: Record<string, number> = { "/messages": s?.messages?.length || 0, "/review": items.filter((i) => i.kind !== "tight").length };
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line2 bg-sheet px-4 py-5 lg:flex">
      <button onClick={() => go("/")} className="mb-8 text-left"><Logo /></button>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const on = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <button key={n.to} onClick={() => go(n.to)} className={`relative flex items-center gap-3 rounded px-3 py-2.5 text-left text-[14px] ${on ? "text-ink" : "text-ink2 hover:text-ink"}`}>
              {on && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded border border-ink bg-sheet2" style={{ boxShadow: "2px 2px 0 var(--hard)" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{n.icon}</span>
              <span className="relative flex-1">{n.label}</span>
              {badge[n.to] ? <span className={`mono relative rounded-full px-1.5 text-[11px] ${n.to === "/review" ? "bg-accent text-white" : "bg-line text-ink2"}`}>{badge[n.to]}</span> : null}
            </button>
          );
        })}
      </nav>
      <button onClick={() => go("/compose")} className="btn primary mt-6 justify-center">Add a message</button>
      <div className="mt-auto space-y-3">
        {s && !s.empty && (
          <div className="sheet p-3">
            <div className="kicker mb-2">Current plan</div>
            <Stamp status={isVerified(s) ? "used" : "rejected"} label={isVerified(s) ? "Verified" : "Check it"} />
            <div className="mono mt-2 text-[11px] text-ink3">run {s.run_id}</div>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn ghost flex-1 justify-center text-[13px]" onClick={onTour}>Guided tour</button>
          <button className="btn ghost px-3" onClick={toggleTheme} aria-label="Switch theme">{theme === "light" ? "☾" : "☀"}</button>
        </div>
        <button onClick={onPalette} className="mono w-full text-left text-[11px] text-ink3 hover:text-ink">Search or jump: Ctrl K</button>
      </div>
    </aside>
  );
}

export function MobileBar({ path, go, theme, toggleTheme }: { path: string; go: (to: string) => void; theme: string; toggleTheme: () => void }) {
  return (
    <div className="sticky top-0 z-40 border-b border-line2 bg-sheet/95 lg:hidden">
      <div className="flex items-center justify-between px-4 py-3"><button onClick={() => go("/")}><Logo /></button><button className="btn ghost px-3" onClick={toggleTheme}>{theme === "light" ? "☾" : "☀"}</button></div>
      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        {[...NAV, { to: "/compose", label: "Add message", icon: null as ReactNode }].map((n) => (
          <button key={n.to} onClick={() => go(n.to)} className={`whitespace-nowrap rounded px-3 py-1.5 text-[13px] ${path === n.to || (n.to !== "/" && path.startsWith(n.to)) ? "border border-ink bg-sheet2" : "text-ink2"}`}>{n.label}</button>
        ))}
      </div>
    </div>
  );
}
