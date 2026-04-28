import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

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

const SCENARIO_ID = 'cmnzi1r1j0000378ombpr6x7z';
const SESSION_ID = 'cmoh0jbd40003jx8ocwkn3nc7';

async function main() {
  try {
    console.log('🚀 开始导入学生间连线关系...\n');

    const students = await prisma.graphNode.findMany({
      where: {
        scenarioId: SCENARIO_ID,
        nodeType: 'Student',
      },
      select: {
        id: true,
        displayName: true,
      },
    });

    const nameToIdMap = new Map(students.map(s => [s.displayName, s.id]));
    console.log(`📊 加载了 ${students.length} 个学生节点`);

    const csvPath = path.resolve(__dirname, '../datas/4.27/学生连线关系_融合版.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    }) as Array<{
      sourceNode: string;
      targetNode: string;
      interactionType: string;
      actionType: string;
      strength: string;
      interactionCount: string;
    }>;

    console.log(`📖 读取到 ${records.length} 条连线关系`);

    const interactions = [];
    let skipCount = 0;

    for (const record of records) {
      const sourceId = nameToIdMap.get(record.sourceNode);
      const targetId = nameToIdMap.get(record.targetNode);

      if (!sourceId || !targetId) {
        skipCount++;
        continue;
      }

      interactions.push({
        interactionType: record.interactionType,
        actionType: record.actionType || null,
        sessionId: SESSION_ID,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        strength: parseFloat(record.strength) || 1.0,
      });
    }

    if (skipCount > 0) {
      console.log(`⚠️ 跳过 ${skipCount} 条无法映射的连线`);
    }

    await prisma.interaction.createMany({
      data: interactions,
    });

    console.log(`✅ 成功导入 ${interactions.length} 条连线关系`);
    console.log(`\n📊 统计:`);
    console.log(`  - 总记录: ${records.length}`);
    console.log(`  - 成功导入: ${interactions.length}`);
    console.log(`  - 跳过: ${skipCount}`);

  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
