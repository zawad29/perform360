"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useParams } from "next/navigation";
import { CycleEditor } from "@/app/(dashboard)/cycles/new/_components/cycle-editor";

export default function EditCyclePage() {
  const params = useParams<{ cycleId: string }>();

  return (
    <div>
      <PageHeader
        title="Edit Evaluation Cycle"
        description="Review or update cycle configuration based on its current state"
      />
      <CycleEditor mode="edit" cycleId={params.cycleId} />
    </div>
  );
}
