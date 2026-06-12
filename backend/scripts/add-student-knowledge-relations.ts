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

  // Find sessions without STUDY interactions
  const sessionsWithStudy = await prisma.interaction.groupBy({
    by: ['sessionId'],
    where: { actionType: 'STUDY', session: { scenarioId: scenario.id } },
  });
  const sessionsWithStudyIds = new Set(sessionsWithStudy.map(s => s.sessionId));

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true, classId: true, gradeId: true, schoolId: true, sessionName: true },
  });

  const sessionWithoutStudy = sessions.find(s => !sessionsWithStudyIds.has(s.id));
  if (!sessionWithoutStudy) {
    console.log('All sessions already have STUDY interactions');
    return;
  }

  const session = sessionWithoutStudy;
  console.log('Testing with session:', session.sessionName);
  console.log('Session ID:', session.id);
  console.log('Class ID:', session.classId);

  // Get students in this session's class
  const students = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Student', classId: session.classId },
    select: { id: true },
  });
  console.log('Students found:', students.length);

  // Get knowledge nodes that have content (via knowledgeProfile)
  const allKnowledges = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Knowledge',
      knowledgeProfile: { content: { not: null } },
    },
    select: { id: true },
  });
  console.log('Available knowledge nodes with content:', allKnowledges.length);

  if (students.length === 0 || allKnowledges.length === 0) {
    console.log('No students or knowledge nodes found');
    return;
  }

  // Step 1: Select 3-6 knowledge nodes for this session
  const MIN_SESSION_KNOWLEDGE = 3;
  const MAX_SESSION_KNOWLEDGE = 6;
  const rngSession = seededRandom(session.id + 'session_knowledge');
  const sessionKnowledgeCount = MIN_SESSION_KNOWLEDGE + Math.floor(rngSession() * (MAX_SESSION_KNOWLEDGE - MIN_SESSION_KNOWLEDGE + 1));

  const sessionKnowledges = [...allKnowledges]
    .sort(() => rngSession() - 0.5)
    .slice(0, sessionKnowledgeCount);

  console.log('Selected session knowledge nodes:', sessionKnowledges.length);

  // Step 2: Each student studies each knowledge with 75% probability
  const LEARNING_PROBABILITY = 0.75;

  const skrData: { studentNodeId: string; knowledgeNodeId: string }[] = [];
  const interactionData: {
    sessionId: string;
    sourceNodeId: string;
    targetNodeId: string;
    interactionType: string;
    actionType: string;
    strength: number;
    relationSourceId: string;
  }[] = [];

  const studentKnowledgeCounts: number[] = [];

  for (const student of students) {
    const rng = seededRandom(session.id + student.id + 'sk');
    let knowledgeCount = 0;

    for (const knowledge of sessionKnowledges) {
      if (rng() < LEARNING_PROBABILITY) {
        skrData.push({
          studentNodeId: student.id,
          knowledgeNodeId: knowledge.id,
        });
        knowledgeCount++;
      }
    }
    studentKnowledgeCounts.push(knowledgeCount);
  }

  const totalRelations = skrData.length;
  const density = ((totalRelations / (students.length * sessionKnowledges.length)) * 100).toFixed(0);

  console.log('\n=== Distribution Summary ===');
  console.log('Total SKR:', totalRelations);
  console.log('Average per student:', (totalRelations / students.length).toFixed(1));
  console.log('Density:', density + '%');

  // Knowledge count distribution
  const dist = new Map<number, number>();
  for (const c of studentKnowledgeCounts) {
    dist.set(c, (dist.get(c) || 0) + 1);
  }
  console.log('\nKnowledge count distribution:');
  for (let i = 0; i <= sessionKnowledges.length; i++) {
    const count = dist.get(i) || 0;
    if (count > 0) {
      console.log(`  ${i} knowledge(s): ${count} students (${((count / students.length) * 100).toFixed(0)}%)`);
    }
  }

  // Insert SKR data
  console.log('\nInserting student-knowledge relations...');
  for (let i = 0; i < skrData.length; i += 100) {
    const batch = skrData.slice(i, i + 100);
    await prisma.studentKnowledgeRelation.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }
  console.log('Inserted SKR records:', skrData.length);

  // Create STUDY interactions
  console.log('\nCreating STUDY interactions...');
  const insertedRelations = await prisma.studentKnowledgeRelation.findMany({
    where: {
      studentNodeId: { in: students.map(s => s.id) },
      knowledgeNodeId: { in: sessionKnowledges.map(k => k.id) },
    },
    select: { id: true, studentNodeId: true, knowledgeNodeId: true },
  });

  console.log('Found', insertedRelations.length, 'SKR records');

  for (const relation of insertedRelations) {
    interactionData.push({
      sessionId: session.id,
      sourceNodeId: relation.studentNodeId,
      targetNodeId: relation.knowledgeNodeId,
      interactionType: 'SOCIAL',
      actionType: 'STUDY',
      strength: 1,
      relationSourceId: relation.id,
    });
  }

  // Insert interactions
  for (let i = 0; i < interactionData.length; i += 500) {
    const batch = interactionData.slice(i, i + 500);
    await prisma.interaction.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }
  console.log('Inserted STUDY interactions:', interactionData.length);

  // Final counts
  const finalInteractions = await prisma.interaction.count({
    where: { sessionId: session.id, actionType: 'STUDY' },
  });

  console.log('\n=== Test Session Summary ===');
  console.log('Final STUDY interactions:', finalInteractions);

  await prisma.$disconnect();
}

main().catch(console.error);