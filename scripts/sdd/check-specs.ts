/**
 * npm run sdd:check — lint every spec in agent-os/specs/ and print the
 * acceptance-criterion → test traceability matrix.
 *
 *   npm run sdd:check            # issues + matrix, exit 1 on any error
 *   npm run sdd:check -- --quiet # issues only
 *   npm run sdd:check -- --json  # machine-readable
 *
 * Rules live in scripts/sdd/spec-lint.ts; the policy behind them in
 * agent-os/standards/sdd/workflow.md.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  TAG_ROOTS,
  collectTags,
  lintAll,
  loadSpecs,
  parseAcceptanceCriteria,
  parseFrontmatter,
  splitSections,
} from "./spec-lint";

const repoRoot = resolve(__dirname, "..", "..");
const specsRoot = join(repoRoot, "agent-os", "specs");
const args = new Set(process.argv.slice(2));

const docs = loadSpecs(specsRoot);
const tags = collectTags(repoRoot, TAG_ROOTS);
const fileExists = (p: string) => existsSync(join(repoRoot, p));
const issues = lintAll(docs, tags, fileExists);

const rows = docs.flatMap((doc) => {
  const parsed = doc.spec ? parseFrontmatter(doc.spec) : null;
  if (!parsed) return [];
  const id = String(parsed.data.id ?? "");
  const status = String(parsed.data.status ?? "");
  const acs = parseAcceptanceCriteria(splitSections(parsed.body).get("Acceptance criteria") ?? "");
  return acs.map((ac) => ({
    spec: doc.dir,
    status,
    ac: ac.id,
    verify: ac.verify ? `${ac.verify.kind}${ac.verify.target ? " " + ac.verify.target : ""}` : "(none)",
    taggedIn: [...new Set(tags.filter((t) => t.specId === id && t.acId === ac.id).map((t) => t.file))],
  }));
});

if (args.has("--json")) {
  console.log(JSON.stringify({ specs: docs.map((d) => d.dir), issues, matrix: rows }, null, 2));
} else {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  console.log(`sdd:check — ${docs.length} spec(s), ${tags.length} @spec tag(s)`);
  for (const i of issues) console.log(`  ${i.level === "error" ? "✗" : "!"} [${i.spec}] ${i.message}`);
  if (!args.has("--quiet") && rows.length > 0) {
    console.log("\nTraceability (AC → proving test):");
    for (const r of rows) {
      const proof = r.taggedIn.length > 0 ? r.taggedIn.join(", ") : r.verify.startsWith("test") ? "— untagged" : "(log)";
      console.log(`  ${r.spec.padEnd(36)} ${r.status.padEnd(12)} ${r.ac.padEnd(6)} ${r.verify.padEnd(48)} ${proof}`);
    }
  }
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
}

process.exit(issues.some((i) => i.level === "error") ? 1 : 0);
