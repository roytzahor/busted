export type DevMonitorServiceId = "database" | "scraper" | "ai" | "affiliate";

export type DevMonitorStatus =
  | "idle"
  | "loading"
  | "connected"
  | "error"
  | "uninitialized";

export interface DevMonitorServiceSnapshot {
  configured: boolean;
  label: string;
  details: Record<string, string | boolean | number>;
}

export interface DevMonitorSnapshotResponse {
  allowed: boolean;
  environment: string;
  services: Record<DevMonitorServiceId, DevMonitorServiceSnapshot>;
}

export interface DevMonitorTestResult {
  service: DevMonitorServiceId;
  status: Exclude<DevMonitorStatus, "idle" | "loading">;
  latencyMs: number;
  message: string;
  details?: Record<string, string | number | boolean | null>;
  error?: string;
}

export interface DevMonitorTestRequest {
  service: DevMonitorServiceId;
}
