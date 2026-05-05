import { Prisma, PrismaClient, WeightPreset } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "../src/lib/default-templates";
import { WEIGHT_PRESETS } from "../src/lib/directions";

const prisma = new PrismaClient();

interface TemplateOverride {
  weightPreset?: WeightPreset;
  weightsMember?: Prisma.InputJsonValue;
  weightsManager?: Prisma.InputJsonValue;
  sectionDirections?: Record<string, string[]>;
}

const TEMPLATE_OVERRIDES: Record<string, TemplateOverride> = {
  "Manager 360 Review": {
    weightPreset: "supervisor_focus",
    weightsMember: WEIGHT_PRESETS.supervisor_focus.member as unknown as Prisma.InputJsonValue,
    weightsManager: WEIGHT_PRESETS.supervisor_focus.manager as unknown as Prisma.InputJsonValue,
  },
  "360 Degree Feedback": {
    sectionDirections: {
      "Overall Feedback": ["DOWNWARD", "UPWARD", "LATERAL"],
    },
  },
};

async function main() {
  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await prisma.evaluationTemplate.findFirst({
      where: { name: tpl.name, isGlobal: true, companyId: null },
    });
    if (existing) continue;

    const ov = TEMPLATE_OVERRIDES[tpl.name] ?? {};
    // Ensure every section carries a stable id so React render keys stay unique
    // when the template is shown in TemplatePreview and the routing matrix.
    const slug = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const sections = tpl.sections.map((s, i) => ({
      ...s,
      id: ("id" in s && (s as { id?: string }).id) || `sec-${i}-${slug(s.title)}`,
      directions: ov.sectionDirections?.[s.title] ?? [],
    }));

    await prisma.evaluationTemplate.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        sections: JSON.parse(JSON.stringify(sections)) as Prisma.InputJsonValue,
        levelIds: [],
        weightPreset: ov.weightPreset ?? null,
        weightsMember: ov.weightsMember ?? Prisma.JsonNull,
        weightsManager: ov.weightsManager ?? Prisma.JsonNull,
        isGlobal: true,
        companyId: null,
        createdBy: "seed",
      },
    });
    console.log("Created global:", tpl.name);
  }
}
main().finally(() => prisma.$disconnect());
