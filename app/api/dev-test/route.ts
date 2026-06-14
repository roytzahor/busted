import { NextRequest, NextResponse } from "next/server";
import {
  buildServiceSnapshots,
  isDevMonitorAllowed,
  runServiceProbe,
} from "@/lib/dev-monitor/service-probes";
import type {
  DevMonitorServiceId,
  DevMonitorSnapshotResponse,
  DevMonitorTestRequest,
  DevMonitorTestResult,
} from "@/lib/dev-monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SERVICES: DevMonitorServiceId[] = [
  "database",
  "scraper",
  "ai",
  "affiliate",
];

function devOnlyResponse(): NextResponse<{ allowed: false; error: string }> {
  return NextResponse.json(
    { allowed: false, error: "Dev monitor is disabled in production." },
    { status: 404 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (!isDevMonitorAllowed()) {
    return devOnlyResponse();
  }

  return NextResponse.json({
    allowed: true,
    environment: process.env.NODE_ENV ?? "development",
    services: buildServiceSnapshots(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isDevMonitorAllowed()) {
    return devOnlyResponse();
  }

  let body: DevMonitorTestRequest;
  try {
    body = (await request.json()) as DevMonitorTestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!VALID_SERVICES.includes(body.service)) {
    return NextResponse.json(
      { error: `Unknown service "${String(body.service)}".` },
      { status: 400 },
    );
  }

  const result = await runServiceProbe(body.service);
  return NextResponse.json(result);
}
