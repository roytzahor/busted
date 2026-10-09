import { describe, expect, it } from "vitest";
import {
  extractSpecTags,
  lintAll,
  lintSpec,
  parseAcceptanceCriteria,
  parseConstitutionCheck,
  parseFrontmatter,
  parseVerify,
  type SpecDoc,
  type SpecTag,
} from "@/scripts/sdd/spec-lint";

const ARTICLES = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

function specText(opts: {
  status?: string;
  risk?: string;
  extraBody?: string;
  acs?: string;
  reqs?: string;
} = {}): string {
  const { status = "draft", risk = "low", extraBody = "", reqs, acs } = opts;
  return `---
id: "0042"
title: "A behaviour"
status: ${status}
risk: ${risk}
owner: "ceo"
created: 2026-10-09
updated: 2026-10-09
standards: [trust/affiliate-neutrality]
superseded_by: ""
---

# 0042 — A behaviour

## Problem
Something is wrong.

## Goals
- fixed

## Non-goals
- everything else

## Requirements
${reqs ?? "- **REQ-1** — When x, the system shall y."}

## Acceptance criteria
${
  acs ??
  `### AC-1 — does y
Given a, when x, then y.
Covers: REQ-1
Verify: test __tests__/thing.test.ts`
}

## Open questions
- none
${extraBody}

## Decisions
- chose y — simplest

## Metrics
n/a — correctness only
`;
}

function planText(rows?: string[][]): string {
  const r = rows ?? ARTICLES.map((a) => [`${a}. Article`, "pass", ""]);
  return `---
spec: "0042"
updated: 2026-10-09
---
## Approach
Do it.
## Constitution check
| Article | Result | Notes |
|---|---|---|
${r.map((c) => `| ${c[0]} | ${c[1]} | ${c[2]} |`).join("\n")}
## Files touched
x
## Data and contracts
none
## Risks and kill switch
none
## Verification plan
AC-1 npm test
`;
}

const TASKS_DONE = `---
spec: "0042"
updated: 2026-10-09
---
- [x] T1 (AC-1) — test
- [x] T2 (AC-1) — code

## Verification log
- 2026-10-09 — npm test → 1 passed
`;

const exists = () => true;
const doc = (spec: string, plan: string | null = null, tasks: string | null = null): SpecDoc => ({
  dir: "0042-a-behaviour",
  spec,
  plan,
  tasks,
});
const errors = (d: SpecDoc, tags: SpecTag[] = [], fileExists = exists) =>
  lintSpec(d, tags, fileExists).filter((i) => i.level === "error").map((i) => i.message);

describe("sdd spec-lint — parsing", () => {
  it("parses flat frontmatter with quotes and inline lists", () => {
    const fm = parseFrontmatter(specText())!;
    expect(fm.data.id).toBe("0042");
    expect(fm.data.standards).toEqual(["trust/affiliate-neutrality"]);
    expect(fm.data.superseded_by).toBe("");
  });

  it("parses the four Verify kinds and rejects anything else", () => {
    expect(parseVerify("test __tests__/a.test.ts")).toEqual({ kind: "test", target: "__tests__/a.test.ts" });
    expect(parseVerify("eval `npm run eval -- --skip-ai`")).toEqual({ kind: "eval", target: "npm run eval -- --skip-ai" });
    expect(parseVerify("build")).toEqual({ kind: "build", target: "" });
    expect(parseVerify("manual open /scan/x on a phone")?.kind).toBe("manual");
    expect(parseVerify("test")).toBeNull();
    expect(parseVerify("looks fine")).toBeNull();
  });

  it("ignores template guidance inside HTML comments", () => {
    const acs = parseAcceptanceCriteria("<!-- ### AC-9 — fake\nVerify: test x -->\n### AC-1 — real\nVerify: build\n");
    expect(acs.map((a) => a.id)).toEqual(["AC-1"]);
  });

  it("reads constitution rows by roman numeral", () => {
    const rows = parseConstitutionCheck("| I. Precision | pass | |\n| IV. Measured | violation | eval blocked on creds |");
    expect(rows).toEqual([
      { article: "I", result: "pass", notes: "" },
      { article: "IV", result: "violation", notes: "eval blocked on creds" },
    ]);
  });

  it("extracts comment-position @spec tags, single and comma-listed, with their line", () => {
    // Built by concatenation so this file does not itself carry a tag for spec 0042.
    const AT = "@" + "spec";
    const src = `x\n// ${AT} 0042/AC-1\n/* ${AT} 0042/AC-2, AC-3 */\n * ${AT} 0042/AC-4\nexpect("no ${AT} 0042/AC-5 tag")`;
    const tags = extractSpecTags(src, "t.test.ts");
    expect(tags.map((t) => `${t.acId}@${t.line}`)).toEqual(["AC-1@2", "AC-2@3", "AC-3@3", "AC-4@4"]);
  });
});

describe("sdd spec-lint — lifecycle gates", () => {
  // @spec 0001/AC-1
  it("a well-formed draft passes", () => {
    expect(errors(doc(specText()))).toEqual([]);
  });

  // @spec 0001/AC-1
  it("rejects an acceptance criterion with no Verify line, or a vague one", () => {
    const missing = specText({ acs: "### AC-1 — y\nGiven a, then y.\nCovers: REQ-1" });
    expect(errors(doc(missing))).toContain('AC-1 has no "Verify:" line');
    const vague = specText({ acs: "### AC-1 — y\nCovers: REQ-1\nVerify: it works" });
    expect(errors(doc(vague)).some((m) => m.includes("must be: test"))).toBe(true);
  });

  // @spec 0001/AC-1
  it("rejects missing sections, bad status and a folder/id mismatch", () => {
    const noMetrics = specText().replace(/## Metrics[\s\S]*$/, "");
    expect(errors(doc(noMetrics))).toContain('spec.md is missing section "## Metrics"');
    expect(errors(doc(specText({ status: "done" })))[0]).toMatch(/status must be one of/);
    expect(errors({ ...doc(specText()), dir: "0043-a-behaviour" })[0]).toMatch(/does not match folder prefix/);
  });

  // @spec 0001/AC-2
  it("blocks leaving draft while a [NEEDS CLARIFICATION] marker remains — but allows talking about it in code", () => {
    const open = specText({ status: "approved", extraBody: "- [NEEDS CLARIFICATION] which market?" });
    expect(errors(doc(open, planText())).some((m) => m.includes("NEEDS CLARIFICATION"))).toBe(true);
    const talking = specText({ status: "approved", extraBody: "- the `[NEEDS CLARIFICATION]` marker blocks approval" });
    expect(errors(doc(talking, planText()))).toEqual([]);
    // A draft may carry open questions.
    expect(errors(doc(specText({ extraBody: "- [NEEDS CLARIFICATION] which market?" })))).toEqual([]);
  });

  // @spec 0001/AC-3
  it("requires a plan with every constitution article once approved, and a justification for any violation", () => {
    expect(errors(doc(specText({ status: "approved" })))).toContain("status is approved but plan.md is missing");
    const missingRow = planText(ARTICLES.filter((a) => a !== "VI").map((a) => [`${a}. x`, "pass", ""]));
    expect(errors(doc(specText({ status: "approved" }), missingRow))).toContain("constitution check has no row for article VI");
    const bareViolation = planText(ARTICLES.map((a) => [`${a}. x`, a === "III" ? "violation" : "pass", ""]));
    expect(errors(doc(specText({ status: "approved" }), bareViolation))).toContain(
      "constitution article III is a violation with no justification",
    );
    const justified = planText(ARTICLES.map((a) => [`${a}. x`, a === "III" ? "violation" : "pass", a === "III" ? "because" : ""]));
    expect(errors(doc(specText({ status: "approved" }), justified))).toEqual([]);
  });

  // @spec 0001/AC-3
  it("requires every requirement to be covered once approved", () => {
    const uncovered = specText({
      status: "approved",
      reqs: "- **REQ-1** — a\n- **REQ-2** — b",
    });
    expect(errors(doc(uncovered, planText()))).toContain("REQ-2 is not covered by any acceptance criterion");
    const ghost = specText({ acs: "### AC-1 — y\nCovers: REQ-7\nVerify: build" });
    expect(errors(doc(ghost))).toContain("AC-1 covers REQ-7, which is not a defined requirement");
  });

  // @spec 0001/AC-6
  it("refuses a high-risk plan that waves off measurement", () => {
    const ivNa = planText(ARTICLES.map((a) => [`${a}. x`, a === "IV" ? "n/a" : "pass", ""]));
    expect(errors(doc(specText({ status: "approved", risk: "high" }), ivNa))).toContain(
      "risk: high spec marks article IV (Measured) n/a — name the before/after measurement",
    );
    expect(errors(doc(specText({ status: "approved", risk: "low" }), ivNa))).toEqual([]);
  });

  // @spec 0001/AC-4
  it("will not call a spec verified until tasks are done, the log has an entry, and each test AC is tagged in its named file", () => {
    const verified = specText({ status: "verified" });
    const tag: SpecTag = { specId: "0042", acId: "AC-1", file: "__tests__/thing.test.ts", line: 3 };

    expect(errors(doc(verified, planText(), TASKS_DONE), [tag])).toEqual([]);
    expect(errors(doc(verified, planText(), TASKS_DONE), [])).toContain(
      "AC-1 has no @spec 0042/AC-1 tag in __tests__/thing.test.ts",
    );
    // A tag in some other file does not prove the AC that names this file.
    expect(errors(doc(verified, planText(), TASKS_DONE), [{ ...tag, file: "__tests__/other.test.ts" }])).toContain(
      "AC-1 has no @spec 0042/AC-1 tag in __tests__/thing.test.ts",
    );
    expect(errors(doc(verified, planText(), TASKS_DONE.replace("[x] T2", "[ ] T2")), [tag])).toContain(
      "status is verified but 1 of 2 tasks are unchecked",
    );
    expect(errors(doc(verified, planText(), TASKS_DONE.replace(/- 2026-10-09 — npm test.*\n/, "")), [tag])).toContain(
      "status is verified but the verification log has no dated entry",
    );
    expect(errors(doc(verified, planText(), TASKS_DONE), [tag], () => false)).toContain(
      "AC-1 verifies with __tests__/thing.test.ts, which does not exist",
    );
    expect(errors(doc(specText({ status: "in-progress" }), planText(), null))).toContain(
      "status is in-progress but tasks.md is missing",
    );
  });

  // @spec 0001/AC-5
  it("fails on tags that point at a spec or AC that does not exist, and on duplicate ids", () => {
    const d = doc(specText());
    const issues = lintAll(
      [d, { ...d, dir: "0042-dupe" }],
      [
        { specId: "0042", acId: "AC-9", file: "a.test.ts", line: 1 },
        { specId: "0999", acId: "AC-1", file: "b.test.ts", line: 2 },
      ],
      exists,
    ).map((i) => i.message);
    expect(issues).toContain("a.test.ts:1 tags AC-9, which spec 0042 does not define");
    expect(issues).toContain("b.test.ts:2 tags @spec 0999/AC-1 but spec 0999 does not exist");
    expect(issues.some((m) => m.includes("spec id 0042 is also used by"))).toBe(true);
  });

  it("superseded and abandoned specs must say where they went and why", () => {
    expect(errors(doc(specText({ status: "superseded" })))).toContain("status superseded requires superseded_by");
    const noReason = specText({ status: "abandoned" }).replace("- chose y — simplest", "");
    expect(errors(doc(noReason))).toContain("status abandoned requires a reason in ## Decisions");
  });
});
