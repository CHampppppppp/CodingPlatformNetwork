import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }
  console.log('Scenario ID:', scenario.id);

  const students = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Student',
    },
    select: {
      id: true,
      name: true,
      classId: true,
    }
  });
  console.log(`\nTotal students: ${students.length}`);
  
  const byClass = new Map<string, typeof students>();
  for (const s of students) {
    if (!byClass.has(s.classId!)) byClass.set(s.classId!, []);
    byClass.get(s.classId!)!.push(s);
  }
  
  for (const [classId, classStudents] of byClass) {
    console.log(`\nClass ${classId}: ${classStudents.length} students`);
    classStudents.forEach(s => console.log(`  - ${s.id}: ${s.name}`));
  }

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });
  console.log(`\nSessions: ${sessions.length}`);

  const interactions = await prisma.interaction.findMany({
    where: { sessionId: { in: sessions.map(s => s.id) } },
  });
  console.log(`Total interactions: ${interactions.length}`);
  
  const typeCount: Record<string, number> = {};
  for (const i of interactions) {
    typeCount[i.actionType] = (typeCount[i.actionType] || 0) + 1;
  }
  console.log('By actionType:', typeCount);

  const studentIds = new Set(students.map(s => s.id));
  const studentInteractions = interactions.filter(i => 
    studentIds.has(i.sourceNodeId) && studentIds.has(i.targetNodeId)
  );
  console.log(`\nStudent-to-student interactions: ${studentInteractions.length}`);
  
  const studentTypeCount: Record<string, number> = {};
  for (const i of studentInteractions) {
    studentTypeCount[i.actionType] = (studentTypeCount[i.actionType] || 0) + 1;
  }
  console.log('Student-to-student by actionType:', studentTypeCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
