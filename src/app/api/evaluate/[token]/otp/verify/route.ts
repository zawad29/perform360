import { NextRequest, NextResponse } from "next/server";
import cuid from "cuid";
import { prisma } from "@/lib/prisma";
import { verifyOTP, isOTPExpired, isInCooldown, getCooldownEnd, getSessionExpiry } from "@/lib/otp";
import { OTP_CONFIG } from "@/lib/constants";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; cooldown?: number };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const body = await request.json();
    const { otp } = body as { otp: string };

    if (!otp || typeof otp !== "string" || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid OTP format" },
        { status: 400 }
      );
    }

    // Find assignment by token
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { token },
      select: { id: true },
    });

    if (!assignment) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid evaluation link", code: "INVALID_TOKEN" },
        { status: 404 }
      );
    }

    // Find the latest OTP session for this assignment
    const otpSession = await prisma.otpSession.findFirst({
      where: { assignmentId: assignment.id },
      orderBy: { createdAt: "desc" },
    });

    if (!otpSession) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "No verification code found. Please request a new one.", code: "NO_OTP" },
        { status: 400 }
      );
    }

    // Check cooldown
    if (isInCooldown(otpSession.cooldownUntil)) {
      const remainingSeconds = Math.ceil(
        ((otpSession.cooldownUntil as Date).getTime() - Date.now()) / 1000
      );
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: "Too many failed attempts. Please wait before trying again.",
          code: "COOLDOWN",
          cooldown: remainingSeconds,
        },
        { status: 429 }
      );
    }

    // Check expiry
    if (isOTPExpired(otpSession.expiresAt)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Verification code has expired. Please request a new one.", code: "OTP_EXPIRED" },
        { status: 410 }
      );
    }

    // Verify OTP against hash
    const isValid = await verifyOTP(otp, otpSession.otpHash);

    if (!isValid) {
      const newAttempts = otpSession.attempts + 1;
      const updateData: { attempts: number; cooldownUntil?: Date } = {
        attempts: newAttempts,
      };

      // Set cooldown after max attempts
      if (newAttempts >= OTP_CONFIG.maxAttempts) {
        updateData.cooldownUntil = getCooldownEnd();
      }

      await prisma.otpSession.update({
        where: { id: otpSession.id },
        data: updateData,
      });

      const remaining = OTP_CONFIG.maxAttempts - newAttempts;
      if (remaining > 0) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
            code: "INVALID_OTP",
          },
          { status: 401 }
        );
      }

      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: "Too many failed attempts. Please wait before trying again.",
          code: "COOLDOWN",
          cooldown: OTP_CONFIG.cooldownMinutes * 60,
        },
        { status: 429 }
      );
    }

    // OTP is valid — generate session token
    const sessionToken = cuid();
    const sessionExpiry = getSessionExpiry();

    await prisma.otpSession.update({
      where: { id: otpSession.id },
      data: {
        verifiedAt: new Date(),
        sessionToken,
        sessionExpiry,
      },
    });

    // Set httpOnly cookie
    const response = NextResponse.json<ApiResponse<{ verified: true }>>({
      success: true,
      data: { verified: true },
    });

    response.cookies.set("evaluation_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: OTP_CONFIG.sessionDurationHours * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
