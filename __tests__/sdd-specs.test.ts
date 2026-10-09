import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TAG_ROOTS, collectTags, lintAll, loadSpecs } from "@/scripts/sdd/spec-lint";

/**
 * The repo-wide SDD gate. Runs the same rules as `npm run sdd:check` over the
 * real agent-os/specs/ tree, so `npm test` (and CI) fails when a spec claims a
 * status its evidence does not support, or a test tags an AC that does not
 * exist. See agent-os/standards/sdd/workflow.md.
 */
describe("agent-os/specs", () => {
  // @spec 0001/AC-7
  it("every spec satisfies the lifecycle gate for its status", () => {
    const repoRoot = resolve(__dirname, "..");
    const docs = loadSpecs(join(repoRoot, "agent-os", "specs"));
    const tags = collectTags(repoRoot, TAG_ROOTS);
    const errors = lintAll(docs, tags, (p) => existsSync(join(repoRoot, p)))
      .filter((i) => i.level === "error")
      .map((i) => `[${i.spec}] ${i.message}`);
    expect(errors).toEqual([]);
  });
});
