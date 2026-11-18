import { useCallback, useEffect, useState } from "react";
import { State } from "./api";

/* ---------------------------------------------------------------- hash router */
export type Route = { path: string; query: Record<string, string> };
const read = (): Route => {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, q = ""] = raw.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(q)) };
};
export function useRoute() {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const h = () => setRoute(read());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = useCallback((to: string) => { window.location.hash = to; window.scrollTo({ top: 0 }); }, []);
  return { route, go };
}

/* ---------------------------------------------------------------- theme */
export function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("muntazim-theme") || "light"; } catch { return "light"; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("muntazim-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) };
}

/* ---------------------------------------------------------------- plain language */
export const ROLE_LABEL: Record<string, string> = {
  organizer_authority: "Organiser", finance: "Finance", judging: "Judging team", venue_vendor: "Venue",
  food_vendor: "Caterer", participant_group: "Participants", individual: "Individual", other: "Other",
};

export const WHY: Record<string, { title: string; plain: string }> = {
  "R-GROUND": { title: "Could not verify", plain: "The wording or a number in this fact could not be found in the original message, so it was not trusted." },
  "R-STALE": { title: "Out of date", plain: "A newer message already covers this, so the older one was set aside." },
  "R-AUTH": { title: "Not theirs to decide", plain: "This sender is not the person who can decide this, or ranks below the person who did." },
  "R-TOTAL": { title: "Numbers do not add up", plain: "A total was stated but it does not equal its parts." },
  "R-CONFLICT": { title: "Contradicts a higher authority", plain: "It disagrees with something said by someone who outranks the sender." },
  "R-HARD-meals": { title: "Not enough meals", plain: "Accepting this would leave people without a meal." },
  "R-HARD-capacity": { title: "Venue too small", plain: "Accepting this would leave people without a seat." },
  "R-HARD-budget": { title: "Over budget", plain: "Accepting this would push the plan past the budget cap." },
  "R-HARD-judges": { title: "Judging rules broken", plain: "Accepting this would break the limit on teams per judge or the judges available." },
  "R-HARD-schedule": { title: "Schedule would not fit", plain: "Accepting this would make the schedule longer than the event." },
  "R-HARD-blocks": { title: "Removes a required block", plain: "A block someone asked to keep would disappear from the schedule." },
  "R-HARD-constraint": { title: "Breaks a stated requirement", plain: "Accepting this would break a requirement another message set." },
};
export const whyOf = (id: string) => WHY[id] || { title: "Rule blocked it", plain: "A rule in the rulebook blocked this change." };

export const STATUS_TEXT: Record<string, string> = { used: "Used", superseded: "Replaced", rejected: "Rejected", ignored: "No impact" };
export const STATUS_VAR: Record<string, string> = {
  used: "var(--green)", superseded: "var(--amber)", rejected: "var(--accent)", ignored: "var(--ink3)", holds: "var(--green)", violated: "var(--accent)",
};

export const money = (v: any) => (v === null || v === undefined ? "-" : typeof v === "number" ? Math.round(v).toLocaleString("en-US") : String(v));
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------------------------------------------------------------- derived views */
export function attention(s: State) {
  const items: { kind: "missing" | "rejected" | "tight" | "request"; title: string; detail: string; to: string }[] = [];
  const miss = (s.audit || []).find((a: any) => a.missing?.length)?.["missing"] || [];
  miss.forEach((m: any) => items.push({ kind: "missing", title: `We could not find the ${m.label}`, detail: "The plan was built without it. Add a message that states it.", to: "/compose" }));
  s.rejections.forEach((r) => items.push({ kind: "rejected", title: whyOf(r.rule_id).title, detail: `“${r.quote}”`, to: "/review" }));
  (s.margins?.slack || []).filter((x: any) => x.near).forEach((x: any) =>
    items.push({ kind: "tight", title: "Very little room left", detail: `${x.expr} (slack ${x.slack})`, to: "/verify?tab=margins" }));
  (s.plan?.budget?.optional || []).forEach((o: any) =>
    items.push({ kind: "request", title: `Requested, not decided: ${o.item}`, detail: `${money(o.amount)} — ${o.fits ? "fits the budget" : "does not fit the budget"}`, to: "/review" }));
  return items;
}

export const isVerified = (s: State) => !!s.audit?.length && s.audit.every((a) => a.pass);

export const describeFact = (f: any): string => {
  const x = f.x || {};
  const m = (v: any) => (typeof v === "number" ? v.toLocaleString("en-US") : v);
  if (f.type === "param") return `${f.key.replace(/[._]/g, " ")}: ${m(f.value)}`;
  if (f.type === "option") return `${x.category || "option"} “${x.name || f.key}”: ${m(x.price)}${x.basis === "per_head" ? " per head" : ""}${x.capacity != null ? `, seats ${m(x.capacity)}` : ""}${x.tier ? `, ${x.tier} tier` : ""}`;
  if (f.type === "expense") return `${x.status === "requested" ? "requested" : "committed"} expense “${x.item || f.key}”: ${m(x.amount)}`;
  if (f.type === "block") return `required block “${x.name || f.key}”: ${m(x.minutes)} min${x.at ? ` at ${x.at}` : ""}`;
  if (f.type === "constraint") return `requirement: ${x.metric} ${x.op} ${m(x.value)}`;
  return `request: ${f.quote}`;
};
