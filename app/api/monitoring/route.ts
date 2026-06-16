import { NextRequest, NextResponse } from "next/server";
import {
  buildServiceSnapshots,
  runServiceProbe,
} from "@/lib/dev-monitor/service-probes";
import type { DevMonitorServiceId } from "@/lib/dev-monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: DevMonitorServiceId[] = [
  "database",
  "scraper",
  "ai",
  "affiliate",
];

// Public endpoint — returns service configuration snapshot (no secrets exposed).
export async function GET(): Promise<NextResponse> {
  const snapshots = buildServiceSnapshots();

  // Sanitize: strip any value that looks like a key or secret
  const safe: Record<string, { label: string; configured: boolean }> = {};
  for (const [id, snap] of Object.entries(snapshots)) {
    safe[id] = { label: snap.label, configured: snap.configured };
  }

  return NextResponse.json({ services: safe });
}

// Public endpoint — runs a single service probe and returns latency + status.
// Intentionally exposes latency and message but not internal credentials.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { service?: string };
  try {
    body = (await request.json()) as { service?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const serviceId = body.service as DevMonitorServiceId | undefined;
  if (!serviceId || !VALID_SERVICES.includes(serviceId)) {
    return NextResponse.json(
      { error: `Unknown service "${String(serviceId)}". Valid: ${VALID_SERVICES.join(", ")}.` },
      { status: 400 },
    );
  }

  const result = await runServiceProbe(serviceId);

  // Sanitize: never expose raw error stack or internal db URLs
  return NextResponse.json({
    service: result.service,
    status: result.status,
    latencyMs: result.latencyMs,
    message: result.message,
  });
}
