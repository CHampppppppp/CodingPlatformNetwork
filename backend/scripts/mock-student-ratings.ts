#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const SCHOOL_NAME = '杭州市星洲小学';

async function main() {
  console.log('=== 开始生成学生对资源的评分 ===');

  const school = await prisma.school.findUnique({
    where: { name: SCHOOL_NAME },
  });
  if (!school) {
    throw new Error(`学校 ${SCHOOL_NAME} 不存在`);
  }

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school.id },
    select: { id: true, displayName: true },
  });
  console.log(`找到 ${students.length} 名学生`);

  const resources = await prisma.resource.findMany({
    select: { id: true, title: true },
  });
  console.log(`找到 ${resources.length} 个资源`);

  const ratingsData: any[] = [];
  for (const student of students) {
    const ratingCount = 3 + Math.floor(Math.random() * 5);
    const shuffled = [...resources].sort(() => 0.5 - Math.random());
    const selectedResources = shuffled.slice(0, Math.min(ratingCount, resources.length));
    
    for (const resource of selectedResources) {
      const score = Math.floor(Math.random() * 5) + 1;
      ratingsData.push({
        studentId: student.id,
        resourceId: resource.id,
        rate: score,
      });
    }
  }

  let successCount = 0;
  let skipCount = 0;
  for (const data of ratingsData) {
    try {
      await prisma.studentResourceRate.create({ data });
      successCount++;
    } catch (err: any) {
      if (err.code === 'P2002') {
        skipCount++;
      } else {
        console.error(`创建评分失败: ${err.message}`);
      }
    }
  }

  console.log(`成功创建 ${successCount} 条评分记录`);
  if (skipCount > 0) {
    console.log(`跳过 ${skipCount} 条重复记录`);
  }

  console.log('\n=== 完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
