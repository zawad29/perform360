export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDbConnectionError } from "@/lib/db-errors";
import { DatabaseUnavailable } from "@/components/system/database-unavailable";

export default async function RootPage() {
  let companyExists = false;
  let session: Session | null = null;

  try {
    const company = await prisma.company.findFirst({ select: { id: true } });
    companyExists = !!company;
    session = await auth();
  } catch (err) {
    if (isDbConnectionError(err)) {
      console.error("Database connection error:", err);
      return <DatabaseUnavailable />;
    }
    throw err;
  }

  if (!companyExists) redirect("/onboarding");
  if (session?.user) redirect("/overview");
  redirect("/login");
}
