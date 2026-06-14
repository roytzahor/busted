import { Prisma } from "@prisma/client";

export function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV === "development" && error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function resolveHttpStatus(error: unknown): number {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return 503;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return 503;
    }
    return 500;
  }

  return 500;
}

export function resolveErrorCode(error: unknown): string {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "DATABASE_CONNECTION_ERROR";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return "DATABASE_SCHEMA_ERROR";
    }
    return "DATABASE_ERROR";
  }

  return "INTERNAL_ERROR";
}

export function logPipelineError(context: string, error: unknown): void {
  console.error(`[analyze] ${context}`, error);
}
