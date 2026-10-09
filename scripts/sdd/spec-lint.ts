/**
 * Spec linter — the enforcement half of agent-os/standards/sdd/workflow.md.
 *
 * A rule in the workflow standard that this file does not check is a request,
 * not a gate. Keep the two in sync: adding a lifecycle rule there means adding
 * it here in the same change (and a test in __tests__/sdd-spec-lint.test.ts).
 *
 * Pure parsing/lint functions are separated from the fs loaders so the rules
 * are unit-testable without touching disk.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const SPEC_STATUSES = [
  "draft",
  "approved",
  "in-progress",
  "verified",
  "shipped",
  "superseded",
  "abandoned",
] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;

export const VERIFY_KINDS = ["test", "eval", "build", "manual"] as const;
export type VerifyKind = (typeof VERIFY_KINDS)[number];

const REQUIRED_SPEC_SECTIONS = [
  "Problem",
  "Goals",
  "Non-goals",
  "Requirements",
  "Acceptance criteria",
  "Open questions",
  "Decisions",
  "Metrics",
];

const REQUIRED_PLAN_SECTIONS = [
  "Approach",
  "Constitution check",
  "Files touched",
  "Data and contracts",
  "Risks and kill switch",
  "Verification plan",
];

/** Articles of agent-os/standards/sdd/constitution.md, by numeral. */
export const CONSTITUTION_ARTICLES = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Statuses at or past `approved` — behaviour is agreed and must be complete. */
const AGREED: ReadonlySet<SpecStatus> = new Set(["approved", "in-progress", "verified", "shipped"]);
const BUILDING: ReadonlySet<SpecStatus> = new Set(["in-progress", "verified", "shipped"]);
const PROVEN: ReadonlySet<SpecStatus> = new Set(["verified", "shipped"]);

export const SPEC_DIR_PATTERN = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NEEDS_CLARIFICATION = "[NEEDS CLARIFICATION";

export type Frontmatter = Record<string, string | string[]>;

export interface Verify {
  kind: VerifyKind;
  target: string;
}

export interface AcceptanceCriterion {
  id: string; // "AC-3"
  verify: Verify | null;
  /** Raw `Verify:` value when present but unparseable. */
  rawVerify: string | null;
  covers: string[]; // ["REQ-1", "REQ-2"]
}

export interface ConstitutionRow {
  article: string; // roman numeral
  result: string; // pass | n/a | violation (lowercased)
  notes: string;
}

export interface SpecDoc {
  /** Folder name, e.g. "0002-honest-offer". */
  dir: string;
  spec: string | null;
  plan: string | null;
  tasks: string | null;
}

export interface SpecTag {
  specId: string;
  acId: string;
  file: string;
  line: number;
}

export interface LintIssue {
  level: "error" | "warning";
  spec: string;
  message: string;
}

// ---------------------------------------------------------------- parsing

/**
 * Minimal frontmatter parser: `key: value`, quoted strings, and inline lists
 * `[a, b]`. Deliberately not a YAML implementation — specs only need flat
 * scalar fields, and a dependency-free parser keeps the gate runnable anywhere.
 */
export function parseFrontmatter(text: string): { data: Frontmatter; body: string } | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const data: Frontmatter = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: m[2] };
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function str(fm: Frontmatter, key: string): string {
  const v = fm[key];
  return typeof v === "string" ? v : "";
}

/** `## Heading` → section text (up to the next `## `). Code fences are skipped. */
export function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    const h = !inFence ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (h) {
      if (current !== null) sections.set(current, buf.join("\n"));
      current = h[1];
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) sections.set(current, buf.join("\n"));
  return sections;
}

/** Remove HTML comments so template guidance never counts as content. */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export function parseRequirements(section: string): string[] {
  const ids = new Set<string>();
  for (const m of stripComments(section).matchAll(/\*\*(REQ-\d+)\*\*/g)) ids.add(m[1]);
  return [...ids];
}

export function parseVerify(raw: string): Verify | null {
  const m = raw.trim().match(/^(test|eval|build|manual)\b\s*(.*)$/);
  if (!m) return null;
  const kind = m[1] as VerifyKind;
  const target = m[2].trim().replace(/^`|`$/g, "");
  if (kind !== "build" && !target) return null;
  return { kind, target };
}

/** `### AC-n — name` blocks inside the Acceptance criteria section. */
export function parseAcceptanceCriteria(section: string): AcceptanceCriterion[] {
  const acs: AcceptanceCriterion[] = [];
  const blocks = stripComments(section).split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/^(AC-\d+)\b/);
    if (!idMatch) continue;
    const verifyLine = block.match(/^Verify:\s*(.+)$/m);
    const coversLine = block.match(/^Covers:\s*(.+)$/m);
    acs.push({
      id: idMatch[1],
      verify: verifyLine ? parseVerify(verifyLine[1]) : null,
      rawVerify: verifyLine ? verifyLine[1].trim() : null,
      covers: coversLine ? [...coversLine[1].matchAll(/REQ-\d+/g)].map((x) => x[0]) : [],
    });
  }
  return acs;
}

export function parseConstitutionCheck(section: string): ConstitutionRow[] {
  const rows: ConstitutionRow[] = [];
  for (const line of section.split(/\r?\n/)) {
    const cells = line.split("|").map((c) => c.trim());
    // | I. Precision over recall | pass | notes |  → ["", "I. …", "pass", "notes", ""]
    if (cells.length < 4) continue;
    const art = cells[1].match(/^(I{1,3}|IV|V|VI{1,3}|IX)\./);
    if (!art) continue;
    rows.push({ article: art[1], result: cells[2].toLowerCase(), notes: cells[3] ?? "" });
  }
  return rows;
}

export function parseTasks(text: string): { total: number; done: number } {
  const body = stripComments(text);
  const total = (body.match(/^\s*- \[[ xX]\]/gm) ?? []).length;
  const done = (body.match(/^\s*- \[[xX]\]/gm) ?? []).length;
  return { total, done };
}

/** Dated entries in the tasks.md verification log, excluding the template line. */
export function countLogEntries(tasksText: string): number {
  const log = splitSections(parseFrontmatter(tasksText)?.body ?? tasksText).get("Verification log") ?? "";
  return (stripComments(log).match(/^- \d{4}-\d{2}-\d{2}\b/gm) ?? []).length;
}

/**
 * `// @spec 0002/AC-3` or `// @spec 0002/AC-3,AC-4` in a test file. Comment
 * position only (`//`, `/*`, or a ` * ` doc line): a string literal that merely
 * mentions a tag — an assertion message, a fixture — must not count as proof.
 */
export function extractSpecTags(text: string, file: string): SpecTag[] {
  const tags: SpecTag[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(?:\/\/|\/\*+|^\s*\*)\s*@spec\s+(\d{4})\/(AC-\d+(?:\s*,\s*AC-\d+)*)/g)) {
      for (const ac of m[2].split(",")) {
        tags.push({ specId: m[1], acId: ac.trim(), file, line: i + 1 });
      }
    }
  });
  return tags;
}

// ------------------------------------------------------------------ rules

export function lintSpec(doc: SpecDoc, tags: SpecTag[], fileExists: (p: string) => boolean): LintIssue[] {
  const issues: LintIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", spec: doc.dir, message });
  const warn = (message: string) => issues.push({ level: "warning", spec: doc.dir, message });

  const dirMatch = doc.dir.match(SPEC_DIR_PATTERN);
  if (!dirMatch) err(`folder name must be NNNN-kebab-slug`);

  if (doc.spec === null) {
    err("spec.md is missing");
    return issues;
  }
  const parsed = parseFrontmatter(doc.spec);
  if (!parsed) {
    err("spec.md has no frontmatter block");
    return issues;
  }
  const fm = parsed.data;
  const id = str(fm, "id");
  if (!/^\d{4}$/.test(id)) err(`frontmatter id must be four digits, got "${id}"`);
  else if (dirMatch && dirMatch[1] !== id) err(`frontmatter id ${id} does not match folder prefix ${dirMatch[1]}`);

  const status = str(fm, "status") as SpecStatus;
  if (!SPEC_STATUSES.includes(status)) {
    err(`status must be one of ${SPEC_STATUSES.join(", ")}, got "${status}"`);
    return issues;
  }
  const risk = str(fm, "risk");
  if (!(RISK_LEVELS as readonly string[]).includes(risk)) err(`risk must be low, medium or high, got "${risk}"`);
  for (const key of ["title", "owner", "created", "updated"]) {
    if (!str(fm, key)) err(`frontmatter "${key}" is empty`);
  }
  for (const key of ["created", "updated"]) {
    const v = str(fm, key);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) err(`frontmatter "${key}" must be YYYY-MM-DD`);
  }

  const sections = splitSections(parsed.body);
  for (const s of REQUIRED_SPEC_SECTIONS) {
    if (!sections.has(s)) err(`spec.md is missing section "## ${s}"`);
  }

  const reqs = parseRequirements(sections.get("Requirements") ?? "");
  const acs = parseAcceptanceCriteria(sections.get("Acceptance criteria") ?? "");
  if (reqs.length === 0) err("no requirements (expected **REQ-n** entries)");
  if (acs.length === 0) err("no acceptance criteria (expected ### AC-n blocks)");

  const seenAc = new Set<string>();
  const coveredReqs = new Set<string>();
  for (const ac of acs) {
    if (seenAc.has(ac.id)) err(`${ac.id} is defined twice`);
    seenAc.add(ac.id);
    if (!ac.rawVerify) err(`${ac.id} has no "Verify:" line`);
    else if (!ac.verify) err(`${ac.id} Verify line "${ac.rawVerify}" must be: test <path> | eval <cmd> | build | manual <how>`);
    if (ac.covers.length === 0) warn(`${ac.id} has no "Covers:" line`);
    for (const r of ac.covers) {
      if (!reqs.includes(r)) err(`${ac.id} covers ${r}, which is not a defined requirement`);
      coveredReqs.add(r);
    }
  }
  for (const r of reqs) {
    if (!coveredReqs.has(r)) {
      if (AGREED.has(status)) err(`${r} is not covered by any acceptance criterion`);
      else warn(`${r} is not covered by any acceptance criterion yet`);
    }
  }

  // Markers may sit inline anywhere in the spec, not only under Open questions.
  // Inline code is excluded so a spec can *talk about* the marker.
  const prose = stripComments(parsed.body).replace(/`[^`\n]*`/g, "");
  if (AGREED.has(status) && prose.includes(NEEDS_CLARIFICATION)) {
    err(`status is ${status} but the spec still has [NEEDS CLARIFICATION] markers`);
  }

  if (status === "superseded" && !str(fm, "superseded_by")) err(`status superseded requires superseded_by`);
  if (status === "abandoned") {
    const decisions = stripComments(sections.get("Decisions") ?? "").trim();
    if (!/^- \S/m.test(decisions) || decisions.includes("<decision>")) {
      err("status abandoned requires a reason in ## Decisions");
    }
  }

  // ---- plan gate
  if (AGREED.has(status)) {
    if (doc.plan === null) err(`status is ${status} but plan.md is missing`);
    else issues.push(...lintPlan(doc.dir, doc.plan, risk));
  }

  // ---- tasks gate
  if (BUILDING.has(status) && doc.tasks === null) err(`status is ${status} but tasks.md is missing`);

  // ---- proof gate
  if (PROVEN.has(status)) {
    if (doc.tasks !== null) {
      const t = parseTasks(doc.tasks);
      if (t.total === 0) err("tasks.md has no checklist items");
      else if (t.done < t.total) err(`status is ${status} but ${t.total - t.done} of ${t.total} tasks are unchecked`);
      if (countLogEntries(doc.tasks) === 0) err(`status is ${status} but the verification log has no dated entry`);
    }
    for (const ac of acs) {
      if (ac.verify?.kind !== "test") continue;
      const target = ac.verify.target;
      if (!fileExists(target)) {
        err(`${ac.id} verifies with ${target}, which does not exist`);
        continue;
      }
      const inTarget = tags.some((t) => t.specId === id && t.acId === ac.id && t.file === target);
      if (!inTarget) err(`${ac.id} has no @spec ${id}/${ac.id} tag in ${target}`);
    }
  }

  return issues;
}

export function lintPlan(dir: string, planText: string, risk: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", spec: dir, message });
  const body = parseFrontmatter(planText)?.body ?? planText;
  const sections = splitSections(body);
  for (const s of REQUIRED_PLAN_SECTIONS) {
    if (!sections.has(s)) err(`plan.md is missing section "## ${s}"`);
  }
  const rows = parseConstitutionCheck(sections.get("Constitution check") ?? "");
  for (const art of CONSTITUTION_ARTICLES) {
    const row = rows.find((r) => r.article === art);
    if (!row) {
      err(`constitution check has no row for article ${art}`);
      continue;
    }
    if (!["pass", "n/a", "violation"].includes(row.result)) {
      err(`constitution article ${art} result must be pass, n/a or violation, got "${row.result}"`);
    }
    if (row.result === "violation" && !row.notes) {
      err(`constitution article ${art} is a violation with no justification`);
    }
  }
  // sdd/workflow: high-risk specs name their eval — article IV cannot be waved off.
  if (risk === "high") {
    const iv = rows.find((r) => r.article === "IV");
    if (iv && iv.result === "n/a") err("risk: high spec marks article IV (Measured) n/a — name the before/after measurement");
  }
  return issues;
}

/** Cross-spec rules: duplicate ids, and tags pointing at nothing. */
export function lintAll(docs: SpecDoc[], tags: SpecTag[], fileExists: (p: string) => boolean): LintIssue[] {
  const issues: LintIssue[] = [];
  const acIndex = new Map<string, Set<string>>();
  const idOwner = new Map<string, string>();

  for (const doc of docs) {
    issues.push(...lintSpec(doc, tags, fileExists));
    const parsed = doc.spec ? parseFrontmatter(doc.spec) : null;
    const id = parsed ? str(parsed.data, "id") : "";
    if (!id) continue;
    if (idOwner.has(id)) {
      issues.push({ level: "error", spec: doc.dir, message: `spec id ${id} is also used by ${idOwner.get(id)}` });
    }
    idOwner.set(id, doc.dir);
    const acs = parseAcceptanceCriteria(splitSections(parsed!.body).get("Acceptance criteria") ?? "");
    acIndex.set(id, new Set(acs.map((a) => a.id)));
  }

  for (const t of tags) {
    const acs = acIndex.get(t.specId);
    if (!acs) {
      issues.push({ level: "error", spec: t.specId, message: `${t.file}:${t.line} tags @spec ${t.specId}/${t.acId} but spec ${t.specId} does not exist` });
    } else if (!acs.has(t.acId)) {
      issues.push({ level: "error", spec: idOwner.get(t.specId) ?? t.specId, message: `${t.file}:${t.line} tags ${t.acId}, which spec ${t.specId} does not define` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------- loading

export function loadSpecs(specsRoot: string): SpecDoc[] {
  if (!existsSync(specsRoot)) return [];
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  return readdirSync(specsRoot)
    .filter((name) => !name.startsWith("_") && !name.startsWith("."))
    .filter((name) => statSync(join(specsRoot, name)).isDirectory())
    .sort()
    .map((dir) => ({
      dir,
      spec: read(join(specsRoot, dir, "spec.md")),
      plan: read(join(specsRoot, dir, "plan.md")),
      tasks: read(join(specsRoot, dir, "tasks.md")),
    }));
}

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "graft", "graphify-out", "test-results"]);

/** Collect @spec tags from every test file under the given roots (repo-relative paths). */
export function collectTags(repoRoot: string, roots: string[]): SpecTag[] {
  const tags: SpecTag[] = [];
  const walk = (abs: string) => {
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = join(abs, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (TEST_FILE.test(entry.name)) {
        tags.push(...extractSpecTags(readFileSync(p, "utf8"), relative(repoRoot, p).split("\\").join("/")));
      }
    }
  };
  for (const r of roots) walk(join(repoRoot, r));
  return tags;
}

export const TAG_ROOTS = ["__tests__", "tests", "lib", "app", "components", "scripts"];
