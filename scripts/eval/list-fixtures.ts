import { loadAllFixtures } from "@/lib/eval/fixture-store";

const fixtures = loadAllFixtures();
if (fixtures.length === 0) {
  console.log("No fixtures found in tests/fixtures/products/");
  process.exit(0);
}

const byCategory = new Map<string, typeof fixtures>();
for (const f of fixtures) {
  const list = byCategory.get(f.truth.category) ?? [];
  list.push(f);
  byCategory.set(f.truth.category, list);
}

console.log(`\n${fixtures.length} fixture(s):\n`);
for (const [category, list] of byCategory) {
  console.log(`[${category}] — ${list.length}`);
  for (const f of list) {
    const hasAi = f.aiResponse ? "ai✓" : "ai—";
    const hasAli = f.aliexpress ? `ali✓(${f.aliexpress.candidates.length})` : "ali—";
    console.log(`  • ${f.id.padEnd(40)} ${hasAi} ${hasAli}`);
  }
  console.log();
}
