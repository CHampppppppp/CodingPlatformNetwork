import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

async function main() {
  const studentNodes = await prisma.graphNode.count({ where: { nodeType: 'Student' } });
  const profiles = await prisma.studentProfile.count();
  const profilesWithSurvey = await prisma.studentProfile.count({
    where: { gender: { not: null } }
  });
  
  console.log('学生节点总数:', studentNodes);
  console.log('student_profiles 总数:', profiles);
  console.log('有问卷数据的 profiles:', profilesWithSurvey);
  console.log('差值(无profile的学生):', studentNodes - profiles);
  
  if (studentNodes > profiles) {
    const students = await prisma.graphNode.findMany({
      where: { nodeType: 'Student' },
      select: { id: true },
    });
    const studentIds = students.map(function(s: any) { return s.id; });
    const existingProfiles = await prisma.studentProfile.findMany({
      where: { nodeId: { in: studentIds } },
      select: { nodeId: true }
    });
    const existingIds = new Set(existingProfiles.map(function(p: any) { return p.nodeId; }));
    const missingIds = studentIds.filter(function(id: any) { return !existingIds.has(id); });
    console.log('无profile的学生数量:', missingIds.length);
    console.log('示例:', missingIds.slice(0, 5));
  }
}

main().finally(function() { prisma.$disconnect(); });
