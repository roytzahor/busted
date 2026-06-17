import { NextRequest, NextResponse } from "next/server";
import {
  buildServiceSnapshots,
  runServiceProbe,
} from "@/lib/dev-monitor/service-probes";
import { checkRateLimit, resolveClientIp } from "@/lib/api/rate-limit";
import type { DevMonitorServiceId } from "@/lib/dev-monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: DevMonitorServiceId[] = [
  "database",
  "scraper",
  "ai",
  "affiliate",
];

/**
 * Verify the request carries the monitoring secret.
 * Set MONITORING_SECRET in Vercel env to a random string (openssl rand -hex 32).
 * If the env var is not set, the endpoint is disabled in production.
 */
function isMonitoringAuthorized(request: NextRequest): boolean {
  const secret = process.env.MONITORING_SECRET?.trim();

  // No secret configured → allow only in development
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const provided = request.headers.get("x-monitoring-secret");
  return provided === secret;
}

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized. Set X-Monitoring-Secret header." },
    { status: 401 },
  );
}

// Returns service configuration snapshot (no secrets exposed).
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isMonitoringAuthorized(request)) return unauthorizedResponse();

  const snapshots = buildServiceSnapshots();

  const safe: Record<string, { label: string; configured: boolean }> = {};
  for (const [id, snap] of Object.entries(snapshots)) {
    safe[id] = { label: snap.label, configured: snap.configured };
  }

  return NextResponse.json({ services: safe });
}

// Runs a single service probe and returns latency + status.
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isMonitoringAuthorized(request)) return unauthorizedResponse();

  // Secondary defense: rate limit probe requests (30/min — generous for the dashboard).
  const rl = checkRateLimit(`monitor:${resolveClientIp(request)}`, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many probe requests." }, { status: 429 });
  }

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

  // Never expose raw error stack or internal db URLs
  return NextResponse.json({
    service: result.service,
    status: result.status,
    latencyMs: result.latencyMs,
    message: result.message,
  });
}
