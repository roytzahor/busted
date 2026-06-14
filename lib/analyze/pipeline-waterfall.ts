import type { PipelineWaterfallEntry } from "@/lib/types/debug";

export class PipelineWaterfall {
  private readonly startMs = performance.now();
  readonly entries: PipelineWaterfallEntry[] = [];

  mark(
    stage: PipelineWaterfallEntry["stage"],
    message: string,
    status: PipelineWaterfallEntry["status"] = "complete",
  ): void {
    this.entries.push({
      atMs: Math.round(performance.now() - this.startMs),
      stage,
      message,
      status,
    });
  }
}
