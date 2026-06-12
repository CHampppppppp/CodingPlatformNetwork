import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== Rating Data Check ===\n');

  const count = await prisma.studentResourceRate.count();
  console.log('Total ratings:', count);

  const avgRate = await prisma.studentResourceRate.aggregate({
    _avg: { rate: true },
    _min: { rate: true },
    _max: { rate: true },
  });
  console.log('Average rate:', Number(avgRate._avg?.rate || 0).toFixed(2));
  console.log('Min rate:', Number(avgRate._min?.rate || 0).toFixed(1));
  console.log('Max rate:', Number(avgRate._max?.rate || 0).toFixed(1));

  // 按评分区间统计
  const ranges = [
    { label: '1.0-1.9', min: 1, max: 1.9 },
    { label: '2.0-2.9', min: 2, max: 2.9 },
    { label: '3.0-3.9', min: 3, max: 3.9 },
    { label: '4.0-4.9', min: 4, max: 4.9 },
    { label: '5.0', min: 5, max: 5 },
  ];

  console.log('\nRating distribution:');
  for (const range of ranges) {
    const c = await prisma.studentResourceRate.count({
      where: { rate: { gte: range.min, lte: range.max } },
    });
    const pct = ((c / count) * 100).toFixed(1);
    console.log(`  ${range.label}: ${c.toString().padStart(6)} (${pct}%)`);
  }

  // 评分用户数
  const ratedStudents = await prisma.studentResourceRate.groupBy({
    by: ['studentId'],
    _count: true,
  });
  console.log('\nStudents who rated:', ratedStudents.length);

  // 被评资源数
  const ratedResources = await prisma.studentResourceRate.groupBy({
    by: ['resourceId'],
    _count: true,
  });
  console.log('Resources rated:', ratedResources.length);

  await prisma.$disconnect();
}

main().catch(console.error);
