"use client";

/**
 * Rich per-stage signals card grid for /monitoring.
 *
 * Surfaces the metadata the pipeline now collects (Sprint 8 stages 4–12 +
 * Sprint 9 Stage 14) but used to be hidden inside the raw debug JSON:
 *   - Scrape           — provider, store, store price
 *   - Vision           — preprocess cache, quality, OCR traces, materials
 *   - SmartMatch       — arm used, candidate count
 *   - Variant          — matched SKU id, axis remapping, hard mismatch
 *   - Routing          — locale (ship-to + currency), category vocab,
 *                        negative-keyword filter outcome
 *
 * Cards collapse gracefully when a signal is absent so a fresh-config scan
 * doesn't render five broken empty boxes.
 */

import { Badge } from "@/components/ui/badge";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import {
  Bot,
  Eye,
  Globe2,
  Layers,
  ScanSearch,
  Tag,
  Tags,
} from "lucide-react";

interface PipelineDetailProps {
  debug: AnalyzeDebugInfo;
}

function Card({
  title,
  icon: Icon,
  iconClass,
  children,
  empty,
}: {
  title: string;
  icon: typeof Bot;
  iconClass: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors",
        empty && "opacity-50",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1.5">
          <Icon className={cn("size-3.5", iconClass)} aria-hidden="true" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground/70">{label}</span>
      <span
        className={cn(
          "truncate text-right font-mono text-[11px]",
          tone === "ok" && "text-success",
          tone === "warn" && "text-amber-300",
          tone === "muted" && "text-muted-foreground/60",
          !tone && "text-foreground/90",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {values.slice(0, 6).map((v) => (
        <span
          key={v}
          className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80"
        >
          {v}
        </span>
      ))}
      {values.length > 6 ? (
        <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">
          +{values.length - 6}
        </span>
      ) : null}
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return <p className="text-muted-foreground/50 italic">{message}</p>;
}

export function PipelineDetail({ debug }: PipelineDetailProps) {
  const { scrape, supplier } = debug;
  const preprocess = supplier?.preprocess;
  const smartmatch = supplier?.smartmatch;
  const routing = supplier?.routing;
  const vision = supplier?.vision;

  const hasAnyVisionSignal =
    (vision?.ocrTraces?.length ?? 0) > 0 ||
    (vision?.materialTokens?.length ?? 0) > 0 ||
    (vision?.technicalSpecs?.length ?? 0) > 0 ||
    !!preprocess;

  const hasRoutingSignal =
    !!routing?.shipToCountry ||
    !!routing?.categoryVertical ||
    !!supplier?.categoryVocabMiss ||
    (routing?.negativeKeywordsFiltered ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Pipeline Signals
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* ── Scrape ─────────────────────────────────────────────── */}
        <Card title="Scrape" icon={ScanSearch} iconClass="text-blue-400">
          <Row label="provider" value={scrape.provider} />
          <Row label="store" value={scrape.storeName || "—"} />
          <Row
            label="store price"
            value={
              scrape.detectedStorePriceUsd != null
                ? `$${scrape.detectedStorePriceUsd.toFixed(2)}`
                : "—"
            }
          />
          <Row
            label="markdown"
            value={`${scrape.markdownLength.toLocaleString()} chars`}
            tone="muted"
          />
        </Card>

        {/* ── Vision / Preprocess ────────────────────────────────── */}
        <Card
          title="Vision"
          icon={Eye}
          iconClass="text-amber-300"
          empty={!hasAnyVisionSignal}
        >
          {preprocess?.attempted ? (
            <>
              <Row
                label="cache"
                value={preprocess.cacheHit ? "HIT" : "MISS"}
                tone={preprocess.cacheHit ? "ok" : "warn"}
              />
              {preprocess.durationMs !== undefined ? (
                <Row
                  label="duration"
                  value={`${preprocess.durationMs} ms`}
                  tone="muted"
                />
              ) : null}
              {preprocess.qualityScore !== undefined ? (
                <Row
                  label="quality"
                  value={`${preprocess.qualityScore.toFixed(1)} / 10`}
                  tone={
                    preprocess.qualityScore >= 7
                      ? "ok"
                      : preprocess.qualityScore >= 4
                        ? "warn"
                        : undefined
                  }
                />
              ) : null}
              {preprocess.lightPromptUsed ? (
                <Row label="retry" value="light prompt" tone="warn" />
              ) : null}
            </>
          ) : (
            <EmptyHint message="No preprocess this scan." />
          )}
          {vision?.ocrTraces?.length ? (
            <div className="pt-1.5">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                ocr traces
              </p>
              <Chips values={vision.ocrTraces} />
            </div>
          ) : null}
          {vision?.materialTokens?.length ? (
            <div className="pt-1.5">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                materials
              </p>
              <Chips values={vision.materialTokens} />
            </div>
          ) : null}
          {vision?.technicalSpecs?.length ? (
            <div className="pt-1.5">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                technical specs
              </p>
              <Chips values={vision.technicalSpecs} />
            </div>
          ) : null}
        </Card>

        {/* ── SmartMatch ─────────────────────────────────────────── */}
        <Card
          title="SmartMatch"
          icon={Bot}
          iconClass="text-success"
          empty={!smartmatch || smartmatch.arm === "skipped"}
        >
          {smartmatch ? (
            <>
              <Row
                label="arm"
                value={smartmatch.arm ?? "—"}
                tone={
                  smartmatch.arm === "base64"
                    ? "ok"
                    : smartmatch.arm === "skipped"
                      ? "muted"
                      : undefined
                }
              />
              <Row
                label="candidates"
                value={smartmatch.candidateCount ?? 0}
              />
            </>
          ) : (
            <EmptyHint message="SmartMatch not attempted." />
          )}
          {supplier ? (
            <div className="pt-1.5">
              <Row
                label="pool"
                value={`${supplier.candidateCount} total`}
                tone="muted"
              />
              <Row
                label="winner"
                value={`$${supplier.winnerPriceUsd.toFixed(2)}`}
              />
              <Row
                label="affiliate"
                value={supplier.affiliateLinkValidated ? "validated" : "fallback"}
                tone={supplier.affiliateLinkValidated ? "ok" : "warn"}
              />
            </div>
          ) : null}
        </Card>

        {/* ── Variant Match ──────────────────────────────────────── */}
        <Card
          title="Variant Match"
          icon={Tag}
          iconClass="text-emerald-400"
          empty={!debug.supplier}
        >
          {scrape.attributes.variant ? (
            <>
              {scrape.attributes.variant.color ? (
                <Row
                  label="source color"
                  value={scrape.attributes.variant.color}
                />
              ) : null}
              {scrape.attributes.variant.size ? (
                <Row
                  label="source size"
                  value={scrape.attributes.variant.size}
                />
              ) : null}
            </>
          ) : (
            <EmptyHint message="No source variant detected." />
          )}
        </Card>

        {/* ── Routing ───────────────────────────────────────────── */}
        <Card
          title="Routing"
          icon={Globe2}
          iconClass="text-primary"
          empty={!hasRoutingSignal}
        >
          {routing?.shipToCountry ? (
            <Row
              label="ship to"
              value={`${routing.shipToCountry} · ${routing.targetCurrency ?? "USD"}`}
            />
          ) : null}
          {routing?.categoryVertical ? (
            <Row
              label="category"
              value={routing.categoryVertical}
              tone="ok"
            />
          ) : supplier?.categoryVocabMiss ? (
            <Row
              label="category miss"
              value={supplier.categoryVocabMiss}
              tone="warn"
            />
          ) : null}
          {routing?.categoryIds ? (
            <Row
              label="ae ids"
              value={routing.categoryIds}
              tone="muted"
            />
          ) : null}
          {routing?.negativeKeywordsFiltered ? (
            <Row
              label="filtered (neg-kw)"
              value={`-${routing.negativeKeywordsFiltered}`}
              tone="warn"
            />
          ) : null}
          {!hasRoutingSignal ? (
            <EmptyHint message="No routing signals recorded." />
          ) : null}
        </Card>

        {/* ── Keywords (always present when supplier ran) ─────────── */}
        {supplier?.keywords ? (
          <Card title="Keywords" icon={Tags} iconClass="text-fuchsia-400">
            <div className="space-y-1">
              {supplier.keywords.split(" / ").slice(0, 6).map((k, i) => (
                <p
                  key={`${k}-${i}`}
                  className="truncate font-mono text-[11px] text-foreground/80"
                >
                  <span className="text-muted-foreground/50">›</span> {k}
                </p>
              ))}
            </div>
            <Row
              label="provider"
              value={supplier.provider === "aliexpress_api" ? "ae api" : "scrape"}
              tone="muted"
            />
          </Card>
        ) : null}
      </div>

      {/* Badge row — quick-scan summary */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {preprocess?.cacheHit ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            vision cache HIT
          </Badge>
        ) : null}
        {smartmatch?.arm === "base64" ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            smartmatch base64
          </Badge>
        ) : null}
        {routing?.categoryVertical ? (
          <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            category: {routing.categoryVertical}
          </Badge>
        ) : null}
        {supplier?.categoryVocabMiss ? (
          <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-300">
            category miss
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
