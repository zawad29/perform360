/**
 * Test Seed — creates a fully populated company ("TechCorp Inc.") that covers
 * every feature and edge case in Performs360:
 *
 *  - Company with encryption set up
 *  - Users across all roles (ADMIN, HR, EMPLOYEE, EXTERNAL)
 *  - Seniority levels (SE L-1, SE L-2, SA L-2, SA L-3, D-1, D-2, PM L-1, PM L-2)
 *  - Teams covering: single manager, co-managed, manager-only, member-only,
 *    external evaluators, cross-team members, leveled members
 *  - Company-specific evaluation templates demonstrating template-owned
 *    levelIds, weightsMember/weightsManager, and per-section directions
 *  - 3 evaluation cycles:
 *    1. CLOSED cycle with full assignments, submitted responses (encrypted), and calibrations
 *    2. ACTIVE cycle with multiple level-filtered templates per team (level-resolved routing)
 *    3. DRAFT cycle with multiple templates per team
 *  - Audit log entries
 *
 * Run:  npx tsx prisma/test-seed.ts
 */

import { Prisma, PrismaClient, UserRole, TeamMemberRole, CycleStatus, AssignmentStatus } from "@prisma/client";
import { WEIGHT_PRESETS } from "../src/lib/directions";
import { randomBytes, scryptSync, createCipheriv } from "crypto";

const prisma = new PrismaClient();

// ─── Encryption helpers (mirrored from src/lib/encryption.ts) ───

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

function generateDataKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

function encryptDataKey(dataKey: Buffer, masterKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function encrypt(plaintext: string, key: Buffer): { encrypted: string; iv: string; tag: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
  };
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── Constants ───

const COMPANY_NAME = "TechCorp Inc.";
const COMPANY_SLUG = "techcorp";
const PASSPHRASE = "test-passphrase-for-seed";

// ─── Main ───

async function main() {
  console.log("=== Test Seed: Creating TechCorp Inc. ===\n");

  // ── 0. Clean up previous test seed (idempotent) ──
  const existingCompany = await prisma.company.findUnique({ where: { slug: COMPANY_SLUG } });
  if (existingCompany) {
    console.log("Cleaning up previous test seed data...");
    const companyId = existingCompany.id;

    // Delete in dependency order
    const cycles = await prisma.evaluationCycle.findMany({ where: { companyId }, select: { id: true } });
    const cycleIds = cycles.map((c) => c.id);

    if (cycleIds.length > 0) {
      await prisma.calibrationAdjustment.deleteMany({ where: { cycleId: { in: cycleIds } } });
      await prisma.otpSession.deleteMany({ where: { assignment: { cycleId: { in: cycleIds } } } });
      await prisma.evaluationResponse.deleteMany({ where: { assignment: { cycleId: { in: cycleIds } } } });
      await prisma.evaluationAssignment.deleteMany({ where: { cycleId: { in: cycleIds } } });
      await prisma.cycleReviewerLink.deleteMany({ where: { cycleId: { in: cycleIds } } });
      await prisma.cycleTeamTemplate.deleteMany({ where: { cycleTeam: { cycleId: { in: cycleIds } } } });
      await prisma.cycleTeam.deleteMany({ where: { cycleId: { in: cycleIds } } });
      await prisma.evaluationCycle.deleteMany({ where: { companyId } });
    }

    await prisma.teamMember.deleteMany({ where: { team: { companyId } } });
    await prisma.team.deleteMany({ where: { companyId } });
    await prisma.level.deleteMany({ where: { companyId } });
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.recoveryCode.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.evaluationTemplate.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { slug: COMPANY_SLUG } });
    console.log("  Previous data cleaned.\n");
  }

  // ── 1. Create Company with encryption ──
  console.log("1. Creating company with encryption...");
  const salt = randomBytes(SALT_LENGTH);
  const masterKey = deriveKey(PASSPHRASE, salt);
  const dataKey = generateDataKey();
  const encryptedDataKey = encryptDataKey(dataKey, masterKey);

  const company = await prisma.company.create({
    data: {
      name: COMPANY_NAME,
      slug: COMPANY_SLUG,
      encryptionKeyEncrypted: encryptedDataKey,
      encryptionSalt: salt.toString("base64"),
      encryptionSetupAt: new Date(),
      keyVersion: 1,
    },
  });
  console.log(`  Company: ${company.name} (${company.id})\n`);

  // ── 2. Create Levels ──
  console.log("2. Creating seniority levels...");
  const levelNames = ["SE L-1", "SE L-2", "SA L-2", "SA L-3", "D-1", "D-2", "PM L-1", "PM L-2"];
  const levels: Record<string, string> = {};
  for (const name of levelNames) {
    const level = await prisma.level.create({
      data: { name, companyId: company.id },
    });
    levels[name] = level.id;
    console.log(`  Level: ${name} (${level.id})`);
  }
  console.log();

  // ── 3. Create Users ──
  console.log("3. Creating users...");

  interface UserDef {
    email: string;
    name: string;
    role: UserRole;
  }

  const userDefs: UserDef[] = [
    // Admin & HR
    { email: "james.carter@techcorp.com", name: "James Carter", role: UserRole.ADMIN },
    { email: "maria.santos@techcorp.com", name: "Maria Santos", role: UserRole.HR },

    // Engineering managers
    { email: "sarah.chen@techcorp.com", name: "Sarah Chen", role: UserRole.EMPLOYEE },
    { email: "alex.rivera@techcorp.com", name: "Alex Rivera", role: UserRole.EMPLOYEE },
    { email: "priya.sharma@techcorp.com", name: "Priya Sharma", role: UserRole.EMPLOYEE },
    { email: "dan.kim@techcorp.com", name: "Dan Kim", role: UserRole.EMPLOYEE },

    // Engineers
    { email: "jordan.lee@techcorp.com", name: "Jordan Lee", role: UserRole.EMPLOYEE },
    { email: "maya.patel@techcorp.com", name: "Maya Patel", role: UserRole.EMPLOYEE },
    { email: "chris.wu@techcorp.com", name: "Chris Wu", role: UserRole.EMPLOYEE },
    { email: "tom.zhang@techcorp.com", name: "Tom Zhang", role: UserRole.EMPLOYEE },
    { email: "nina.costa@techcorp.com", name: "Nina Costa", role: UserRole.EMPLOYEE },
    { email: "sam.ali@techcorp.com", name: "Sam Ali", role: UserRole.EMPLOYEE },

    // Finance & HR members
    { email: "robert.hayes@techcorp.com", name: "Robert Hayes", role: UserRole.EMPLOYEE },
    { email: "lisa.park@techcorp.com", name: "Lisa Park", role: UserRole.EMPLOYEE },
    { email: "mark.jensen@techcorp.com", name: "Mark Jensen", role: UserRole.EMPLOYEE },
    { email: "emily.tran@techcorp.com", name: "Emily Tran", role: UserRole.EMPLOYEE },
    { email: "kevin.brown@techcorp.com", name: "Kevin Brown", role: UserRole.EMPLOYEE },
    { email: "rachel.adams@techcorp.com", name: "Rachel Adams", role: UserRole.EMPLOYEE },
    { email: "david.liu@techcorp.com", name: "David Liu", role: UserRole.EMPLOYEE },
    { email: "sophie.martin@techcorp.com", name: "Sophie Martin", role: UserRole.EMPLOYEE },

    // External evaluators
    { email: "board.advisor@external.com", name: "Board Advisor", role: UserRole.EXTERNAL },
    { email: "client.stakeholder@external.com", name: "Lisa Park (Client)", role: UserRole.EXTERNAL },
  ];

  const users: Record<string, string> = {};
  for (const def of userDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        name: def.name,
        role: def.role,
        companyId: company.id,
      },
    });
    users[def.email] = user.id;
  }
  console.log(`  Created ${userDefs.length} users\n`);

  // ── 4. Create Teams with Members & Levels ──
  console.log("4. Creating teams...");

  interface MemberDef {
    email: string;
    role: TeamMemberRole;
    level?: string;
  }

  interface TeamDef {
    name: string;
    description: string;
    members: MemberDef[];
  }

  const teamDefs: TeamDef[] = [
    {
      name: "Leadership Team",
      description: "CTO evaluates all department heads",
      members: [
        { email: "james.carter@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "sarah.chen@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "robert.hayes@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "emily.tran@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "maria.santos@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "david.liu@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "board.advisor@external.com", role: TeamMemberRole.EXTERNAL },
      ],
    },
    {
      name: "Engineering Management",
      description: "EM evaluates all solution architects",
      members: [
        { email: "sarah.chen@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "alex.rivera@techcorp.com", role: TeamMemberRole.MEMBER, level: "SA L-3" },
        { email: "priya.sharma@techcorp.com", role: TeamMemberRole.MEMBER, level: "SA L-3" },
        { email: "dan.kim@techcorp.com", role: TeamMemberRole.MEMBER, level: "SA L-2" },
      ],
    },
    {
      name: "Platform Team",
      description: "Backend platform services — mixed levels, external stakeholder",
      members: [
        { email: "alex.rivera@techcorp.com", role: TeamMemberRole.MANAGER, level: "SA L-3" },
        { email: "jordan.lee@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-2" },
        { email: "maya.patel@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-1" },
        { email: "chris.wu@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-1" },
        { email: "client.stakeholder@external.com", role: TeamMemberRole.EXTERNAL },
      ],
    },
    {
      name: "Frontend Team",
      description: "UI/UX engineering",
      members: [
        { email: "priya.sharma@techcorp.com", role: TeamMemberRole.MANAGER, level: "SA L-3" },
        { email: "tom.zhang@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-2" },
        { email: "nina.costa@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-1" },
      ],
    },
    {
      name: "DevOps Team",
      description: "Infrastructure and CI/CD",
      members: [
        { email: "dan.kim@techcorp.com", role: TeamMemberRole.MANAGER, level: "SA L-2" },
        { email: "sam.ali@techcorp.com", role: TeamMemberRole.MEMBER, level: "SE L-1" },
      ],
    },
    {
      name: "Finance Team",
      description: "Financial planning and analysis — co-managed",
      members: [
        { email: "robert.hayes@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "emily.tran@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "lisa.park@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "mark.jensen@techcorp.com", role: TeamMemberRole.MEMBER },
      ],
    },
    {
      name: "HR Team",
      description: "People operations",
      members: [
        { email: "maria.santos@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "kevin.brown@techcorp.com", role: TeamMemberRole.MEMBER },
        { email: "rachel.adams@techcorp.com", role: TeamMemberRole.MEMBER },
      ],
    },
    {
      name: "Admin Team",
      description: "Office management",
      members: [
        { email: "david.liu@techcorp.com", role: TeamMemberRole.MANAGER },
        { email: "sophie.martin@techcorp.com", role: TeamMemberRole.MEMBER },
      ],
    },
  ];

  const teams: Record<string, string> = {};
  for (const def of teamDefs) {
    const team = await prisma.team.create({
      data: {
        name: def.name,
        description: def.description,
        companyId: company.id,
        members: {
          create: def.members.map((m) => ({
            userId: users[m.email],
            role: m.role,
            levelId: m.level ? levels[m.level] : null,
          })),
        },
      },
    });
    teams[def.name] = team.id;
    console.log(`  Team: ${def.name} (${def.members.length} members)`);
  }
  console.log();

  // ── 5. Create Company-Specific Templates ──
  // Two TechCorp engineering templates demonstrating template-owned features:
  //   - levelIds (level filter)
  //   - weightPreset / weightsMember / weightsManager (direction weights)
  //   - per-section directions tag
  console.log("5. Creating company-specific templates...");
  const companyTemplate = await prisma.evaluationTemplate.create({
    data: {
      name: "TechCorp Engineering Review (Senior Track)",
      description: "TechCorp template for SE L-2, SA L-2, and SA L-3 engineers — code/system focus with supervisor-weighted scoring.",
      isGlobal: false,
      companyId: company.id,
      createdBy: "james.carter@techcorp.com",
      levelIds: [levels["SE L-2"], levels["SA L-2"], levels["SA L-3"]],
      weightPreset: "supervisor_focus",
      weightsMember: WEIGHT_PRESETS.supervisor_focus.member as unknown as Prisma.InputJsonValue,
      weightsManager: WEIGHT_PRESETS.supervisor_focus.manager as unknown as Prisma.InputJsonValue,
      sections: [
        {
          id: "tc-sec-1",
          title: "System Design & Architecture",
          description: "Ability to design scalable, maintainable systems",
          directions: [],
          questions: [
            { id: "tc-q1", text: "System design and architecture skills", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Beginner", "Learning", "Competent", "Advanced", "Expert"] },
            { id: "tc-q2", text: "Code review quality and thoroughness", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Rarely reviews", "Basic feedback", "Good reviews", "Thorough", "Exceptional"] },
            { id: "tc-q3", text: "Comments on their system design approach", type: "text", required: false },
          ],
        },
        {
          id: "tc-sec-2",
          title: "Delivery & Reliability",
          description: "Shipping quality work on schedule",
          directions: [],
          questions: [
            { id: "tc-q4", text: "Consistently delivers on commitments", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"] },
            { id: "tc-q5", text: "How they handle production incidents", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Avoids", "Needs guidance", "Handles well", "Takes ownership", "Incident leader"] },
            { id: "tc-q6", text: "Testing practices and quality assurance", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["No tests", "Basic tests", "Good coverage", "TDD practitioner", "Quality champion"] },
          ],
        },
        {
          id: "tc-sec-3",
          title: "Collaboration & Growth",
          description: "Team contribution and professional development — managers, peers, and reports only",
          // Demonstrates per-section direction tagging: skip self-reflection and external,
          // since growth feedback is most actionable from people who work alongside them.
          directions: ["DOWNWARD", "UPWARD", "LATERAL"],
          questions: [
            { id: "tc-q7", text: "Mentorship and knowledge sharing", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["None", "When asked", "Proactive", "Active mentor", "Team multiplier"] },
            { id: "tc-q8", text: "What should they keep doing?", type: "text", required: true },
            { id: "tc-q9", text: "What should they do differently?", type: "text", required: true },
            { id: "tc-q10", text: "Additional comments", type: "text", required: false },
          ],
        },
      ],
    },
  });
  console.log(`  Template: ${companyTemplate.name} (${companyTemplate.id})`);

  const juniorTemplate = await prisma.evaluationTemplate.create({
    data: {
      name: "TechCorp Junior Track Review",
      description: "TechCorp template for SE L-1 engineers — fundamentals and growth focus, peer-weighted scoring.",
      isGlobal: false,
      companyId: company.id,
      createdBy: "james.carter@techcorp.com",
      levelIds: [levels["SE L-1"]],
      weightPreset: "peer_focus",
      weightsMember: WEIGHT_PRESETS.peer_focus.member as unknown as Prisma.InputJsonValue,
      weightsManager: WEIGHT_PRESETS.peer_focus.manager as unknown as Prisma.InputJsonValue,
      sections: [
        {
          id: "jr-sec-1",
          title: "Fundamentals",
          description: "Core engineering skills for early-career engineers",
          directions: [],
          questions: [
            { id: "jr-q1", text: "Foundational coding skills", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Needs help", "Learning", "Competent", "Strong", "Exceptional"] },
            { id: "jr-q2", text: "Receptiveness to feedback", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Defensive", "Reluctant", "Open", "Eager", "Seeks it out"] },
            { id: "jr-q3", text: "Reliability on assigned work", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Often misses", "Sometimes misses", "Reliable", "Very reliable", "Always delivers"] },
          ],
        },
        {
          id: "jr-sec-2",
          title: "Peer Collaboration",
          description: "How they work with teammates day-to-day",
          // Peer-only section: demonstrates direction filter
          directions: ["LATERAL", "SELF"],
          questions: [
            { id: "jr-q4", text: "Asks good questions and shares context", type: "rating_scale", required: true, scaleMin: 1, scaleMax: 5, scaleLabels: ["Rarely", "Sometimes", "Often", "Consistently", "Exemplary"] },
            { id: "jr-q5", text: "What's going well?", type: "text", required: true },
            { id: "jr-q6", text: "What should they grow on next?", type: "text", required: true },
          ],
        },
      ],
    },
  });
  console.log(`  Template: ${juniorTemplate.name} (${juniorTemplate.id})`);

  // ── 5b. The "everything-everywhere" template ──
  // Covers every axis the routing model exposes:
  //   - levelIds = []               → wildcard, applies to all levels
  //   - custom weights              → both Member and Manager profiles set,
  //                                   diverged values (not the same column)
  //   - section.directions          → five sections, one per direction key,
  //                                   plus one untagged section that shows everywhere
  //   - question.type variety       → rating_scale, text, multiple_choice
  // Useful for verifying preview-as / routing matrix / report rendering all
  // handle every combination.
  const holisticTemplate = await prisma.evaluationTemplate.create({
    data: {
      name: "TechCorp Holistic 360 (All Perspectives)",
      description:
        "Demonstration template touching every routing axis — direction-tagged sections, member + manager weight profiles, and every supported question type. Useful as a baseline preview.",
      isGlobal: false,
      companyId: company.id,
      createdBy: "james.carter@techcorp.com",
      levelIds: [],
      weightPreset: "custom",
      weightsMember: {
        downward: 35,
        upward: 0,
        lateral: 30,
        self: 15,
        external: 20,
      } as unknown as Prisma.InputJsonValue,
      weightsManager: {
        downward: 0,
        upward: 40,
        lateral: 25,
        self: 20,
        external: 15,
      } as unknown as Prisma.InputJsonValue,
      sections: [
        // Always shown — baseline for everyone.
        {
          id: "h-sec-baseline",
          title: "Baseline",
          description: "Shown to every reviewer regardless of direction",
          directions: [],
          questions: [
            {
              id: "h-q-baseline-1",
              text: "Overall impression of this person's contribution",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Poor", "Below avg", "Solid", "Strong", "Outstanding"],
            },
            {
              id: "h-q-baseline-2",
              text: "How long have you worked with them?",
              type: "multiple_choice",
              required: true,
              options: ["Less than 3 months", "3–12 months", "1–2 years", "More than 2 years"],
            },
          ],
        },
        // DOWNWARD only — what a manager observes when looking at a report.
        {
          id: "h-sec-downward",
          title: "Performance & Delivery (manager view)",
          description: "Only shown when the reviewer outranks the subject",
          directions: ["DOWNWARD"],
          questions: [
            {
              id: "h-q-down-1",
              text: "Quality of work delivered against expectations",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Below", "Inconsistent", "Meets", "Exceeds", "Exemplary"],
            },
            {
              id: "h-q-down-2",
              text: "What has surprised you about their work this period?",
              type: "text",
              required: false,
            },
          ],
        },
        // UPWARD only — how a report rates their manager.
        {
          id: "h-sec-upward",
          title: "Leadership & Trust (member view)",
          description: "Only shown when the subject manages the reviewer",
          directions: ["UPWARD"],
          questions: [
            {
              id: "h-q-up-1",
              text: "I trust this manager's intentions and judgment",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
            },
            {
              id: "h-q-up-2",
              text: "Decision style you most associate with them",
              type: "multiple_choice",
              required: true,
              options: [
                "Consensus-driven",
                "Decisive with input",
                "Top-down",
                "Hands-off",
                "Inconsistent",
              ],
            },
            {
              id: "h-q-up-3",
              text: "What would help you do your best work under them?",
              type: "text",
              required: true,
            },
          ],
        },
        // LATERAL only — peer collaboration.
        {
          id: "h-sec-lateral",
          title: "Collaboration (peer view)",
          description: "Only shown to peers and colleagues at the same level",
          directions: ["LATERAL"],
          questions: [
            {
              id: "h-q-lat-1",
              text: "Easy to work with on shared problems",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Difficult", "Sometimes", "Usually", "Mostly", "Always"],
            },
            {
              id: "h-q-lat-2",
              text: "Picks up their share of the unglamorous work",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Avoids", "Rarely", "Sometimes", "Often", "Consistently"],
            },
          ],
        },
        // SELF only — introspection prompts.
        {
          id: "h-sec-self",
          title: "Self-reflection",
          description: "Only shown to the subject reviewing themselves",
          directions: ["SELF"],
          questions: [
            {
              id: "h-q-self-1",
              text: "Confidence in your output this cycle",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Low", "Mixed", "Steady", "High", "Very high"],
            },
            {
              id: "h-q-self-2",
              text: "What would you do differently if you started this cycle over?",
              type: "text",
              required: true,
            },
            {
              id: "h-q-self-3",
              text: "Where do you most want to grow next?",
              type: "multiple_choice",
              required: true,
              options: [
                "Technical depth",
                "Cross-team influence",
                "Mentorship",
                "Strategic thinking",
                "Execution speed",
              ],
            },
          ],
        },
        // EXTERNAL only — outside-stakeholder perspective.
        {
          id: "h-sec-external",
          title: "External impact",
          description: "Only shown to external reviewers (clients, advisors, vendors)",
          directions: ["EXTERNAL"],
          questions: [
            {
              id: "h-q-ext-1",
              text: "Reliability when responding to external requests",
              type: "rating_scale",
              required: true,
              scaleMin: 1,
              scaleMax: 5,
              scaleLabels: ["Slow", "Inconsistent", "Reliable", "Quick", "Exceptional"],
            },
            {
              id: "h-q-ext-2",
              text: "Anything specific you'd like to flag about this engagement?",
              type: "text",
              required: false,
            },
          ],
        },
      ],
    },
  });
  console.log(`  Template: ${holisticTemplate.name} (${holisticTemplate.id})\n`);

  // Get global templates for cycle assignment
  const globalTemplates = await prisma.evaluationTemplate.findMany({
    where: { isGlobal: true },
    select: { id: true, name: true },
  });
  const globalTplMap: Record<string, string> = {};
  for (const t of globalTemplates) {
    globalTplMap[t.name] = t.id;
  }

  const tpl360 = globalTplMap["360 Degree Feedback"];
  const tplSWE = globalTplMap["Software Engineering 360 Review"];
  const tplPro = globalTplMap["Professional Skills 360 Review"];
  const tplMgr = globalTplMap["Manager 360 Review"];
  const tplTC = companyTemplate.id;
  const tplJunior = juniorTemplate.id;

  if (!tpl360 || !tplSWE || !tplPro || !tplMgr) {
    throw new Error("Global templates not found. Run `npx prisma db seed` first.");
  }

  // ── 6. Cycle 1: CLOSED — Q4 2025 Review (simple mode, with responses & calibration) ──
  console.log("6. Creating Cycle 1: Q4 2025 Review (CLOSED, with responses)...");

  const cycle1 = await prisma.evaluationCycle.create({
    data: {
      name: "Q4 2025 Performance Review",
      companyId: company.id,
      status: CycleStatus.CLOSED,
      startDate: new Date("2025-10-01"),
      endDate: new Date("2025-12-31"),
      cachedDataKeyEncrypted: encryptedDataKey, // for test purposes, reuse company key
    },
  });

  // Teams in this cycle with templates
  const cycle1Teams: { teamName: string; templateId: string }[] = [
    { teamName: "Platform Team", templateId: tplSWE },
    { teamName: "Frontend Team", templateId: tplSWE },
    { teamName: "DevOps Team", templateId: tplSWE },
    { teamName: "Engineering Management", templateId: tplMgr },
    { teamName: "Finance Team", templateId: tplPro },
    { teamName: "HR Team", templateId: tpl360 },
    { teamName: "Leadership Team", templateId: tplPro },
  ];

  const cycle1TeamIds: Record<string, string> = {};
  for (const ct of cycle1Teams) {
    const cycleTeam = await prisma.cycleTeam.create({
      data: {
        cycleId: cycle1.id,
        teamId: teams[ct.teamName],
        templates: { create: [{ templateId: ct.templateId }] },
      },
    });
    cycle1TeamIds[ct.teamName] = cycleTeam.id;
  }

  // Generate assignments for cycle 1 (manually to control data)
  // We'll create assignments for Platform Team + Engineering Management + Finance Team for completeness

  interface AssignmentDef {
    reviewer: string;
    subject: string;
    direction: "DOWNWARD" | "UPWARD" | "LATERAL" | "SELF" | "EXTERNAL";
    templateId: string;
    status: AssignmentStatus;
  }

  const c1Assignments: AssignmentDef[] = [
    // Platform Team — manager (Alex) → members
    { reviewer: "alex.rivera@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "maya.patel@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "chris.wu@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Platform Team — members → manager (upward)
    { reviewer: "jordan.lee@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "chris.wu@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Platform Team — peer
    { reviewer: "jordan.lee@techcorp.com", subject: "maya.patel@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "jordan.lee@techcorp.com", subject: "chris.wu@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "chris.wu@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "chris.wu@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "chris.wu@techcorp.com", subject: "maya.patel@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Platform Team — self
    { reviewer: "alex.rivera@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "jordan.lee@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "maya.patel@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "chris.wu@techcorp.com", subject: "chris.wu@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Platform Team — external
    { reviewer: "client.stakeholder@external.com", subject: "alex.rivera@techcorp.com", direction: "EXTERNAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "client.stakeholder@external.com", subject: "jordan.lee@techcorp.com", direction: "EXTERNAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "client.stakeholder@external.com", subject: "maya.patel@techcorp.com", direction: "EXTERNAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "client.stakeholder@external.com", subject: "chris.wu@techcorp.com", direction: "EXTERNAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Engineering Management — Sarah → architects
    { reviewer: "sarah.chen@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "sarah.chen@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "sarah.chen@techcorp.com", subject: "dan.kim@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    // Engineering Management — architects → Sarah (upward)
    { reviewer: "alex.rivera@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "dan.kim@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    // Engineering Management — peer between architects
    { reviewer: "alex.rivera@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "dan.kim@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "dan.kim@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "dan.kim@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "dan.kim@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    // Engineering Management — self
    { reviewer: "sarah.chen@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "dan.kim@techcorp.com", subject: "dan.kim@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    // Finance Team (co-managed) — both managers → members
    { reviewer: "robert.hayes@techcorp.com", subject: "lisa.park@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "robert.hayes@techcorp.com", subject: "mark.jensen@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "lisa.park@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "mark.jensen@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Finance Team — members → both managers
    { reviewer: "lisa.park@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "lisa.park@techcorp.com", subject: "emily.tran@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "mark.jensen@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "mark.jensen@techcorp.com", subject: "emily.tran@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Finance Team — peer between members
    { reviewer: "lisa.park@techcorp.com", subject: "mark.jensen@techcorp.com", direction: "LATERAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "mark.jensen@techcorp.com", subject: "lisa.park@techcorp.com", direction: "LATERAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Finance Team — co-manager peer reviews (Robert ↔ Emily)
    { reviewer: "robert.hayes@techcorp.com", subject: "emily.tran@techcorp.com", direction: "LATERAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "LATERAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Finance Team — self
    { reviewer: "robert.hayes@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "SELF", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "emily.tran@techcorp.com", direction: "SELF", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "lisa.park@techcorp.com", subject: "lisa.park@techcorp.com", direction: "SELF", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "mark.jensen@techcorp.com", subject: "mark.jensen@techcorp.com", direction: "SELF", templateId: tplPro, status: AssignmentStatus.SUBMITTED },

    // ── Frontend Team — Priya (manager) → Tom, Nina ──
    { reviewer: "priya.sharma@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "nina.costa@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Frontend Team — members → Priya (upward)
    { reviewer: "tom.zhang@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "nina.costa@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Frontend Team — peer
    { reviewer: "tom.zhang@techcorp.com", subject: "nina.costa@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "nina.costa@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // Frontend Team — self
    { reviewer: "priya.sharma@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "tom.zhang@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "nina.costa@techcorp.com", subject: "nina.costa@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },

    // ── DevOps Team — Dan (manager) → Sam ──
    { reviewer: "dan.kim@techcorp.com", subject: "sam.ali@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // DevOps Team — Sam → Dan (upward)
    { reviewer: "sam.ali@techcorp.com", subject: "dan.kim@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    // DevOps Team — self
    { reviewer: "dan.kim@techcorp.com", subject: "dan.kim@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "sam.ali@techcorp.com", subject: "sam.ali@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },

    // ── HR Team — Maria (manager) → Kevin, Rachel ──
    { reviewer: "maria.santos@techcorp.com", subject: "kevin.brown@techcorp.com", direction: "DOWNWARD", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maria.santos@techcorp.com", subject: "rachel.adams@techcorp.com", direction: "DOWNWARD", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    // HR Team — members → Maria (upward)
    { reviewer: "kevin.brown@techcorp.com", subject: "maria.santos@techcorp.com", direction: "UPWARD", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "rachel.adams@techcorp.com", subject: "maria.santos@techcorp.com", direction: "UPWARD", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    // HR Team — peer
    { reviewer: "kevin.brown@techcorp.com", subject: "rachel.adams@techcorp.com", direction: "LATERAL", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "rachel.adams@techcorp.com", subject: "kevin.brown@techcorp.com", direction: "LATERAL", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    // HR Team — self
    { reviewer: "maria.santos@techcorp.com", subject: "maria.santos@techcorp.com", direction: "SELF", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "kevin.brown@techcorp.com", subject: "kevin.brown@techcorp.com", direction: "SELF", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "rachel.adams@techcorp.com", subject: "rachel.adams@techcorp.com", direction: "SELF", templateId: tpl360, status: AssignmentStatus.SUBMITTED },

    // ── Leadership Team — James (manager) → members ──
    { reviewer: "james.carter@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "james.carter@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "james.carter@techcorp.com", subject: "emily.tran@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "james.carter@techcorp.com", subject: "maria.santos@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "james.carter@techcorp.com", subject: "david.liu@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Leadership Team — members → James (upward)
    { reviewer: "sarah.chen@techcorp.com", subject: "james.carter@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "robert.hayes@techcorp.com", subject: "james.carter@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "james.carter@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maria.santos@techcorp.com", subject: "james.carter@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "david.liu@techcorp.com", subject: "james.carter@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Leadership Team — external
    { reviewer: "board.advisor@external.com", subject: "james.carter@techcorp.com", direction: "EXTERNAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "board.advisor@external.com", subject: "sarah.chen@techcorp.com", direction: "EXTERNAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    // Leadership Team — self
    { reviewer: "james.carter@techcorp.com", subject: "james.carter@techcorp.com", direction: "SELF", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
  ];

  // Template question ID maps — rating IDs and text IDs per template
  const templateQuestionMap: Record<string, { ratingIds: string[]; textIds: string[] }> = {
    [tpl360]: {
      ratingIds: ["simple-q1", "simple-q2", "simple-q3", "simple-q4", "simple-q5", "simple-q6", "simple-q7", "simple-q8", "simple-q9"],
      textIds: ["simple-q10", "simple-q11", "simple-q12"],
    },
    [tplSWE]: {
      ratingIds: ["swe-q1", "swe-q2", "swe-q4", "swe-q5", "swe-q7", "swe-q8", "swe-q9", "swe-q11", "swe-q12", "swe-q14", "swe-q15", "swe-q16", "swe-q18", "swe-q19", "swe-q21", "swe-q22", "swe-q23", "swe-q25", "swe-q26", "swe-q27", "swe-q29", "swe-q30", "swe-q31"],
      textIds: ["swe-q3", "swe-q6", "swe-q10", "swe-q13", "swe-q17", "swe-q20", "swe-q24", "swe-q28", "swe-q32", "swe-q33", "swe-q34", "swe-q35"],
    },
    [tplPro]: {
      ratingIds: ["pro-q1", "pro-q2", "pro-q4", "pro-q5", "pro-q6", "pro-q8", "pro-q9", "pro-q11", "pro-q12", "pro-q14", "pro-q15", "pro-q17", "pro-q18", "pro-q19", "pro-q21", "pro-q22", "pro-q23"],
      textIds: ["pro-q3", "pro-q7", "pro-q10", "pro-q13", "pro-q16", "pro-q20", "pro-q24", "pro-q25", "pro-q26", "pro-q27"],
    },
    [tplMgr]: {
      ratingIds: ["mgr-q1", "mgr-q2", "mgr-q3", "mgr-q4", "mgr-q5", "mgr-q6", "mgr-q7", "mgr-q8", "mgr-q9", "mgr-q10", "mgr-q11", "mgr-q12", "mgr-q13", "mgr-q14", "mgr-q15"],
      textIds: ["mgr-q16", "mgr-q17"],
    },
    [tplTC]: {
      ratingIds: ["tc-q1", "tc-q2", "tc-q4", "tc-q5", "tc-q6", "tc-q7"],
      textIds: ["tc-q3", "tc-q8", "tc-q9", "tc-q10"],
    },
    [tplJunior]: {
      ratingIds: ["jr-q1", "jr-q2", "jr-q3", "jr-q4"],
      textIds: ["jr-q5", "jr-q6"],
    },
  };

  const textAnswers = [
    "Great team player with strong technical skills. Consistently delivers high quality work.",
    "Shows excellent problem-solving abilities and mentors junior team members effectively.",
    "Could improve on documentation and cross-team communication.",
    "Should focus more on testing practices and code review thoroughness.",
    "Demonstrates strong ownership of projects and proactively identifies risks.",
    "Would benefit from more proactive knowledge sharing with the broader team.",
  ];

  // Helper to generate realistic encrypted response data
  function generateResponse(templateId: string): { encrypted: string; iv: string; tag: string } {
    const qMap = templateQuestionMap[templateId];
    if (!qMap) throw new Error(`Unknown templateId in generateResponse: ${templateId}`);

    const answers: Record<string, number | string> = {};

    // Answer all rating questions with scores 2-5 (realistic range)
    for (const qId of qMap.ratingIds) {
      answers[qId] = 2 + Math.floor(Math.random() * 4); // 2-5
    }
    // Answer text questions with varied responses
    for (const qId of qMap.textIds) {
      answers[qId] = textAnswers[Math.floor(Math.random() * textAnswers.length)];
    }

    return encrypt(JSON.stringify(answers), dataKey);
  }

  let assignmentCount = 0;
  for (const a of c1Assignments) {
    const assignment = await prisma.evaluationAssignment.create({
      data: {
        cycleId: cycle1.id,
        templateId: a.templateId,
        subjectId: users[a.subject],
        reviewerId: users[a.reviewer],
        direction: a.direction,
        status: a.status,
        token: generateToken(),
      },
    });

    // Create encrypted response for submitted assignments
    if (a.status === AssignmentStatus.SUBMITTED) {
      const responseData = generateResponse(a.templateId);
      await prisma.evaluationResponse.create({
        data: {
          assignmentId: assignment.id,
          reviewerId: users[a.reviewer],
          subjectId: users[a.subject],
          answersEncrypted: responseData.encrypted,
          answersIv: responseData.iv,
          answersTag: responseData.tag,
          keyVersion: 1,
          submittedAt: new Date("2025-12-15"),
        },
      });
    }
    assignmentCount++;
  }
  console.log(`  Cycle 1: ${assignmentCount} assignments (all SUBMITTED with encrypted responses)\n`);

  // Add calibration adjustments for Platform Team members
  console.log("  Adding calibration adjustments...");
  const calibrations = [
    { subject: "jordan.lee@techcorp.com", raw: 4.2, calibrated: 4.0, justification: "Slightly adjusted down to align with team average. Strong performer but peer scores suggest slight leniency from manager." },
    { subject: "maya.patel@techcorp.com", raw: 3.8, calibrated: 4.0, justification: "Adjusted up — cross-team feedback indicates higher impact than reflected in Platform Team scores alone." },
    { subject: "chris.wu@techcorp.com", raw: 3.5, calibrated: 3.5, justification: "No adjustment needed. Scores consistent across all evaluators." },
  ];
  for (const cal of calibrations) {
    await prisma.calibrationAdjustment.create({
      data: {
        cycleId: cycle1.id,
        teamId: teams["Platform Team"],
        subjectId: users[cal.subject],
        adjustedBy: users["maria.santos@techcorp.com"],
        rawScore: cal.raw,
        calibratedScore: cal.calibrated,
        justification: cal.justification,
      },
    });
  }
  console.log(`  ${calibrations.length} calibration adjustments added\n`);

  // ── 7. Cycle 2: ACTIVE — Q1 2026 Review (level-resolved multi-template) ──
  console.log("7. Creating Cycle 2: Q1 2026 Review (ACTIVE, level-resolved templates)...");

  const cycle2 = await prisma.evaluationCycle.create({
    data: {
      name: "Q1 2026 Performance Review",
      companyId: company.id,
      status: CycleStatus.ACTIVE,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-03-31"),
      cachedDataKeyEncrypted: encryptedDataKey,
    },
  });

  // Platform Team — three templates that partition members by level:
  //   - tplTC      → SE L-2, SA L-2, SA L-3 (senior track)
  //   - tplJunior  → SE L-1                 (junior track)
  //   - tplMgr     → wildcard, used for upward / managerial reviews
  //   - tpl360     → wildcard, used for external reviewers
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle2.id,
      teamId: teams["Platform Team"],
      templates: {
        create: [
          { templateId: tplTC },
          { templateId: tplJunior },
          { templateId: tplMgr },
          { templateId: tpl360 },
        ],
      },
    },
  });

  // Frontend Team
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle2.id,
      teamId: teams["Frontend Team"],
      templates: {
        create: [{ templateId: tplSWE }, { templateId: tpl360 }],
      },
    },
  });

  // Engineering Management
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle2.id,
      teamId: teams["Engineering Management"],
      templates: { create: [{ templateId: tplMgr }] },
    },
  });

  // Finance Team
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle2.id,
      teamId: teams["Finance Team"],
      templates: { create: [{ templateId: tplPro }] },
    },
  });

  // HR Team
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle2.id,
      teamId: teams["HR Team"],
      templates: { create: [{ templateId: tpl360 }] },
    },
  });

  // Create mixed-status assignments for cycle 2 (some submitted, some in progress, some pending).
  // Platform Team template routing (matches the cycleTeam template attachments above):
  //   subject SE L-1   → tplJunior
  //   subject SE L-2   → tplTC       (senior track)
  //   subject SA L-3   → tplMgr      (manager template — most specific levelIds match)
  //   external reviews → tpl360      (wildcard)
  const c2Assignments: AssignmentDef[] = [
    // Platform Team — Alex (SA L-3, manager) → members
    { reviewer: "alex.rivera@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "DOWNWARD", templateId: tplTC, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "maya.patel@techcorp.com", direction: "DOWNWARD", templateId: tplJunior, status: AssignmentStatus.SUBMITTED },
    { reviewer: "alex.rivera@techcorp.com", subject: "chris.wu@techcorp.com", direction: "DOWNWARD", templateId: tplJunior, status: AssignmentStatus.IN_PROGRESS },
    // Members → Alex (upward) — subject Alex is SA L-3 manager → tplMgr
    { reviewer: "jordan.lee@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.PENDING },
    // Peer (lateral) — template chosen by subject's level
    { reviewer: "jordan.lee@techcorp.com", subject: "maya.patel@techcorp.com", direction: "LATERAL", templateId: tplJunior, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maya.patel@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "LATERAL", templateId: tplTC, status: AssignmentStatus.PENDING },
    // Self — template chosen by self's level
    { reviewer: "alex.rivera@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "jordan.lee@techcorp.com", subject: "jordan.lee@techcorp.com", direction: "SELF", templateId: tplTC, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "maya.patel@techcorp.com", subject: "maya.patel@techcorp.com", direction: "SELF", templateId: tplJunior, status: AssignmentStatus.PENDING },
    { reviewer: "chris.wu@techcorp.com", subject: "chris.wu@techcorp.com", direction: "SELF", templateId: tplJunior, status: AssignmentStatus.PENDING },
    // External — wildcard tpl360 (external reviewers don't follow level routing)
    { reviewer: "client.stakeholder@external.com", subject: "alex.rivera@techcorp.com", direction: "EXTERNAL", templateId: tpl360, status: AssignmentStatus.PENDING },
    { reviewer: "client.stakeholder@external.com", subject: "jordan.lee@techcorp.com", direction: "EXTERNAL", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    // ── Engineering Management — Sarah → architects (Cycle 2) ──
    { reviewer: "sarah.chen@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "sarah.chen@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "sarah.chen@techcorp.com", subject: "dan.kim@techcorp.com", direction: "DOWNWARD", templateId: tplMgr, status: AssignmentStatus.PENDING },
    // Engineering Management — architects → Sarah (upward)
    { reviewer: "alex.rivera@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.PENDING },
    { reviewer: "dan.kim@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "UPWARD", templateId: tplMgr, status: AssignmentStatus.PENDING },
    // Engineering Management — peer
    { reviewer: "alex.rivera@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "alex.rivera@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.PENDING },
    { reviewer: "dan.kim@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "LATERAL", templateId: tplMgr, status: AssignmentStatus.PENDING },
    // Engineering Management — self
    { reviewer: "sarah.chen@techcorp.com", subject: "sarah.chen@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.SUBMITTED },
    { reviewer: "priya.sharma@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "SELF", templateId: tplMgr, status: AssignmentStatus.PENDING },

    // ── Frontend Team — Priya → Tom, Nina (Cycle 2) ──
    { reviewer: "priya.sharma@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "priya.sharma@techcorp.com", subject: "nina.costa@techcorp.com", direction: "DOWNWARD", templateId: tplSWE, status: AssignmentStatus.PENDING },
    // Frontend Team — members → Priya (upward)
    { reviewer: "tom.zhang@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "nina.costa@techcorp.com", subject: "priya.sharma@techcorp.com", direction: "UPWARD", templateId: tplSWE, status: AssignmentStatus.PENDING },
    // Frontend Team — peer
    { reviewer: "tom.zhang@techcorp.com", subject: "nina.costa@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.SUBMITTED },
    { reviewer: "nina.costa@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "LATERAL", templateId: tplSWE, status: AssignmentStatus.PENDING },
    // Frontend Team — self
    { reviewer: "tom.zhang@techcorp.com", subject: "tom.zhang@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "nina.costa@techcorp.com", subject: "nina.costa@techcorp.com", direction: "SELF", templateId: tplSWE, status: AssignmentStatus.PENDING },

    // ── HR Team (Cycle 2) ──
    { reviewer: "maria.santos@techcorp.com", subject: "kevin.brown@techcorp.com", direction: "DOWNWARD", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maria.santos@techcorp.com", subject: "rachel.adams@techcorp.com", direction: "DOWNWARD", templateId: tpl360, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "kevin.brown@techcorp.com", subject: "maria.santos@techcorp.com", direction: "UPWARD", templateId: tpl360, status: AssignmentStatus.PENDING },
    { reviewer: "rachel.adams@techcorp.com", subject: "maria.santos@techcorp.com", direction: "UPWARD", templateId: tpl360, status: AssignmentStatus.PENDING },
    { reviewer: "kevin.brown@techcorp.com", subject: "rachel.adams@techcorp.com", direction: "LATERAL", templateId: tpl360, status: AssignmentStatus.SUBMITTED },
    { reviewer: "maria.santos@techcorp.com", subject: "maria.santos@techcorp.com", direction: "SELF", templateId: tpl360, status: AssignmentStatus.SUBMITTED },

    // Finance Team (simple mode, all tplPro)
    { reviewer: "robert.hayes@techcorp.com", subject: "lisa.park@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
    { reviewer: "emily.tran@techcorp.com", subject: "lisa.park@techcorp.com", direction: "DOWNWARD", templateId: tplPro, status: AssignmentStatus.IN_PROGRESS },
    { reviewer: "lisa.park@techcorp.com", subject: "robert.hayes@techcorp.com", direction: "UPWARD", templateId: tplPro, status: AssignmentStatus.PENDING },
    { reviewer: "lisa.park@techcorp.com", subject: "mark.jensen@techcorp.com", direction: "LATERAL", templateId: tplPro, status: AssignmentStatus.SUBMITTED },
  ];

  let c2Count = 0;
  for (const a of c2Assignments) {
    const assignment = await prisma.evaluationAssignment.create({
      data: {
        cycleId: cycle2.id,
        templateId: a.templateId,
        subjectId: users[a.subject],
        reviewerId: users[a.reviewer],
        direction: a.direction,
        status: a.status,
        token: generateToken(),
      },
    });

    if (a.status === AssignmentStatus.SUBMITTED) {
      const responseData = generateResponse(a.templateId);
      await prisma.evaluationResponse.create({
        data: {
          assignmentId: assignment.id,
          reviewerId: users[a.reviewer],
          subjectId: users[a.subject],
          answersEncrypted: responseData.encrypted,
          answersIv: responseData.iv,
          answersTag: responseData.tag,
          keyVersion: 1,
          submittedAt: new Date("2026-02-20"),
        },
      });
    }
    c2Count++;
  }
  console.log(`  Cycle 2: ${c2Count} assignments (mixed statuses: SUBMITTED/IN_PROGRESS/PENDING)\n`);

  // Create reviewer links for cycle 2
  const c2Reviewers = [
    "alex.rivera@techcorp.com",
    "jordan.lee@techcorp.com",
    "maya.patel@techcorp.com",
    "chris.wu@techcorp.com",
    "client.stakeholder@external.com",
    "robert.hayes@techcorp.com",
    "emily.tran@techcorp.com",
    "lisa.park@techcorp.com",
    "sarah.chen@techcorp.com",
    "priya.sharma@techcorp.com",
    "dan.kim@techcorp.com",
    "tom.zhang@techcorp.com",
    "nina.costa@techcorp.com",
    "maria.santos@techcorp.com",
    "kevin.brown@techcorp.com",
    "rachel.adams@techcorp.com",
  ];
  for (const email of c2Reviewers) {
    await prisma.cycleReviewerLink.create({
      data: {
        cycleId: cycle2.id,
        reviewerId: users[email],
        token: generateToken(),
      },
    });
  }
  console.log(`  ${c2Reviewers.length} reviewer links created\n`);

  // ── 8. Cycle 3: DRAFT — Q2 2026 Mid-Year (multi-template per team) ──
  console.log("8. Creating Cycle 3: Q2 2026 Mid-Year (DRAFT)...");

  const cycle3 = await prisma.evaluationCycle.create({
    data: {
      name: "Q2 2026 Mid-Year Check-in",
      companyId: company.id,
      status: CycleStatus.DRAFT,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-06-30"),
    },
  });

  // Platform Team — same level-routed pair as cycle 2
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle3.id,
      teamId: teams["Platform Team"],
      templates: {
        create: [
          { templateId: tplTC },
          { templateId: tplJunior },
          { templateId: tplMgr },
        ],
      },
    },
  });

  // Admin Team — pairs the all-levels Pro template with the Holistic 360
  // demonstration template so the routing matrix shows the "wildcard tied
  // with another wildcard" tiebreak path.
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle3.id,
      teamId: teams["Admin Team"],
      templates: {
        create: [{ templateId: tplPro }, { templateId: holisticTemplate.id }],
      },
    },
  });

  // Leadership Team — uses the Holistic 360 alone so an admin can preview
  // every direction-tagged section against a real subject.
  await prisma.cycleTeam.create({
    data: {
      cycleId: cycle3.id,
      teamId: teams["Leadership Team"],
      templates: { create: [{ templateId: holisticTemplate.id }] },
    },
  });

  console.log("  Cycle 3: 3 teams configured\n");

  // ── 9. Audit Log Entries ──
  console.log("9. Creating audit log entries...");
  const auditEntries = [
    { action: "company_created", target: `company:${company.id}`, userId: users["james.carter@techcorp.com"], metadata: { name: COMPANY_NAME } },
    { action: "encryption_setup", target: `company:${company.id}`, userId: users["james.carter@techcorp.com"], metadata: { keyVersion: 1 } },
    { action: "user_invite", target: `user:${users["sarah.chen@techcorp.com"]}`, userId: users["james.carter@techcorp.com"], metadata: { email: "sarah.chen@techcorp.com", role: "EMPLOYEE" } },
    { action: "cycle_activate", target: `cycle:${cycle1.id}`, userId: users["maria.santos@techcorp.com"], metadata: { cycleName: "Q4 2025 Performance Review" } },
    { action: "cycle_close", target: `cycle:${cycle1.id}`, userId: users["maria.santos@techcorp.com"], metadata: { cycleName: "Q4 2025 Performance Review", completionRate: 100 } },
    { action: "calibration_adjust", target: `user:${users["jordan.lee@techcorp.com"]}`, userId: users["maria.santos@techcorp.com"], metadata: { rawScore: 4.2, calibratedScore: 4.0, cycleId: cycle1.id } },
    { action: "decryption", target: `cycle:${cycle1.id}`, userId: users["james.carter@techcorp.com"], metadata: { purpose: "report_generation" } },
    { action: "cycle_activate", target: `cycle:${cycle2.id}`, userId: users["maria.santos@techcorp.com"], metadata: { cycleName: "Q1 2026 Performance Review" } },
    { action: "level_create", target: `level:${levels["SE L-1"]}`, userId: users["james.carter@techcorp.com"], metadata: { name: "SE L-1" } },
    { action: "level_create", target: `level:${levels["SE L-2"]}`, userId: users["james.carter@techcorp.com"], metadata: { name: "SE L-2" } },
    { action: "role_change", target: `user:${users["maria.santos@techcorp.com"]}`, userId: users["james.carter@techcorp.com"], metadata: { from: "EMPLOYEE", to: "HR" } },
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: entry.userId,
        action: entry.action,
        target: entry.target,
        metadata: entry.metadata,
        ip: "192.168.1.1",
      },
    });
  }
  console.log(`  ${auditEntries.length} audit log entries created\n`);

  // ── Summary ──
  console.log("=== Test Seed Complete ===\n");
  console.log("Company:", COMPANY_NAME);
  console.log("Slug:", COMPANY_SLUG);
  console.log("Encryption passphrase:", PASSPHRASE);
  console.log(`Users: ${userDefs.length} (1 ADMIN, 1 HR, ${userDefs.filter((u) => u.role === UserRole.EMPLOYEE).length} EMPLOYEE, ${userDefs.filter((u) => u.role === UserRole.EXTERNAL).length} EXTERNAL)`);
  console.log(`Levels: ${levelNames.length} (${levelNames.join(", ")})`);
  console.log(`Teams: ${teamDefs.length}`);
  console.log("Cycles:");
  console.log(`  1. Q4 2025 — CLOSED, ${c1Assignments.length} assignments (all submitted), ${calibrations.length} calibrations`);
  console.log(`  2. Q1 2026 — ACTIVE, ${c2Assignments.length} assignments (mixed), level-resolved templates`);
  console.log(`  3. Q2 2026 — DRAFT, multi-template per team`);
  console.log(`Audit logs: ${auditEntries.length}`);
  console.log("\nCoverage:");
  console.log("  - All user roles (ADMIN, HR, EMPLOYEE, EXTERNAL)");
  console.log("  - All team member roles (MANAGER, MEMBER, EXTERNAL)");
  console.log("  - Co-managed team (Finance: 2 managers)");
  console.log("  - Cross-team members (Alex in 2 teams, Sarah in 2 teams, Priya in 2 teams)");
  console.log("  - External evaluators (board advisor, client stakeholder)");
  console.log("  - Seniority levels on engineering teams");
  console.log("  - Single-template-per-team cycles");
  console.log("  - Multi-template-per-team cycles with level-resolved routing");
  console.log("  - Template-owned levelIds (TechCorp Senior + Junior tracks)");
  console.log("  - Template-owned direction weights (supervisor_focus, peer_focus)");
  console.log("  - Per-section direction tags (Junior peer-collab, Senior growth)");
  console.log("  - All five directions (DOWNWARD, UPWARD, LATERAL, SELF, EXTERNAL)");
  console.log("  - All assignment statuses (PENDING, IN_PROGRESS, SUBMITTED)");
  console.log("  - All cycle statuses (DRAFT, ACTIVE, CLOSED)");
  console.log("  - Encrypted evaluation responses");
  console.log("  - Calibration adjustments");
  console.log("  - Audit log entries");
  console.log("  - Reviewer summary links");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
