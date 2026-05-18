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
  if (!scenario) return;

  // Get all knowledge nodes (prioritized with resources)
  const knowledgesWithResources = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Knowledge',
      resourceRelations: { some: {} },
    },
    select: { id: true },
  });

  const knowledgesWithContent = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Knowledge',
      knowledgeProfile: { content: { not: null } },
    },
    select: { id: true },
  });

  const allKnowledges = [
    ...knowledgesWithResources,
    ...knowledgesWithContent.filter(k => !knowledgesWithResources.some(kr => kr.id === k.id))
  ];

  console.log('Knowledge nodes:', allKnowledges.length);

  // Get sessions without STUDY - use raw query for speed
  const sessionsWithStudy = await prisma.interaction.groupBy({
    by: ['sessionId'],
    where: { actionType: 'STUDY', session: { scenarioId: scenario.id } },
  });
  const sessionsWithStudyIds = new Set(sessionsWithStudy.map(s => s.sessionId));

  const allSessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true, classId: true },
  });

  const sessionsWithoutStudy = allSessions.filter(s => !sessionsWithStudyIds.has(s.id));
  console.log('Sessions to process:', sessionsWithoutStudy.length);

  // Get ALL students in one query
  console.log('Loading all students...');
  const allStudents = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Student' },
    select: { id: true, classId: true },
  });

  const studentsByClass = new Map<string, string[]>();
  for (const student of allStudents) {
    if (!student.classId) continue;
    if (!studentsByClass.has(student.classId)) {
      studentsByClass.set(student.classId, []);
    }
    studentsByClass.get(student.classId)!.push(student.id);
  }
  console.log('Loaded', allStudents.length, 'students in', studentsByClass.size, 'classes');

  // Parameters
  const MIN_SESSION_KNOWLEDGE = 3;
  const MAX_SESSION_KNOWLEDGE = 6;
  const MAX_STUDENTS = 40;
  const LEARNING_PROBABILITY = 0.75;

  let processed = 0;
  let skippedNoStudents = 0;
  let totalSKR = 0;
  let totalInteractions = 0;

  for (const session of sessionsWithoutStudy) {
    const studentIds = studentsByClass.get(session.classId!) || [];

    if (studentIds.length === 0) {
      skippedNoStudents++;
      continue;
    }

    // Cap students at MAX_STUDENTS
    let selectedStudentIds = studentIds;
    if (studentIds.length > MAX_STUDENTS) {
      const rngStudent = seededRandom(session.id + 'student_select');
      selectedStudentIds = [...studentIds].sort(() => rngStudent() - 0.5).slice(0, MAX_STUDENTS);
    }

    // Select knowledge for this session
    // 80% from knowledges with resources, 20% from all knowledges
    const rngSession = seededRandom(session.id + 'session_knowledge');
    const useResourcePool = rngSession() < 0.8;
    const knowledgePool = useResourcePool ? knowledgesWithResources : allKnowledges;
    const sessionKnowledgeCount = MIN_SESSION_KNOWLEDGE +
      Math.floor(rngSession() * (MAX_SESSION_KNOWLEDGE - MIN_SESSION_KNOWLEDGE + 1));
    const sessionKnowledges = [...knowledgePool]
      .sort(() => rngSession() - 0.5)
      .slice(0, sessionKnowledgeCount);

    // Generate SKR
    const skrData: { studentNodeId: string; knowledgeNodeId: string }[] = [];
    for (const studentId of selectedStudentIds) {
      const rng = seededRandom(session.id + studentId + 'sk');
      for (const knowledge of sessionKnowledges) {
        if (rng() < LEARNING_PROBABILITY) {
          skrData.push({ studentNodeId: studentId, knowledgeNodeId: knowledge.id });
        }
      }
    }

    if (skrData.length === 0) continue;

    // Insert SKR
    try {
      await prisma.studentKnowledgeRelation.createMany({
        data: skrData,
        skipDuplicates: true,
      });
      totalSKR += skrData.length;
    } catch (e) {
      // Ignore
    }

    // Get inserted SKR
    const insertedSKR = await prisma.studentKnowledgeRelation.findMany({
      where: {
        studentNodeId: { in: selectedStudentIds },
        knowledgeNodeId: { in: sessionKnowledges.map(k => k.id) },
      },
      select: { id: true, studentNodeId: true, knowledgeNodeId: true },
    });

    // Create interactions
    const interactionData = insertedSKR.map(skr => ({
      sessionId: session.id,
      sourceNodeId: skr.studentNodeId,
      targetNodeId: skr.knowledgeNodeId,
      interactionType: 'SOCIAL',
      actionType: 'STUDY',
      strength: 1,
      relationSourceId: skr.id,
    }));

    if (interactionData.length > 0) {
      try {
        await prisma.interaction.createMany({
          data: interactionData,
          skipDuplicates: true,
        });
        totalInteractions += interactionData.length;
      } catch (e) {
        // Ignore
      }
    }

    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed}/${sessionsWithoutStudy.length}, SKR: ${totalSKR}, Interactions: ${totalInteractions}`);
    }
  }

  console.log('\n=== Final Summary ===');
  console.log('Processed:', processed);
  console.log('Skipped (no students):', skippedNoStudents);
  console.log('Total SKR created:', totalSKR);
  console.log('Total STUDY interactions created:', totalInteractions);

  await prisma.$disconnect();
}

main().catch(console.error);