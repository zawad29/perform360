import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitResponse,
  getClientIp,
  AUTH_RATE_LIMIT,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`auth:signin:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const body = await request.json();

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    try {
      await signIn("nodemailer", {
        email: parsed.data.email,
        redirect: false,
        redirectTo: "/overview",
      });
      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      // NextAuth v5 server-side signIn throws a Next.js redirect on success.
      // The redirect error carries a `digest` property, not `message`.
      if (
        error instanceof Error &&
        "digest" in error &&
        String((error as Record<string, unknown>).digest).startsWith("NEXT_REDIRECT")
      ) {
        return NextResponse.json({ success: true });
      }
      // AccessDenied = user not found (from signIn callback)
      if (
        error instanceof Error &&
        (error.message.includes("AccessDenied") || error.name === "AccessDenied")
      ) {
        return NextResponse.json(
          { success: false, error: "No account found with this email." },
          { status: 401 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Login verification error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
