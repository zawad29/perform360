import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { applyRateLimit } from "@/lib/rate-limit";

const onboardingSchema = z.object({
  companyName: z.string().min(2, "Organization name must be at least 2 characters").max(100),
  adminName: z.string().min(2, "Name must be at least 2 characters").max(100),
  adminEmail: z.string().email("Please enter a valid email address"),
});

export async function POST(request: NextRequest) {
  const rl = applyRateLimit(request);
  if (rl) return rl;

  try {
    // Only allow onboarding if no company exists yet
    const existingCompany = await prisma.company.findFirst({
      select: { id: true },
    });

    if (existingCompany) {
      return NextResponse.json(
        { success: false, error: "Organization already set up. Please sign in." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { companyName, adminName, adminEmail } = parsed.data;
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          slug,
          encryptionKeyEncrypted: "PLACEHOLDER_AWAITING_SETUP",
          encryptionSalt: null,
          encryptionSetupAt: null,
          keyVersion: 0,
        },
      });

      // Seed default evaluation templates
      for (const tpl of DEFAULT_TEMPLATES) {
        await tx.evaluationTemplate.create({
          data: {
            name: tpl.name,
            description: tpl.description,
            sections: JSON.parse(JSON.stringify(tpl.sections)) as Prisma.InputJsonValue,
            isGlobal: false,
            companyId: company.id,
            createdBy: adminEmail,
          },
        });
      }

      const authUser = await tx.authUser.upsert({
        where: { email: adminEmail },
        create: { email: adminEmail, name: adminName },
        update: {},
      });

      await tx.user.create({
        data: {
          email: adminEmail,
          name: adminName,
          role: "ADMIN",
          companyId: company.id,
          authUserId: authUser.id,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
