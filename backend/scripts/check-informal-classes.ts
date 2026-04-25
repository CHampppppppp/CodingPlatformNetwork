import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl)
});

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'INFORMAL_LEARNING' }
  });
  if (!scenario) {
    console.log('场景不存在');
    await prisma.$disconnect();
    return;
  }

  const nodes = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Student'
    },
    select: {
      schoolId: true,
      gradeId: true,
      classId: true
    }
  });

  const schoolCounts = new Map<string, number>();
  const classCounts = new Map<string, number>();

  for (const n of nodes) {
    schoolCounts.set(n.schoolId, (schoolCounts.get(n.schoolId) || 0) + 1);
    const key = n.schoolId + '|' + n.gradeId + '|' + n.classId;
    classCounts.set(key, (classCounts.get(key) || 0) + 1);
  }

  const sizes = Array.from(classCounts.values());
  console.log('=== 数据库实际分布 ===');
  console.log(`总学生数: ${nodes.length}`);
  console.log(`涉及学校数: ${schoolCounts.size}`);
  console.log(`总班级数: ${sizes.length}`);
  console.log(`<10人: ${sizes.filter(s => s < 10).length} 班`);
  console.log(`10-19人: ${sizes.filter(s => s >= 10 && s < 20).length} 班`);
  console.log(`20-29人: ${sizes.filter(s => s >= 20 && s < 30).length} 班`);
  console.log(`30-40人: ${sizes.filter(s => s >= 30 && s <= 40).length} 班`);
  console.log(`>40人: ${sizes.filter(s => s > 40).length} 班`);

  const schoolSizes = Array.from(schoolCounts.values());
  console.log(`\n学校规模分布:`);
  console.log(`<30人: ${schoolSizes.filter(s => s < 30).length} 所`);
  console.log(`30-100人: ${schoolSizes.filter(s => s >= 30 && s < 100).length} 所`);
  console.log(`100-200人: ${schoolSizes.filter(s => s >= 100 && s < 200).length} 所`);
  console.log(`200-400人: ${schoolSizes.filter(s => s >= 200 && s < 400).length} 所`);
  console.log(`>=400人: ${schoolSizes.filter(s => s >= 400).length} 所`);

  await prisma.$disconnect();
}

main().catch(console.error);
