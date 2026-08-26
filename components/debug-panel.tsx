"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AnalyzeDebugInfo } from "@/lib/types/debug";
import { cn } from "@/lib/utils";
import {
  Bot,
  ChevronDown,
  Code2,
  Globe,
  PackageSearch,
  ScanSearch,
  Workflow,
} from "lucide-react";
import { useState, type ComponentType } from "react";

interface DebugPanelProps {
  debug: AnalyzeDebugInfo;
  className?: string;
}

/**
 * Show the price as the page printed it alongside the USD figure the pipeline
 * actually compares against. Seeing "238 ₪ → $64.32" makes it obvious at a
 * glance whether a suspicious markup came from bad extraction or a stale FX
 * rate — with only the USD value, the two are indistinguishable.
 */
function formatDetectedPrice(scrape: AnalyzeDebugInfo["scrape"]): string {
  const { detectedStorePriceUsd, detectedStorePriceNative, detectedStorePriceCurrency } = scrape;
  if (detectedStorePriceUsd === null) return "Not detected";

  const usd = `$${detectedStorePriceUsd.toFixed(2)}`;
  if (
    typeof detectedStorePriceNative !== "number" ||
    !detectedStorePriceCurrency ||
    detectedStorePriceCurrency === "USD"
  ) {
    return usd;
  }
  return `${detectedStorePriceNative} ${detectedStorePriceCurrency} → ${usd}`;
}

export function DebugPanel({ debug, className }: DebugPanelProps) {
  const [openSection, setOpenSection] = useState<string>("scrape");

  const toggle = (section: string) => {
    setOpenSection((current) => (current === section ? "" : section));
  };

  const prediction = debug.ai.prediction;

  return (
    <section
      aria-label="Pipeline debug inspector"
      className={cn("w-full space-y-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 font-mono text-xs">
          <Code2 className="size-3" aria-hidden="true" />
          Debug Mode
        </Badge>
        <Badge variant="secondary">
          Cache: {debug.pipeline.cacheStatus}
        </Badge>
        <Badge variant="secondary">
          Scraper: {debug.scrape.provider}
        </Badge>
        {prediction ? (
          <Badge
            className={cn(
              prediction.isLikelyDropship
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            AI: {prediction.isLikelyDropship ? "Likely dropship" : "Unclear"} ·{" "}
            {Math.round(prediction.confidence * 100)}%
          </Badge>
        ) : null}
        {debug.supplier ? (
          <Badge variant="secondary">
            Supplier: {debug.supplier.provider}
          </Badge>
        ) : null}
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="size-4" aria-hidden="true" />
            Behind the Scenes
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Raw scrape output and AI dropship prediction for this URL.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 p-0 pb-2">
          <DebugSection
            id="pipeline"
            title="Pipeline steps"
            icon={Workflow}
            isOpen={openSection === "pipeline"}
            onToggle={() => toggle("pipeline")}
          >
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {debug.pipeline.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </DebugSection>

          <DebugSection
            id="scrape"
            title="Scrape output"
            icon={ScanSearch}
            isOpen={openSection === "scrape"}
            onToggle={() => toggle("scrape")}
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <DebugField label="Normalized URL" value={debug.scrape.normalizedUrl} mono />
              <DebugField label="Store" value={debug.scrape.storeName} />
              <DebugField label="Provider" value={debug.scrape.provider} />
              <DebugField
                label="Detected price"
                value={formatDetectedPrice(debug.scrape)}
              />
              <DebugField label="Title (extracted)" value={debug.scrape.attributes.title} />
              <DebugField
                label="Image URL"
                value={debug.scrape.attributes.mainImageUrl ?? "None"}
                mono
              />
            </dl>
            <Separator className="my-3" />
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Description excerpt
              </p>
              <p className="text-sm leading-relaxed">
                {debug.scrape.attributes.description}
              </p>
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Stripped markdown ({debug.scrape.markdownLength.toLocaleString()} chars)
              </p>
              <pre className="bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {debug.scrape.markdownPreview}
                {debug.scrape.markdownLength > debug.scrape.markdownPreview.length
                  ? "\n\n[truncated for debug view]"
                  : ""}
              </pre>
            </div>
          </DebugSection>

          <DebugSection
            id="ai"
            title="AI dropship prediction"
            icon={Bot}
            isOpen={openSection === "ai"}
            onToggle={() => toggle("ai")}
          >
            <dl className="mb-3 grid gap-3 text-sm sm:grid-cols-2">
              <DebugField label="Provider" value={`${debug.ai.provider} / ${debug.ai.model}`} />
              {prediction ? (
                <>
                  <DebugField
                    label="Category"
                    value={prediction.productCategory}
                  />
                  <DebugField
                    label="Verdict"
                    value={
                      prediction.isLikelyDropship
                        ? "Likely dropship"
                        : "Unclear / not dropship"
                    }
                  />
                  <DebugField
                    label="Confidence"
                    value={`${Math.round(prediction.confidence * 100)}%`}
                  />
                  <DebugField
                    label="Est. store price"
                    value={
                      prediction.estimatedStorePriceUsd !== null
                        ? `$${prediction.estimatedStorePriceUsd.toFixed(2)}`
                        : "—"
                    }
                  />
                  <DebugField
                    label="Est. supplier price"
                    value={
                      prediction.estimatedSupplierPriceUsd !== null
                        ? `$${prediction.estimatedSupplierPriceUsd.toFixed(2)}`
                        : "—"
                    }
                  />
                </>
              ) : null}
            </dl>

            {prediction ? (
              <>
                <p className="mb-2 text-sm leading-relaxed">{prediction.reasoning}</p>
                {prediction.redFlags.length > 0 ? (
                  <ul className="mb-3 flex flex-wrap gap-1.5">
                    {prediction.redFlags.map((flag) => (
                      <li key={flag}>
                        <Badge variant="outline" className="text-xs">
                          {flag}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-destructive text-sm">
                {debug.ai.error ?? "No AI prediction available."}
              </p>
            )}

            {debug.ai.rawResponse ? (
              <>
                <Separator className="my-3" />
                <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                  Raw AI response
                </p>
                <pre className="bg-muted max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
                  {debug.ai.rawResponse}
                </pre>
              </>
            ) : null}
          </DebugSection>

          {debug.supplier ? (
            <DebugSection
              id="supplier"
              title="AliExpress supplier match"
              icon={PackageSearch}
              isOpen={openSection === "supplier"}
              onToggle={() => toggle("supplier")}
            >
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <DebugField label="Search keywords" value={debug.supplier.keywords} />
                <DebugField label="Search provider" value={debug.supplier.provider} />
                <DebugField
                  label="Candidates"
                  value={String(debug.supplier.candidateCount)}
                />
                <DebugField
                  label="Winner product ID"
                  value={debug.supplier.winnerProductId}
                  mono
                />
                <DebugField label="Winner title" value={debug.supplier.winnerTitle} />
                <DebugField
                  label="Winner price"
                  value={`$${debug.supplier.winnerPriceUsd.toFixed(2)}`}
                />
                <DebugField
                  label="Affiliate provider"
                  value={debug.supplier.affiliateProvider}
                />
                <DebugField
                  label="Affiliate validated"
                  value={debug.supplier.affiliateLinkValidated ? "Yes (HTTP 200)" : "No"}
                />
              </dl>
            </DebugSection>
          ) : null}

          <DebugSection
            id="metadata"
            title="Page metadata"
            icon={Globe}
            isOpen={openSection === "metadata"}
            onToggle={() => toggle("metadata")}
          >
            <dl className="grid gap-3 text-sm">
              <DebugField label="OG title" value={debug.scrape.metadata.title ?? "—"} />
              <DebugField
                label="OG description"
                value={debug.scrape.metadata.description ?? "—"}
              />
              <DebugField
                label="OG image"
                value={debug.scrape.metadata.ogImage ?? "—"}
                mono
              />
            </dl>
          </DebugSection>
        </CardContent>
      </Card>
    </section>
  );
}

function DebugSection({
  id,
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4" aria-hidden="true" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen ? (
        <div id={`${id}-panel`} className="px-4 pb-4" role="region" aria-labelledby={`${id}-trigger`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DebugField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("break-all font-medium", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
