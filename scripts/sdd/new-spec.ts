/**
 * npm run sdd:new -- <kebab-slug> ["Title"] [--risk low|medium|high]
 *
 * Scaffolds agent-os/specs/NNNN-<slug>/ from _templates with the next free id.
 * Only spec.md is created — plan.md and tasks.md come from /sdd:plan and
 * /sdd:tasks once the behaviour is agreed, so a draft never carries an empty
 * plan pretending to be one.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RISK_LEVELS, SPEC_DIR_PATTERN } from "./spec-lint";

const repoRoot = resolve(__dirname, "..", "..");
const specsRoot = join(repoRoot, "agent-os", "specs");

const argv = process.argv.slice(2);
const riskIdx = argv.indexOf("--risk");
const risk = riskIdx >= 0 ? argv[riskIdx + 1] : "low";
const positional = argv.filter((_, i) => i !== riskIdx && i !== riskIdx + 1);
const [slug, title] = positional;

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: npm run sdd:new -- <kebab-slug> ["Title"] [--risk low|medium|high]');
  process.exit(1);
}
if (!(RISK_LEVELS as readonly string[]).includes(risk)) {
  console.error(`--risk must be one of ${RISK_LEVELS.join(", ")}`);
  process.exit(1);
}

const used = existsSync(specsRoot)
  ? readdirSync(specsRoot)
      .map((d) => d.match(SPEC_DIR_PATTERN)?.[1])
      .filter((x): x is string => Boolean(x))
      .map(Number)
  : [];
const id = String((used.length ? Math.max(...used) : 0) + 1).padStart(4, "0");
const dir = join(specsRoot, `${id}-${slug}`);
const today = new Date().toISOString().slice(0, 10);
const niceTitle = title ?? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const template = readFileSync(join(specsRoot, "_templates", "spec.md"), "utf8");
const out = template
  .replace(/NNNN/g, id)
  .replace(/YYYY-MM-DD/g, today)
  .replace('title: "<behaviour in one line>"', `title: "${niceTitle.replace(/"/g, "'")}"`)
  .replace("risk: low", `risk: ${risk}`)
  .replace("# " + id + " — <Title>", `# ${id} — ${niceTitle}`);

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "spec.md"), out);
console.log(`created agent-os/specs/${id}-${slug}/spec.md`);
