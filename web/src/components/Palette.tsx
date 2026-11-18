import { Command } from "cmdk";

export type Act = { id: string; label: string; hint?: string; run: () => void };

export function Palette({ open, setOpen, actions }: { open: boolean; setOpen: (b: boolean) => void; actions: Act[] }) {
  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette" overlayClassName="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm" contentClassName="fixed left-1/2 top-[18vh] z-[110] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-raised">
      <Command.Input placeholder="Jump to a section or run an action" className="w-full border-b border-line bg-transparent px-4 py-3 text-16 outline-none placeholder:text-mute" />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-4 text-13 text-mute">Nothing matches.</Command.Empty>
        {actions.map((a) => (
          <Command.Item key={a.id} value={a.label} onSelect={() => { setOpen(false); a.run(); }} className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-14 data-[selected=true]:bg-white/5 data-[selected=true]:text-signal">
            {a.label}{a.hint && <kbd className="num text-12 text-mute">{a.hint}</kbd>}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const rows = [["J", "Judge mode"], ["T", "Expand or collapse trace"], ["R", "Jump to rejected messages"], ["E", "Export plan.md and trace.txt"], ["Ctrl K", "Command palette"], ["?", "This sheet"], ["Esc", "Close any panel"]];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-[min(420px,calc(100vw-32px))] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="serif mb-3 text-[28px]">Shortcuts</h3>
        {rows.map(([k, t]) => <div key={k} className="tape flex justify-between py-2 text-14"><span className="text-dim">{t}</span><kbd className="num rounded border border-line px-2 text-13">{k}</kbd></div>)}
      </div>
    </div>
  );
}
