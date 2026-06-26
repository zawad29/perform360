"use client";

import { PageHeader } from "@/components/layout/page-header";
import { CycleEditor } from "./_components/cycle-editor";

export default function NewCyclePage() {
  return (
    <div>
      <PageHeader
        title="Create Evaluation Cycle"
        description="Set up a new 360° evaluation cycle"
      />
      <CycleEditor mode="create" />
    </div>
  );
}
