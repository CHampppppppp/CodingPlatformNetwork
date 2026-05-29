import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });

  const totalStudents = await prisma.graphNode.count({
    where: { nodeType: 'Student', scenarioId: scenario?.id }
  });

  const ratedStudents = await prisma.studentResourceRate.groupBy({
    by: ['studentId'],
  });

  const studentsWithKnowledge = await prisma.studentKnowledgeRelation.groupBy({
    by: ['studentNodeId'],
  });

  console.log('ONLINE_COURSE 总学生数:', totalStudents);
  console.log('有知识点关联的学生数:', studentsWithKnowledge.length);
  console.log('评价过资源的学生数:', ratedStudents.length);
  console.log('评价率:', ((ratedStudents.length / studentsWithKnowledge.length) * 100).toFixed(1) + '%');

  await prisma.$disconnect();
}

main().catch(console.error);
