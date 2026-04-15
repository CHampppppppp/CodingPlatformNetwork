#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  const csvPath = path.resolve(__dirname, '../datas/script_filterd/问卷_后测_作品_点赞_姓名_埋点_共同学生.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  const dataRows = records.slice(1);

  const nameToUserId = new Map<string, string>();
  for (const row of dataRows) {
    const name = row[0]?.trim();
    const userId = row[2]?.trim();
    if (name && userId) {
      nameToUserId.set(name, userId);
    }
  }

  console.log(`📄 CSV 中解析到 ${nameToUserId.size} 个学生姓名与 user_id 映射`);

  let updatedCount = 0;
  let notFoundCount = 0;

  for (const [name, userId] of nameToUserId.entries()) {
    const studentNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        displayName: name,
      },
      select: { id: true },
    });

    if (studentNodes.length === 0) {
      console.warn(`⚠️ 未找到学生节点: ${name}`);
      notFoundCount++;
      continue;
    }

    for (const node of studentNodes) {
      await prisma.studentProfile.update({
        where: { nodeId: node.id },
        data: { externalUserId: userId },
      });
      updatedCount++;
    }
  }

  console.log(`\n✅ 同步完成`);
  console.log(`   更新学生节点数: ${updatedCount}`);
  console.log(`   未找到节点数: ${notFoundCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ 同步失败:', err);
  process.exit(1);
});
