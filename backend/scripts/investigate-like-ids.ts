#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

async function main() {
  console.log('🔍 调查不匹配的 likeDetails ID 格式...\n');

  const studentNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: { id: true, displayName: true }
  });

  const studentIdSet = new Set(studentNodes.map((n: any) => n.id));

  const works = await prisma.studentWork.findMany({
    where: { likeDetails: { not: null } },
    select: { likeDetails: true },
    take: 50
  });

  let skippedIds: string[] = [];
  for (const work of works) {
    if (work.likeDetails) {
      const ids = work.likeDetails.split(';').map((s: string) => s.trim()).filter(Boolean);
      for (const id of ids) {
        if (!studentIdSet.has(id)) {
          skippedIds.push(id);
        }
      }
    }
  }

  console.log('不匹配的 ID 示例（前20个）:');
  skippedIds.slice(0, 20).forEach((id, i) => {
    console.log(`  [${i+1}] ${id} (长度: ${id.length})`);
  });

  console.log('\n检查这些 ID 是否对应 student_profiles 的 externalUserId...');
  const sampleIds = skippedIds.slice(0, 10);
  for (const id of sampleIds) {
    const profile = await prisma.studentProfile.findFirst({
      where: { externalUserId: id },
      select: { nodeId: true, externalUserId: true }
    });
    if (profile) {
      console.log(`  ${id} -> 匹配到 studentProfile, nodeId=${profile.nodeId}`);
    }
  }

  console.log('\n检查 likeDetails 中是否混有其他格式...');
  const allIds = works.flatMap((w: any) => 
    (w.likeDetails || '').split(';').map((s: string) => s.trim()).filter(Boolean)
  );
  const uniqueIds = [...new Set(allIds)];
  console.log(`总唯一ID数: ${uniqueIds.length}`);
  console.log(`匹配到学生的ID数: ${uniqueIds.filter((id: string) => studentIdSet.has(id)).length}`);
  console.log(`不匹配学生的ID数: ${uniqueIds.filter((id: string) => !studentIdSet.has(id)).length}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
