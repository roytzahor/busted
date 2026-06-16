import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  FixtureAiResponse,
  FixtureAliExpress,
  FixtureRecord,
  FixtureScrape,
  FixtureTruth,
} from "@/tests/eval/fixture-types";

const FIXTURES_ROOT = join(process.cwd(), "tests/fixtures/products");

const TRUTH_FILE = "truth.json";
const SCRAPE_FILE = "scrape.json";
const AI_FILE = "ai-response.json";
const ALIEXPRESS_FILE = "aliexpress.json";

function fixtureDir(id: string): string {
  return join(FIXTURES_ROOT, id);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function listFixtureIds(): string[] {
  if (!existsSync(FIXTURES_ROOT)) return [];
  return readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadFixture(id: string): FixtureRecord | null {
  const dir = fixtureDir(id);
  const truth = readJson<FixtureTruth>(join(dir, TRUTH_FILE));
  const scrape = readJson<FixtureScrape>(join(dir, SCRAPE_FILE));

  if (!truth || !scrape) return null;

  return {
    id,
    truth,
    scrape,
    aiResponse: readJson<FixtureAiResponse>(join(dir, AI_FILE)) ?? undefined,
    aliexpress: readJson<FixtureAliExpress>(join(dir, ALIEXPRESS_FILE)) ?? undefined,
  };
}

export function saveFixture(id: string, record: Omit<FixtureRecord, "id">): void {
  const dir = fixtureDir(id);
  writeJson(join(dir, TRUTH_FILE), record.truth);
  writeJson(join(dir, SCRAPE_FILE), record.scrape);
  if (record.aiResponse) writeJson(join(dir, AI_FILE), record.aiResponse);
  if (record.aliexpress) writeJson(join(dir, ALIEXPRESS_FILE), record.aliexpress);
}

export function loadAllFixtures(): FixtureRecord[] {
  return listFixtureIds()
    .map((id) => loadFixture(id))
    .filter((f): f is FixtureRecord => f !== null);
}

export function isReplayMode(): boolean {
  return process.env.EVAL_REPLAY === "1";
}
