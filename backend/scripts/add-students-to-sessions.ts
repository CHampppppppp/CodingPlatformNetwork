import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Chinese first names for mock data
const chineseFirstNames = [
  '伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军',
  '洋', '勇', '艳', '杰', '涛', '明', '超', '秀兰', '霞', '平',
  '刚', '桂英', '芬', '玲', '国华', '建华', '辉', '玲', '志强', '永红',
  '小明', '小红', '小华', '小刚', '小丽', '小芳', '小军', '小英', '小伟', '小杰',
];

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

  // Get all sessions with student count
  const result = await prisma.$queryRaw<{ classId: string; student_count: BigInt }[]>`
    SELECT classId, COUNT(*) as student_count 
    FROM graph_nodes_test 
    WHERE scenarioId = ${scenario.id} 
      AND nodeType = 'Student'
      AND classId IS NOT NULL
    GROUP BY classId
  `;

  const studentCountMap = new Map(result.map(r => [r.classId, Number(r.student_count)]));

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true, sessionName: true, classId: true, schoolId: true, gradeId: true },
  });

  console.log(`Total sessions: ${sessions.length}`);

  // Find sessions needing students (less than 25 students)
  const sessionsNeedingStudents = sessions.filter(s => {
    const count = studentCountMap.get(s.classId) || 0;
    return count < 25;
  });

  console.log(`Sessions needing students: ${sessionsNeedingStudents.length}\n`);

  // Target: 25-40 students per class
  const TARGET_MIN = 25;
  const TARGET_MAX = 40;

  let totalNewStudents = 0;
  let totalNewProfiles = 0;
  let totalNewInteractions = 0;
  const batchSize = 50;

  for (let i = 0; i < sessionsNeedingStudents.length; i += batchSize) {
    const batch = sessionsNeedingStudents.slice(i, i + batchSize);
    console.log(`Processing batch ${i + 1}-${Math.min(i + batchSize, sessionsNeedingStudents.length)}...`);

    for (const session of batch) {
      const currentCount = studentCountMap.get(session.classId) || 0;
      if (currentCount >= TARGET_MIN) continue;

      const targetCount = TARGET_MIN + Math.floor(seededRandom(session.id + 'target')() * (TARGET_MAX - TARGET_MIN + 1));
      const toAdd = Math.min(targetCount - currentCount, TARGET_MAX - currentCount);

      if (toAdd <= 0) continue;

      const students: { id: string; name: string; classId: string; displayName: string }[] = [];

      // Create students
      for (let j = 0; j < toAdd; j++) {
        const firstName = chineseFirstNames[Math.floor(seededRandom(session.id + j + 'fn')() * chineseFirstNames.length)];
        const lastName = faker.person.lastName();
        const name = lastName + firstName;
        const id = `stu_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        students.push({
          id,
          name,
          classId: session.classId,
          displayName: name,
        });
      }

      // Batch create graph nodes
      try {
        await prisma.graphNode.createMany({
          data: students.map(s => ({
            id: s.id,
            nodeType: 'Student',
            displayName: s.displayName,
            scenarioId: scenario.id,
            schoolId: session.schoolId,
            gradeId: session.gradeId,
            classId: s.classId,
          })),
          skipDuplicates: true,
        });

        // Create student profiles
        await prisma.studentProfile.createMany({
          data: students.map(s => ({
            nodeId: s.id,
            gender: seededRandom(s.id + 'gender')() > 0.5 ? 'M' : 'F',
            learningStyle: 'VISUAL',
          })),
          skipDuplicates: true,
        });

        totalNewStudents += students.length;
        totalNewProfiles += students.length;

        // Add student-to-student interactions
        const interactions: {
          sessionId: string;
          sourceNodeId: string;
          targetNodeId: string;
          interactionType: string;
          actionType: string;
          strength: number;
        }[] = [];

        // All existing students in this session + new ones
        const allStudentIds = [
          ...(await prisma.graphNode.findMany({
            where: { scenarioId: scenario.id, nodeType: 'Student', classId: session.classId },
            select: { id: true },
          })).map(g => g.id),
        ];

        // Add interactions between new students and existing/new students
        for (const newStudent of students) {
          for (const otherId of allStudentIds) {
            if (newStudent.id === otherId) continue;

            const rng = seededRandom(newStudent.id + otherId + session.id);
            const roll = rng();

            if (roll < 0.35) {
              interactions.push({
                sessionId: session.id,
                sourceNodeId: newStudent.id,
                targetNodeId: otherId,
                interactionType: 'SOCIAL',
                actionType: 'COMMENT',
                strength: Math.floor(rng() * 3) + 1,
              });
            } else if (roll < 0.6) {
              interactions.push({
                sessionId: session.id,
                sourceNodeId: newStudent.id,
                targetNodeId: otherId,
                interactionType: 'SOCIAL',
                actionType: 'LIKE',
                strength: Math.floor(rng() * 2) + 1,
              });
            }
          }
        }

        if (interactions.length > 0) {
          // Filter duplicates
          const existingInts = await prisma.interaction.findMany({
            where: { sessionId: session.id, interactionType: 'SOCIAL' },
            select: { sourceNodeId: true, targetNodeId: true, actionType: true },
          });
          const existingKeys = new Set(existingInts.map(i => `${i.sourceNodeId}-${i.targetNodeId}-${i.actionType}`));
          const uniqueInts = interactions.filter(i => !existingKeys.has(`${i.sourceNodeId}-${i.targetNodeId}-${i.actionType}`));

          if (uniqueInts.length > 0) {
            await prisma.interaction.createMany({ data: uniqueInts });
            totalNewInteractions += uniqueInts.length;
          }
        }

        // Update the count map
        studentCountMap.set(session.classId, currentCount + students.length);

      } catch (error: any) {
        console.error(`Error for session ${session.sessionName}:`, error.message);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total new students: ${totalNewStudents}`);
  console.log(`Total new profiles: ${totalNewProfiles}`);
  console.log(`Total new interactions: ${totalNewInteractions}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
