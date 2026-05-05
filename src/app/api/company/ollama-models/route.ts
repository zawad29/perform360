import { NextRequest, NextResponse } from "next/server";
import { requireRole, isAuthError } from "@/lib/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req);
  if (rl) return rl;

  const authResult = await requireRole("ADMIN");
  if (isAuthError(authResult)) return authResult;

  try {
    const { apiUrl, apiKey } = (await req.json()) as {
      apiUrl: string;
      apiKey?: string;
    };

    if (!apiUrl) {
      return NextResponse.json(
        { success: false, error: "API URL is required" },
        { status: 400 }
      );
    }

    const baseUrl = apiUrl.replace(/\/$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Ollama responded with ${res.status}`);
    }

    const data = await res.json();
    const models: { name: string; size: number; parameterSize?: string }[] =
      (data.models ?? []).map(
        (m: { name: string; size: number; details?: { parameter_size?: string } }) => ({
          name: m.name,
          size: m.size,
          parameterSize: m.details?.parameter_size,
        })
      );

    return NextResponse.json({ success: true, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to connect to Ollama: ${message}` },
      { status: 502 }
    );
  }
}
