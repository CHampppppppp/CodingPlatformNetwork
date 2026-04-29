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

function buildSearchUrl(title: string, type: string): string {
  const encoded = encodeURIComponent(title);
  switch (type) {
    case 'VIDEO':
      return `https://search.bilibili.com/all?keyword=${encoded}`;
    case 'ARTICLE':
      return `https://www.zhihu.com/search?type=content&q=${encoded}`;
    case 'DOCUMENT':
      return `https://wenku.baidu.com/search?word=${encoded}`;
    case 'PRACTICE':
    case 'GAME':
    default:
      return `https://cn.bing.com/search?q=${encoded}`;
  }
}

async function main() {
  console.log('🚀 开始更新资源URL...\n');

  const resources = await prisma.resource.findMany({
    where: {
      OR: [
        { url: { contains: 'example.com' } },
        { url: null },
      ],
    },
    select: { id: true, title: true, resourceType: true, url: true },
  });

  console.log(`📊 需要更新的资源数: ${resources.length}`);

  let updated = 0;
  for (const resource of resources) {
    try {
      const newUrl = buildSearchUrl(resource.title, resource.resourceType);
      if (newUrl.length > 500) {
        const truncatedTitle = resource.title.substring(0, 40);
        const truncatedUrl = buildSearchUrl(truncatedTitle, resource.resourceType);
        await prisma.resource.update({
          where: { id: resource.id },
          data: { url: truncatedUrl },
        });
      } else {
        await prisma.resource.update({
          where: { id: resource.id },
          data: { url: newUrl },
        });
      }
      updated++;
      if (updated % 50 === 0) {
        console.log(`  已更新 ${updated}/${resources.length}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ 跳过资源 ${resource.id}: ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ 已更新 ${updated} 个资源的URL`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
