/**
 * One-shot data migration: re-applies the current DEFAULT_TEMPLATES sections
 * (which now include `directions` tags) onto already-seeded templates whose
 * structure still matches the original (same name + same section titles).
 *
 * Templates that have been customized (different sections, renamed, etc.) are
 * skipped — we only touch the ones that look exactly like the seed.
 *
 * Run once after upgrading to v1.0.0:
 *   npx tsx scripts/update-existing-templates.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "../src/lib/default-templates";

const prisma = new PrismaClient();

async function main() {
  let updated = 0;
  let skipped = 0;
  let snapshotted = 0;

  for (const seed of DEFAULT_TEMPLATES) {
    const seedTitles = seed.sections.map((s) => s.title).join("|");

    const matches = await prisma.evaluationTemplate.findMany({
      where: { name: seed.name },
    });

    for (const tpl of matches) {
      const currentSections = (tpl.sections as Array<{ title: string }> | null) ?? [];
      const currentTitles = currentSections.map((s) => s.title).join("|");

      if (currentTitles !== seedTitles) {
        console.log(`  [skip] ${tpl.name} (${tpl.id}) — section titles diverged`);
        skipped++;
        continue;
      }

      const sectionsJson = JSON.parse(JSON.stringify(seed.sections));
      const nextVersion = tpl.version + 1;

      await prisma.$transaction(async (tx) => {
        const updatedRow = await tx.evaluationTemplate.update({
          where: { id: tpl.id },
          data: {
            sections: sectionsJson,
            version: nextVersion,
          },
        });
        await tx.evaluationTemplateVersion.create({
          data: {
            templateId: updatedRow.id,
            version: nextVersion,
            name: updatedRow.name,
            description: updatedRow.description,
            levelIds: updatedRow.levelIds,
            weightPreset: updatedRow.weightPreset,
            weightsMember:
              updatedRow.weightsMember === null
                ? Prisma.JsonNull
                : (updatedRow.weightsMember as Prisma.InputJsonValue),
            weightsManager:
              updatedRow.weightsManager === null
                ? Prisma.JsonNull
                : (updatedRow.weightsManager as Prisma.InputJsonValue),
            sections: sectionsJson,
            createdBy: "data-migration",
          },
        });
        snapshotted++;
      });

      console.log(`  [updated] ${tpl.name} (${tpl.id}) → v${nextVersion}`);
      updated++;
    }
  }

  console.log(
    `\nDone — ${updated} updated, ${snapshotted} snapshots written, ${skipped} skipped (customized).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
