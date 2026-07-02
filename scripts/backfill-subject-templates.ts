/**
 * One-shot backfill: populate CycleSubjectTemplate rows for cycles created
 * before the per-team person→template mapping existed. For each DRAFT/ACTIVE
 * cycle with no mapping rows yet, writes AUTO rows from current team routing.
 *
 * Idempotent — cycles that already have rows are skipped.
 *
 * Run once:
 *   npx tsx scripts/backfill-subject-templates.ts
 */
import { PrismaClient } from "@prisma/client";
import { syncSubjectTemplateMap } from "../src/lib/assignments";
import type { TemplateMeta, SectionShape } from "../src/lib/template-routing";

const prisma = new PrismaClient();

async function main() {
  const cycles = await prisma.evaluationCycle.findMany({
    where: { status: { in: ["DRAFT", "ACTIVE"] } },
    select: {
      id: true,
      companyId: true,
      _count: { select: { subjectTemplates: true } },
      cycleTeams: {
        select: {
          teamId: true,
          templates: {
            select: {
              template: {
                select: {
                  id: true,
                  designationIds: true,
                  appliesToRole: true,
                  sections: true,
                },
              },
            },
          },
        },
      },
    },
  });

  let filled = 0;
  let skipped = 0;

  for (const cycle of cycles) {
    if (cycle._count.subjectTemplates > 0) {
      skipped++;
      continue;
    }

    const teamTemplatesMap = new Map<string, TemplateMeta[]>();
    for (const ct of cycle.cycleTeams) {
      teamTemplatesMap.set(
        ct.teamId,
        ct.templates.map((t) => ({
          id: t.template.id,
          designationIds: t.template.designationIds,
          appliesToRole: t.template.appliesToRole,
          sections: t.template.sections as unknown as SectionShape[],
        }))
      );
    }

    await syncSubjectTemplateMap(cycle.id, cycle.companyId, teamTemplatesMap);
    filled++;
    console.log(`✓ filled mapping for cycle ${cycle.id}`);
  }

  console.log(`\nDone. Filled ${filled} cycle(s), skipped ${skipped} already-populated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
