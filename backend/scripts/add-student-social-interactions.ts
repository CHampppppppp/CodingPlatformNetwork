import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = ((hash << 5) - hash + 1) | 0;
    return ((hash >>> 0) % 1000) / 1000;
  };
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }
  console.log('Scenario ID:', scenario.id);

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    orderBy: { classId: 'asc' },
  });
  console.log(`Total sessions: ${sessions.length}`);

  const allStudents = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Student',
    },
  });

  // Get existing student-to-student interactions count per session
  const existingCounts = await prisma.interaction.groupBy({
    by: ['sessionId', 'actionType'],
    where: {
      sessionId: { in: sessions.map(s => s.id) },
      sourceNodeId: { in: allStudents.map(s => s.id) },
      targetNodeId: { in: allStudents.map(s => s.id) },
    },
    _count: { id: true },
  });

  // Build map: sessionId -> count
  const sessionStudentInteractionCount = new Map<string, number>();
  for (const row of existingCounts) {
    const current = sessionStudentInteractionCount.get(row.sessionId) || 0;
    sessionStudentInteractionCount.set(row.sessionId, current + row._count.id);
  }

  // Calculate interaction deficit (how many we need to add to reach target of ~100 per session)
  const TARGET_PER_SESSION = 100;
  const sessionDeficit: { sessionId: string; deficit: number; classId: string }[] = [];
  for (const session of sessions) {
    const current = sessionStudentInteractionCount.get(session.id) || 0;
    const deficit = Math.max(0, TARGET_PER_SESSION - current);
    sessionDeficit.push({ sessionId: session.id, deficit, classId: session.classId! });
  }

  // Sort by deficit descending (prioritize sessions with fewer interactions)
  sessionDeficit.sort((a, b) => b.deficit - a.deficit);

  console.log('\nSession interaction deficit:');
  for (const s of sessionDeficit) {
    const current = sessionStudentInteractionCount.get(s.sessionId) || 0;
    console.log(`  Class ${s.classId}: current=${current}, need=${s.deficit}`);
  }

  let totalNewInteractions = 0;
  let totalComment = 0;
  let totalLike = 0;

  // Process sessions in order of deficit
  for (const { sessionId, deficit } of sessionDeficit) {
    const session = sessions.find(s => s.id === sessionId)!;
    const studentsInClass = allStudents.filter(s => s.classId === session.classId);

    if (studentsInClass.length < 2) continue;
    if (deficit === 0) continue;

    const newInteractions: {
      sessionId: string;
      sourceNodeId: string;
      targetNodeId: string;
      interactionType: string;
      actionType: string;
      strength: number;
    }[] = [];

    // Calculate how many interactions to generate based on deficit
    // Each pair of students can have up to 2 interactions (A->B and B->A)
    // We'll target the deficit by randomly generating interactions
    const maxPairs = studentsInClass.length * (studentsInClass.length - 1);
    const targetCount = Math.min(deficit, maxPairs * 2);

    // Generate interactions
    const rngBase = seededRandom(sessionId + 'social_seed');
    let generated = 0;
    let attempts = 0;
    const maxAttempts = targetCount * 3;
    const batchKeys = new Set<string>();

    while (generated < targetCount && attempts < maxAttempts) {
      attempts++;
      const rng = seededRandom(sessionId + 'social_' + generated + '_' + attempts);

      const sourceIdx = Math.floor(rng() * studentsInClass.length);
      const targetIdx = Math.floor(rng() * studentsInClass.length);
      if (sourceIdx === targetIdx) continue;

      const source = studentsInClass[sourceIdx];
      const target = studentsInClass[targetIdx];
      const actionType = rng() < 0.55 ? 'COMMENT' : 'LIKE';

      const key = `${source.id}-${target.id}-${actionType}`;
      if (batchKeys.has(key)) continue;
      batchKeys.add(key);

      newInteractions.push({
        sessionId,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        interactionType: 'SOCIAL',
        actionType,
        strength: Math.floor(rng() * 3) + 1,
      });
      generated++;
    }

    // Remove duplicates that already exist in DB
    const existingInteractions = await prisma.interaction.findMany({
      where: { sessionId, interactionType: 'SOCIAL' },
      select: { sourceNodeId: true, targetNodeId: true, actionType: true },
    });

    const existingKeys = new Set(
      existingInteractions.map(i => `${i.sourceNodeId}-${i.targetNodeId}-${i.actionType}`)
    );

    const uniqueNew = newInteractions.filter(
      i => !existingKeys.has(`${i.sourceNodeId}-${i.targetNodeId}-${i.actionType}`)
    );

    if (uniqueNew.length > 0) {
      await prisma.interaction.createMany({ data: uniqueNew });
    }

    const commentCount = uniqueNew.filter(i => i.actionType === 'COMMENT').length;
    const likeCount = uniqueNew.filter(i => i.actionType === 'LIKE').length;
    totalComment += commentCount;
    totalLike += likeCount;
    totalNewInteractions += uniqueNew.length;

    console.log(
      `Session "${session.sessionName}" (class ${session.classId}): ` +
        `added COMMENT=${commentCount}, LIKE=${likeCount} (total=${uniqueNew.length})`
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Total new COMMENT interactions: ${totalComment}`);
  console.log(`Total new LIKE interactions: ${totalLike}`);
  console.log(`Total new interactions: ${totalNewInteractions}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());