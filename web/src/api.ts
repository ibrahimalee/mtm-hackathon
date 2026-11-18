export type Msg = { id: string; sender: string; role: string; date: string | null; text: string; status: string; reason: string };
export type Fact = { id: string; msg_id: string; type: string; key: string; value: any; quote: string; status: string; superseded_by: string | null; reason: string; x: any };
export type Rej = { msg_id: string; fact_id: string; quote: string; rule_id: string; failed_check: string; reason: string; drafted_reply: string; step: number };
export type Rule = { id: string; expr: string; kind: string; area: string; source: any; lhs: any; rhs: any; slack: number | null; status: string; facts: string[]; rejected: { fact_id: string; quote: string; reason: string; msg_id: string }[] };
export type Call = { n: number; model: string; area: string; input: string; output: string; tokens: { prompt: number; completion: number; total: number }; ms: number };
export type Run = { run_id: string; mode: string; calls: Call[]; events: { kind: string; text: string }[]; total_tokens: number; duration_s?: number };
export type State = {
  empty?: boolean; run_id: string; updated_at: string; steps: any[]; messages: Msg[]; facts: Fact[]; plan: any;
  rules: Rule[]; margins: { slack: any[]; breaking_points: any[] }; attack: any; audit: { check: string; pass: boolean; detail: string }[];
  rejections: Rej[]; changes: { forecast?: string[]; recomputed?: string[]; unchanged?: string[]; diff?: { path: string; old: any; new: any }[] };
  trace: { runs: Run[]; grand_total_tokens: number };
};

export async function fetchState(): Promise<State> {
  const r = await fetch("/api/state", { cache: "no-store" });
  if (!r.ok) throw new Error(`state request failed (${r.status})`);
  return r.json();
}

export async function post(path: string, body: any) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.text()) || `request failed (${r.status})`);
  return r.json();
}

export const money = (v: any) => (v === null || v === undefined ? "-" : typeof v === "number" ? Math.round(v).toLocaleString("en-US") : String(v));
