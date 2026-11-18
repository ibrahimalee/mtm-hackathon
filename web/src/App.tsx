import { MotionConfig, motion } from "framer-motion";
import Lenis from "lenis";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { State, fetchState } from "./api";
import { Background } from "./kit";
import { useRoute, useTheme } from "./lib";
import { Act, Palette, ShortcutSheet } from "./Palette";
import { MobileBar, NAV, Rail } from "./Shell";
import { SourceDrawer } from "./SourceDrawer";
import { Tour } from "./Tour";
import Activity from "./pages/Activity";
import Compose from "./pages/Compose";
import Home from "./pages/Home";
import Messages from "./pages/Messages";
import Plan from "./pages/Plan";
import Review from "./pages/Review";
import Verify from "./pages/Verify";
import WhatIf from "./pages/WhatIf";

export default function App() {
  const { route, go } = useRoute();
  const { theme, toggle } = useTheme();
  const [s, setS] = useState<State | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<string[] | null>(null);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const failed = useRef(false);

  const refresh = useCallback(async () => {
    try { setS(await fetchState()); if (failed.current) { failed.current = false; setToast(""); } }
    catch { if (!failed.current) { failed.current = true; setToast("Cannot reach the server. Start it with: python server.py"); } }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 1e3); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const h = (e: any) => setBusy(!!e.detail); window.addEventListener("muntazim:busy", h); return () => window.removeEventListener("muntazim:busy", h); }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.12 });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  const gPending = useRef(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (gPending.current) {
        gPending.current = false;
        const map: Record<string, string> = { o: "/", p: "/plan", m: "/messages", r: "/review", w: "/whatif", v: "/verify", a: "/activity" };
        if (map[key]) go(map[key]);
        return;
      }
      if (key === "g") { gPending.current = true; setTimeout(() => (gPending.current = false), 1.5e3); }
      else if (key === "t") setTour((v) => (v === null ? 0 : null));
      else if (e.key === "?") setHelp((h) => !h);
      else if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  const actions: Act[] = [
    ...NAV.map((n) => ({ id: n.to, label: `Go to ${n.label}`, run: () => go(n.to) })),
    { id: "add", label: "Add a message", run: () => go("/compose") },
    { id: "tour", label: "Start the guided tour", hint: "T", run: () => setTour(0) },
    { id: "theme", label: "Switch light or dark theme", run: toggle },
    { id: "help", label: "Show shortcuts", hint: "?", run: () => setHelp(true) },
  ];

  const ready = !!s && !s.empty && !!s.plan?.feasible;
  const need = (p: ReactNode) => (ready ? p : <Home s={s} go={go} />);
  const path = route.path;
  let page: ReactNode;
  if (!s) page = <div className="space-y-4"><div className="skeleton h-16 w-2/3" /><div className="skeleton h-40" /><div className="grid grid-cols-4 gap-4"><div className="skeleton h-32" /><div className="skeleton h-32" /><div className="skeleton h-32" /><div className="skeleton h-32" /></div></div>;
  else if (path === "/compose") page = <Compose s={s} refresh={refresh} go={go} />;
  else if (path === "/messages") page = s.messages?.length ? <Messages s={s} focus={route.query.m} go={go} /> : <Home s={s} go={go} />;
  else if (path === "/plan") page = need(<Plan s={s} go={go} onSource={setSource} />);
  else if (path === "/review") page = need(<Review s={s} go={go} />);
  else if (path === "/whatif") page = need(<WhatIf s={s} go={go} />);
  else if (path === "/verify") page = need(<Verify s={s} tab={route.query.tab || "rulebook"} setTab={(t) => go(`/verify?tab=${t}`)} />);
  else if (path === "/activity") page = <Activity s={s} />;
  else page = <Home s={s} go={go} />;

  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="sr-only skip">Skip to content</a>
      <Background />
      <Rail s={s} path={path} go={go} onTour={() => setTour(0)} onPalette={() => setPalette(true)} theme={theme} toggleTheme={toggle} />
      <MobileBar path={path} go={go} theme={theme} toggleTheme={toggle} />
      <main id="main" tabIndex={-1} className="relative z-10 min-h-screen px-5 pb-24 pt-8 lg:ml-[248px] lg:px-12 lg:pt-12">
        {busy && <motion.div className="fixed left-0 top-0 z-[300] h-[3px] bg-accent" initial={{ width: "0%" }} animate={{ width: "92%" }} transition={{ duration: 18, ease: "easeOut" }} />}
        <div className="mx-auto max-w-[1180px]">
          <motion.div key={path} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
            {page}
          </motion.div>
        </div>
      </main>
      {s && !s.empty && <SourceDrawer s={s} ids={source} onClose={() => setSource(null)} go={go} />}
      {tour !== null && ready && <Tour step={tour} setStep={setTour} go={go} onExit={() => setTour(null)} />}
      <Palette open={palette} setOpen={setPalette} actions={actions} />
      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
      {toast && <div role="alert" aria-live="assertive" className="sheet fixed bottom-4 right-4 z-[300] px-4 py-2 text-[14px] text-accent" style={{ borderColor: "var(--accent)" }}>{toast}</div>}
    </MotionConfig>
  );
}
