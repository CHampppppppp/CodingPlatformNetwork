import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'SHOW_CASE' },
  });
  if (!scenario) return;

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true },
  });

  const interactions = await prisma.interaction.findMany({
    where: {
      sessionId: { in: sessions.map(s => s.id) },
      sourceNode: { scenarioId: scenario.id },
    },
    include: {
      sourceNode: {
        include: {
          studentProfile: true,
          teacherProfile: true,
          knowledgeProfile: true,
        },
      },
      targetNode: {
        include: {
          studentProfile: true,
          teacherProfile: true,
          knowledgeProfile: true,
        },
      },
    },
  });

  const nodeMap = new Map();
  for (const i of interactions) {
    nodeMap.set(i.sourceNode.id, i.sourceNode);
    nodeMap.set(i.targetNode.id, i.targetNode);
  }

  const nodes = Array.from(nodeMap.values());
  const students = nodes.filter((n: any) => n.nodeType?.toUpperCase() === 'STUDENT');
  const teachers = nodes.filter((n: any) => n.nodeType?.toUpperCase() === 'TEACHER');
  const knowledges = nodes.filter((n: any) => n.nodeType?.toUpperCase() === 'KNOWLEDGE');

  console.log(`Nodes from interactions:`);
  console.log(`  Students: ${students.length}`);
  console.log(`  Teachers: ${teachers.length}`);
  console.log(`  Knowledges: ${knowledges.length}`);

  const TEACHER_STUDENT_ACTIONS = ["TEACHER_EVALUATION", "HELP_SEEKING"];
  const filtered = interactions.filter((i) => {
    const isTS =
      (i.sourceNode.nodeType?.toUpperCase() === 'TEACHER' && i.targetNode.nodeType?.toUpperCase() === 'STUDENT') ||
      (i.sourceNode.nodeType?.toUpperCase() === 'STUDENT' && i.targetNode.nodeType?.toUpperCase() === 'TEACHER');
    return !(isTS && i.actionType && TEACHER_STUDENT_ACTIONS.includes(i.actionType));
  });

  const studentKnowledgeLinks = filtered.filter(
    (i) => i.sourceNode.nodeType?.toUpperCase() === 'STUDENT' && i.targetNode.nodeType?.toUpperCase() === 'KNOWLEDGE'
  );
  const teacherStudentLinks = filtered.filter(
    (i) => i.sourceNode.nodeType?.toUpperCase() === 'TEACHER' && i.targetNode.nodeType?.toUpperCase() === 'STUDENT'
  );

  console.log(`\nLinks after filtering:`);
  console.log(`  Student->Knowledge: ${studentKnowledgeLinks.length}`);
  console.log(`  Teacher->Student: ${teacherStudentLinks.length}`);

  const platformLinks = studentKnowledgeLinks.filter((i) => i.interactionType === 'PLATFORM');
  const physicalLinks = studentKnowledgeLinks.filter((i) => i.interactionType === 'PHYSICAL');
  console.log(`  (PLATFORM/虚线: ${platformLinks.length}, PHYSICAL/实线: ${physicalLinks.length})`);

  await prisma.$disconnect();
}

main().catch(console.error);
