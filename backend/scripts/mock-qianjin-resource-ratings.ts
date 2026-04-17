import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL!) });

async function main() {
  const school = await prisma.school.findUnique({ where: { name: '杭州市钱塘区前进小学' } });
  if (!school) throw new Error('前进小学不存在');

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school.id },
    select: { id: true, displayName: true },
  });

  const resources = await prisma.resource.findMany({ select: { id: true, title: true } });

  const existingRates = await prisma.studentResourceRate.count({
    where: { studentId: { in: students.map(s => s.id) } },
  });

  if (existingRates > 0) {
    await prisma.studentResourceRate.deleteMany({
      where: { studentId: { in: students.map(s => s.id) } },
    });
    console.log('清除已有评分:', existingRates);
  }

  const shuffled = [...students].sort(() => 0.5 - Math.random());
  const activeStudents = shuffled.slice(0, Math.floor(students.length * 0.75));

  const ratings: any[] = [];
  for (const student of activeStudents) {
    const ratedCount = 10 + Math.floor(Math.random() * 15);
    const selectedResources = [...resources].sort(() => 0.5 - Math.random()).slice(0, Math.min(ratedCount, resources.length));
    for (const res of selectedResources) {
      const rate = parseFloat((2 + Math.random() * 3).toFixed(2));
      ratings.push({
        studentId: student.id,
        resourceId: res.id,
        rate,
      });
    }
  }

  const batchSize = 50;
  for (let i = 0; i < ratings.length; i += batchSize) {
    await prisma.studentResourceRate.createMany({
      data: ratings.slice(i, i + batchSize),
    });
  }

  console.log('成功写入评分:', ratings.length);
  console.log('  - 参与学生:', activeStudents.length, '/', students.length);
  console.log('  - 资源数:', resources.length);
  console.log('  - 人均评分:', (ratings.length / activeStudents.length).toFixed(1));
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
