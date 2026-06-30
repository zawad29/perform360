import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOTP, hashOTP } from "@/lib/otp";
import { sendEmail, getOTPEmail } from "@/lib/email";
import { OTP_CONFIG } from "@/lib/constants";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Validate summary token
    const reviewerLink = await prisma.cycleReviewerLink.findUnique({
      where: { token },
      include: {
        cycle: { select: { status: true } },
      },
    });

    if (!reviewerLink) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid review link", code: "INVALID_TOKEN" },
        { status: 404 }
      );
    }

    if (reviewerLink.cycle.status !== "ACTIVE") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This evaluation cycle is no longer active", code: "CYCLE_INACTIVE" },
        { status: 410 }
      );
    }

    // Look up reviewer email
    const reviewer = await prisma.user.findFirst({
      where: { id: reviewerLink.reviewerId },
      select: { email: true, name: true },
    });

    if (!reviewer) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Reviewer not found" },
        { status: 404 }
      );
    }

    // Reuse an existing verified session when one is still active.
    const existingSession = await prisma.otpSession.findFirst({
      where: {
        email: reviewer.email,
        verifiedAt: { not: null },
        sessionExpiry: { gt: new Date() },
        sessionToken: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingSession) {
      return NextResponse.json<ApiResponse<{ sent: false; alreadyVerified: true }>>({
        success: true,
        data: { sent: false, alreadyVerified: true },
      });
    }

    // Rate limit: max 5 sends per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSendCount = await prisma.otpSession.count({
      where: {
        email: reviewer.email,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentSendCount >= OTP_CONFIG.rateLimitPerEmail) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Too many verification codes sent. Please try again later.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    // Generate and hash OTP
    const { otp, expiresAt } = createOTP();
    const otpHash = await hashOTP(otp);

    // Create OtpSession linked to reviewerLink (not assignment)
    await prisma.otpSession.create({
      data: {
        reviewerLinkId: reviewerLink.id,
        email: reviewer.email,
        otpHash,
        expiresAt,
      },
    });

    // Send OTP email
    const { html, text } = getOTPEmail(otp, reviewer.name);
    await sendEmail({
      to: reviewer.email,
      subject: "Your Performs360 Verification Code",
      html,
      text,
    });

    return NextResponse.json<ApiResponse<{ sent: true; expiresIn: number }>>({
      success: true,
      data: { sent: true, expiresIn: OTP_CONFIG.expiryMinutes * 60 },
    });
  } catch (error) {
    console.error("Summary OTP send error:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
