import { NextResponse } from "next/server";
import { z } from "zod";

export interface ErrorBody {
  success: false;
  error: string;
  code?: string;
  [key: string]: unknown;
}

export function errorResponse(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json<ErrorBody>(
    { success: false, error, code, ...(extra ?? {}) },
    { status }
  );
}

export function zodErrorResponse(error: z.ZodError): NextResponse {
  return errorResponse("Validation failed", "VALIDATION_ERROR", 400, {
    details: error.issues,
  });
}

export function internalErrorResponse(error?: unknown): NextResponse {
  if (error) console.error("Internal error:", error);
  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}
