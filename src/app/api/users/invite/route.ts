import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrHR, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail, getUserInviteEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "HR", "MEMBER", "EXTERNAL"]),
});

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  const authResult = await requireAdminOrHR();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const validated = inviteSchema.parse(body);

    // Only ADMINs can create other ADMINs
    if (validated.role === "ADMIN" && authResult.role !== "ADMIN") {
      return NextResponse.json({
        success: false,
        error: "Only admins can assign the ADMIN role",
        code: "FORBIDDEN",
      }, { status: 403 });
    }

    // Check if active user already exists in company
    const existingUser = await prisma.user.findFirst({
      where: {
        email: validated.email,
        companyId: authResult.companyId,
        archivedAt: null,
      },
    });

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: "A user with this email already exists in the company",
        code: "DUPLICATE",
      }, { status: 409 });
    }

    // ADMIN/HR get an AuthUser record (they can log in).
    // MEMBER/EXTERNAL only exist in the Users table (OTP-based access).
    const needsAuth = validated.role === "ADMIN" || validated.role === "HR";

    const result = await prisma.$transaction(async (tx) => {
      let authUserId: string | undefined;

      if (needsAuth) {
        const authUser = await tx.authUser.upsert({
          where: { email: validated.email },
          create: { email: validated.email, name: validated.name },
          update: {},
        });
        authUserId = authUser.id;
      }

      const user = await tx.user.create({
        data: {
          email: validated.email,
          name: validated.name,
          role: validated.role,
          companyId: authResult.companyId,
          ...(authUserId ? { authUserId } : {}),
        },
      });

      return user;
    });

    await writeAuditLog({
      companyId: authResult.companyId,
      userId: authResult.userId,
      action: "user_invite",
      target: `user:${result.id}`,
      metadata: { email: validated.email, role: validated.role },
    });

    // Members only receive evaluation links — no account welcome email.
    // ADMIN and HR users get a welcome email with login URL.
    let emailSent = false;
    if (validated.role !== "MEMBER" && validated.role !== "EXTERNAL") {
      const company = await prisma.company.findUnique({
        where: { id: authResult.companyId },
        select: { name: true },
      });
      const companyName = company?.name ?? "your organization";
      const { html, text } = getUserInviteEmail(
        validated.name,
        companyName,
        `${APP_URL}/login`
      );

      emailSent = true;
      try {
        await sendEmail({
          to: validated.email,
          subject: `You've been invited to ${companyName}`,
          html,
          text,
        });
      } catch (err) {
        emailSent = false;
        console.error("Failed to send invite email:", err);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      emailSent,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
      }, { status: 400 });
    }
    return NextResponse.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
}
