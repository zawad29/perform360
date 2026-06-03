import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    // Pre-check before sending magic link — avoids sending emails that will fail
    const appUser = await prisma.user.findFirst({
      where: { email: parsed.data.email },
      select: { id: true, role: true, archivedAt: true },
    });

    if (!appUser) {
      return NextResponse.json(
        { success: false, error: "No account found with this email." },
        { status: 404 }
      );
    }

    if (appUser.archivedAt) {
      return NextResponse.json(
        { success: false, error: "This account has been deactivated." },
        { status: 403 }
      );
    }

    if (appUser.role !== "ADMIN" && appUser.role !== "HR") {
      return NextResponse.json(
        { success: false, error: "Access denied. Only administrators and HR can access the dashboard." },
        { status: 403 }
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
