#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  const ratesPath = path.resolve(__dirname, '../datas/scripts_filterd/resource-student-rates.json');
  const allRates = fs.existsSync(ratesPath) ? JSON.parse(fs.readFileSync(ratesPath, 'utf-8')) : {};

  const resources = await prisma.resource.findMany({
    include: { knowledgeRelations: { include: { knowledgeNode: { select: { displayName: true } } } } },
  });

  console.log(`数据库资源数: ${resources.length}`);
  console.log(`JSON评分条目数: ${Object.keys(allRates).length}`);
  console.log('\n资源匹配诊断:');
  console.log('─'.repeat(100));

  for (const r of resources) {
    const urlMatch = r.url ? allRates[r.url] : undefined;
    const textBookKey = Object.keys(allRates).find((key) =>
      key.startsWith('__TEXTBOOK__') && r.title && r.title.includes(key.replace('__TEXTBOOK__', '')),
    );
    const descMatch = Object.keys(allRates).find((key) =>
      key.startsWith('__TEXTBOOK__') && r.description && r.description.includes(key.replace('__TEXTBOOK__', '')),
    );

    const matchedRates: Record<string, number> = {};
    if (urlMatch) Object.assign(matchedRates, urlMatch);
    if (textBookKey) Object.assign(matchedRates, allRates[textBookKey]);
    if (descMatch && descMatch !== textBookKey) Object.assign(matchedRates, allRates[descMatch]);

    const rateValues = Object.values(matchedRates);
    const avgRate = rateValues.length > 0 
      ? (rateValues.reduce((a: number, b: number) => a + b, 0) / rateValues.length).toFixed(2)
      : '无评分';

    const matchSource = urlMatch ? 'url' : textBookKey ? 'title' : descMatch ? 'description' : 'none';

    console.log(`\n资源: ${r.title}`);
    console.log(`  url: ${r.url || '(空)'}`);
    console.log(`  description: ${r.description || '(空)'}`);
    console.log(`  匹配来源: ${matchSource}`);
    console.log(`  评分学生数: ${rateValues.length}`);
    console.log(`  平均分: ${avgRate}`);
    if (rateValues.length > 0) {
      console.log(`  接受度%: ${Math.round((Number(avgRate) / 5) * 100)}%`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
