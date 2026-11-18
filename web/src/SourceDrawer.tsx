import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { State } from "./api";
import { Chip, Stamp } from "./kit";
import { ROLE_LABEL, describeFact } from "./lib";

export function SourceDrawer({ s, ids, onClose, go }: { s: State; ids: string[] | null; onClose: () => void; go: (to: string) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const facts = ids ? s.facts.filter((f) => ids.includes(f.id)) : [];
  return (
    <AnimatePresence>
      {ids && (
        <>
          <motion.div className="fixed inset-0 z-[120] bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 34 }} className="fixed inset-y-0 right-0 z-[130] w-[min(460px,100vw)] overflow-y-auto border-l border-ink bg-sheet p-6" style={{ boxShadow: "-6px 0 0 var(--hard)" }} role="dialog" aria-label="Where this came from">
            <div className="mb-1 flex items-center"><span className="kicker">Where this came from</span><button className="btn ghost ml-auto px-3 py-1" onClick={onClose}>Close</button></div>
            <h2 className="serif mb-4 text-[34px] leading-tight">The message behind the number</h2>
            {facts.map((f) => {
              const m = s.messages.find((x) => x.id === f.msg_id);
              return (
                <div key={f.id} className="mb-5 rounded border border-line2 bg-sheet2 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><span className="mono text-[12px] text-ink3">{f.id}</span><span className="text-[14px] font-medium">{m?.sender || "Unknown"}</span>{m && <Chip>{ROLE_LABEL[m.role] || m.role}</Chip>}{m?.date && <Chip>{m.date.startsWith("0000") ? m.date.slice(5) : m.date}</Chip>}</div>
                  <div className="text-[14px] text-ink2">Fact read: <b className="text-ink">{describeFact(f)}</b></div>
                  <blockquote className="mt-3 border-l-4 border-accent pl-3 text-[15px]">“{f.quote}”</blockquote>
                  <div className="mt-3 flex items-center gap-2"><Stamp status={f.status === "active" ? "used" : f.status} />{m && <button className="btn ghost px-3 py-1 text-[13px]" onClick={() => { onClose(); go(`/messages?m=${m.id}`); }}>Open the full message</button>}</div>
                </div>
              );
            })}
            {!facts.length && <p className="text-ink2">No source recorded.</p>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
