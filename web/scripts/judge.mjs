// Copies the judge tour talking points from docs/WHY.md into web/src/judge.json at build time.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, "..", "..", "docs", "WHY.md"), "utf8");
const part = md.split(/^## Judge tour\s*$/m)[1];
if (!part) throw new Error("docs/WHY.md has no '## Judge tour' section");
const body = part.split(/^## /m)[0];
const steps = [];
for (const block of body.split(/^### /m).slice(1)) {
  const [title, ...rest] = block.split("\n");
  steps.push({ title: title.replace(/^\d+\.\s*/, "").trim(), points: rest.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()) });
}
if (steps.length !== 4) throw new Error(`expected 4 judge steps, found ${steps.length}`);
writeFileSync(join(here, "..", "src", "judge.json"), JSON.stringify(steps, null, 2) + "\n");
console.log(`judge.json: ${steps.length} steps`);
