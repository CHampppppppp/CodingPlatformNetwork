#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

async function main() {
  const resources = await prisma.resource.findMany({
    select: { id: true, title: true, description: true, resourceType: true },
    orderBy: { createdAt: 'desc' }
  });

  const dimRegex = /^\[([^\]]+)\]/;
  const groups = new Map<string, typeof resources>();

  for (const r of resources) {
    const match = r.description?.match(dimRegex);
    const dim = match ? match[1] : '未分类';
    if (!groups.has(dim)) groups.set(dim, []);
    groups.get(dim)!.push(r);
  }

  console.log('资源总数:', resources.length);
  console.log('='.repeat(80));

  for (const [dim, items] of groups) {
    console.log(`\n【${dim}】`);
    console.log('-'.repeat(80));
    items.forEach((r, i) => {
      console.log(`\n${i + 1}. ID: ${r.id}`);
      console.log(`   标题: ${r.title}`);
      console.log(`   类型: ${r.resourceType}`);
      console.log(`   描述: ${r.description || '-'}`);
      console.log(`   当前URL: (待填写)`);
    });
  }

  await prisma.$disconnect();
}

main();
