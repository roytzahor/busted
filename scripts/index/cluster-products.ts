/**
 * Canonical product clustering — ROADMAP Phase 2 item 2.
 *
 *   npm run index:cluster                          # cluster + persist
 *   npm run index:cluster -- --dry-run             # print proposed clusters only
 *   npm run index:cluster -- --calibrate           # distance stats, no writes
 *   npm run index:cluster -- --reset               # clear assignments, recluster
 *   npm run index:cluster -- --max-image-checks 12 # borderline image-AI budget
 *
 * Groups ProductEmbedding rows across networks into CanonicalProduct clusters:
 *
 *   1. SEEDS — retail↔supplier rows sharing a scanId are an already
 *      confidence-gated matched pair; they always cluster together.
 *   2. DISTANCE — an unassigned row joins its nearest cluster (single
 *      linkage) when cosine distance ≤ MERGE_MAX.
 *   3. IMAGE BAND — distances in (MERGE_MAX, IMAGE_BAND_MAX] merge only when
 *      Gemini Vision confirms same product + same function (budget-capped).
 *
 * Precision-first: an uncertain merge is left unclustered, never forced.
 * Singleton clusters are not persisted — canonicalId stays null until a row
 * actually has company. Re-runs are incremental: existing assignments are
 * kept as pre-seeded clusters (use --reset to recluster from scratch).
 *
 * `--calibrate` prints the distance distribution of known matched pairs vs
 * random cross pairs so MERGE_MAX / IMAGE_BAND_MAX are tuned with data, not
 * vibes (same rule as the Tier-0 gate).
 */

import { prisma } from "@/lib/prisma";
import { embeddingModel } from "@/lib/ai/models";
import { compareProductImagesWithAI } from "@/lib/ai/image-match";

/**
 * Auto-merge bar. Cosine distance (0 identical, 2 opposite).
 *
 * Calibrated 2026-07-13 on 46 rows (`--calibrate`): matched pairs
 * n=18 min=0.162 p10=0.178 median=0.321 p90=0.449 max=0.453; random pairs
 * n=500 min=0.320 p10=0.480. 0.22 sits ~0.1 below the observed random
 * minimum while catching the tight quartile of matched pairs. Re-run
 * --calibrate and revisit as the corpus grows.
 */
const MERGE_MAX = 0.22;
/**
 * Upper bound of the image-confirmation band. Matched pairs top out at
 * ~0.45; random pairs that fall in (0.22, 0.45] are vetoed by the image
 * check, so overlapping the random tail here is safe.
 */
const IMAGE_BAND_MAX = 0.45;
/** Image-AI confirmation must clear this (mirrors IMAGE_MATCH_MIN semantics —
 * the prompt only awards ≥0.7 when sameProduct AND sameFunction are true). */
const IMAGE_CONFIRM_MIN = 0.7;

interface Row {
  id: string;
  scanId: string | null;
  network: string;
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  canonicalId: string | null;
  embedding: number[];
}

interface Cluster {
  /** Existing CanonicalProduct.id when loaded from a prior run. */
  persistedId: string | null;
  members: { row: Row; distance: number; via: "seed" | "distance" | "image" }[];
}

function argNum(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  const parsed = idx !== -1 ? Number(process.argv[idx + 1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 2;
  return 1 - dot / denom;
}

async function loadRows(): Promise<Row[]> {
  const raw = await prisma.$queryRaw<
    (Omit<Row, "embedding"> & { embeddingText: string })[]
  >`
    SELECT "id", "scanId", "network", "title", "sourceUrl", "imageUrl",
           "canonicalId", "embedding"::text AS "embeddingText"
    FROM "ProductEmbedding"
    WHERE "embedding" IS NOT NULL AND "model" = ${embeddingModel()}
    ORDER BY "createdAt" ASC, "id" ASC
  `;
  return raw.map(({ embeddingText, ...rest }) => ({
    ...rest,
    embedding: JSON.parse(embeddingText) as number[],
  }));
}

/** Min distance from row to any cluster member (single linkage). */
function nearestInCluster(row: Row, cluster: Cluster): { distance: number; member: Row } {
  let best = { distance: Infinity, member: cluster.members[0].row };
  for (const m of cluster.members) {
    const d = cosineDistance(row.embedding, m.row.embedding);
    if (d < best.distance) best = { distance: d, member: m.row };
  }
  return best;
}

/** One-vs-one image confirmation. True only on a positive same-function match. */
async function imageConfirm(a: Row, b: Row): Promise<boolean> {
  if (!a.imageUrl || !b.imageUrl) return false;
  const result = await compareProductImagesWithAI({
    sourceTitle: a.title,
    sourceImageUrl: a.imageUrl,
    candidates: [{ id: b.id, title: b.title, imageUrl: b.imageUrl }],
  });
  if (!result || result.bestCandidateId !== b.id) return false;
  const score = result.scores.find((s) => s.candidateId === b.id);
  return result.bestScore >= IMAGE_CONFIRM_MIN && score?.sameFunction === true;
}

function calibrate(rows: Row[]): void {
  const byScan = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.scanId) continue;
    byScan.set(r.scanId, [...(byScan.get(r.scanId) ?? []), r]);
  }
  const matched: number[] = [];
  for (const group of byScan.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].network !== group[j].network) {
          matched.push(cosineDistance(group[i].embedding, group[j].embedding));
        }
      }
    }
  }
  const cross: number[] = [];
  for (let i = 0; i < rows.length && cross.length < 500; i++) {
    for (let j = i + 1; j < rows.length && cross.length < 500; j++) {
      if (rows[i].scanId !== rows[j].scanId || !rows[i].scanId) {
        cross.push(cosineDistance(rows[i].embedding, rows[j].embedding));
      }
    }
  }
  const stats = (xs: number[]): string => {
    if (xs.length === 0) return "n=0";
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return `n=${s.length} min=${s[0].toFixed(3)} p10=${q(0.1).toFixed(3)} median=${q(0.5).toFixed(3)} p90=${q(0.9).toFixed(3)} max=${s[s.length - 1].toFixed(3)}`;
  };
  console.log("Matched pairs (same scanId, cross-network):");
  console.log(`  ${stats(matched)}`);
  console.log("Random pairs (different products):");
  console.log(`  ${stats(cross)}`);
  console.log(`\nCurrent thresholds: MERGE_MAX=${MERGE_MAX} IMAGE_BAND_MAX=${IMAGE_BAND_MAX}`);
  console.log("Pick MERGE_MAX below the random-pair p10 and at/above the matched-pair p90 if the distributions separate.");
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const doCalibrate = process.argv.includes("--calibrate");
  const reset = process.argv.includes("--reset");
  let imageBudget = argNum("--max-image-checks", 12);

  if (reset && !dryRun && !doCalibrate) {
    await prisma.productEmbedding.updateMany({
      data: { canonicalId: null, canonicalDistance: null },
    });
    await prisma.canonicalProduct.deleteMany({});
    console.log("Cleared existing canonical assignments.\n");
  }

  const rows = await loadRows();
  console.log(`Loaded ${rows.length} embedding row(s) [model=${embeddingModel()}].`);
  if (rows.length > 2000) {
    console.error("Corpus too large for the O(n²) pass — switch this script to ANN batching first.");
    process.exit(1);
  }

  if (doCalibrate) {
    calibrate(rows);
    await prisma.$disconnect();
    return;
  }

  const clusters: Cluster[] = [];
  const assigned = new Set<string>();

  // Pre-seed from prior runs (incremental re-cluster).
  const byExisting = new Map<string, Row[]>();
  for (const r of rows) {
    if (!reset && r.canonicalId) {
      byExisting.set(r.canonicalId, [...(byExisting.get(r.canonicalId) ?? []), r]);
    }
  }
  for (const [persistedId, members] of byExisting) {
    clusters.push({
      persistedId,
      members: members.map((row) => ({ row, distance: 0, via: "seed" })),
    });
    members.forEach((m) => assigned.add(m.id));
  }

  // Phase 1 — seed clusters from matched retail↔supplier pairs (same scanId).
  const byScan = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.scanId && !assigned.has(r.id)) {
      byScan.set(r.scanId, [...(byScan.get(r.scanId) ?? []), r]);
    }
  }
  for (const group of byScan.values()) {
    const networks = new Set(group.map((g) => g.network));
    if (group.length < 2 || networks.size < 2) continue;
    clusters.push({
      persistedId: null,
      members: group.map((row) => ({ row, distance: 0, via: "seed" })),
    });
    group.forEach((g) => assigned.add(g.id));
  }
  console.log(`Seeded ${clusters.length} cluster(s) (${assigned.size} rows assigned).`);

  // Phase 2 — greedy single-linkage merge for the rest.
  let distanceMerges = 0;
  let imageMerges = 0;
  let imageRejects = 0;
  let imageWouldCheck = 0;
  const unassigned = rows.filter((r) => !assigned.has(r.id));
  for (const row of unassigned) {
    let best: { cluster: Cluster; distance: number; member: Row } | null = null;
    for (const cluster of clusters) {
      const near = nearestInCluster(row, cluster);
      if (!best || near.distance < best.distance) {
        best = { cluster, distance: near.distance, member: near.member };
      }
    }

    if (best && best.distance <= MERGE_MAX) {
      best.cluster.members.push({ row, distance: best.distance, via: "distance" });
      assigned.add(row.id);
      distanceMerges += 1;
      continue;
    }

    if (best && best.distance <= IMAGE_BAND_MAX && imageBudget > 0) {
      if (dryRun) {
        // Dry runs must stay $0 — report the pending check, don't spend it.
        imageWouldCheck += 1;
      } else {
        imageBudget -= 1;
        if (await imageConfirm(row, best.member)) {
          best.cluster.members.push({ row, distance: best.distance, via: "image" });
          assigned.add(row.id);
          imageMerges += 1;
          continue;
        }
        imageRejects += 1;
      }
    }

    // No confident home — start a singleton (may attract later rows; not
    // persisted unless it grows to ≥2 members).
    clusters.push({ persistedId: null, members: [{ row, distance: 0, via: "seed" }] });
    assigned.add(row.id);
  }

  const real = clusters.filter((c) => c.members.length >= 2);
  console.log(
    `\nMerges: ${distanceMerges} by distance, ${imageMerges} image-confirmed, ${imageRejects} image-rejected${dryRun ? `, ${imageWouldCheck} would image-check` : ""}.`,
  );
  console.log(`Clusters with ≥2 members: ${real.length} (of ${clusters.length} total incl. singletons).`);

  for (const c of real) {
    const label = c.members
      .map((m) => `${m.row.network}:${m.row.title.slice(0, 40)}${m.via === "seed" ? "" : ` (${m.via} ${m.distance.toFixed(3)})`}`)
      .join("\n    ");
    console.log(`\n  • ${c.members.length} members${c.persistedId ? " [existing]" : ""}\n    ${label}`);
  }

  if (dryRun) {
    console.log("\nDry run — nothing persisted.");
    await prisma.$disconnect();
    return;
  }

  // Persist: CanonicalProduct rows + member assignments.
  for (const c of real) {
    const retail = c.members.find((m) => m.row.network === "retail");
    const rep = retail ?? c.members[0];
    const networks = [...new Set(c.members.map((m) => m.row.network))].sort();
    const data = {
      title: rep.row.title,
      imageUrl: rep.row.imageUrl,
      memberCount: c.members.length,
      networks,
    };
    const canonical = c.persistedId
      ? await prisma.canonicalProduct.update({ where: { id: c.persistedId }, data })
      : await prisma.canonicalProduct.create({ data });
    for (const m of c.members) {
      await prisma.productEmbedding.update({
        where: { id: m.row.id },
        data: {
          canonicalId: canonical.id,
          canonicalDistance: m.via === "seed" ? 0 : m.distance,
        },
      });
    }
  }
  console.log(`\nPersisted ${real.length} canonical cluster(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[cluster-products] fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
