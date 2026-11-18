import { Command } from "cmdk";

export type Act = { id: string; label: string; hint?: string; run: () => void };

export function Palette({ open, setOpen, actions }: { open: boolean; setOpen: (b: boolean) => void; actions: Act[] }) {
  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Search or jump" overlayClassName="fixed inset-0 z-[140] bg-ink/40" contentClassName="fixed left-1/2 top-[16vh] z-[150] w-[min(580px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded border border-ink bg-sheet" >
      <Command.Input placeholder="Jump to a page or run an action" className="w-full border-b border-line2 bg-transparent px-4 py-3.5 text-[16px] outline-none placeholder:text-ink3" />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-4 text-[14px] text-ink3">Nothing matches.</Command.Empty>
        {actions.map((a) => (
          <Command.Item key={a.id} value={a.label} onSelect={() => { setOpen(false); a.run(); }} className="flex cursor-pointer items-center justify-between rounded px-3 py-2.5 text-[15px] data-[selected=true]:bg-sheet2 data-[selected=true]:text-accent">
            {a.label}{a.hint && <kbd className="mono text-[11px] text-ink3">{a.hint}</kbd>}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const rows = [["G then O", "Overview"], ["G then P", "The plan"], ["G then R", "Needs attention"], ["G then V", "Stress tests"], ["T", "Guided tour"], ["Ctrl K", "Search or jump"], ["?", "This sheet"], ["Esc", "Close any panel"]];
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/40" onClick={onClose}>
      <div className="sheet pad w-[min(420px,calc(100vw-32px))]" style={{ boxShadow: "5px 5px 0 var(--hard)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="serif mb-3 text-[32px]">Shortcuts</h3>
        {rows.map(([k, t]) => <div key={k} className="dash flex justify-between py-2 text-[14px]"><span className="text-ink2">{t}</span><kbd className="mono rounded border border-line2 px-2 text-[12px]">{k}</kbd></div>)}
      </div>
    </div>
  );
}
