import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/champ/Documents/CodingPlatformNetwork/backend/.env' });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// 找出需要删除的重复资源 ID（保留 id 较旧/较小的，删除 markdown 格式 URL 的）
async function main() {
  // 查找所有重复 title
  const duplicates = await prisma.$queryRaw<{ title: string; count: bigint }[]>`
    SELECT title, COUNT(*) as count
    FROM resources_test
    GROUP BY title
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;

  console.log(`Found ${duplicates.length} titles with duplicates`);

  const toDelete: string[] = [];
  const toKeep: Map<string, string> = new Map(); // title -> keepId

  for (const { title } of duplicates) {
    const resources = await prisma.resource.findMany({
      where: { title },
      orderBy: { id: 'asc' },
    });

    let goodId: string | null = null;
    let badId: string | null = null;

    for (const r of resources) {
      if (r.url && r.url.startsWith('[')) {
        badId = r.id;
      } else {
        goodId = r.id;
      }
    }

    if (goodId && badId) {
      console.log(`Keep ${goodId}, delete ${badId} (${title})`);
      toDelete.push(badId);
      toKeep.set(title, goodId);
    }
  }

  console.log(`\nTotal to delete: ${toDelete.length}`);

  if (toDelete.length > 0) {
    // 迁移 ResourceKnowledgeRelation
    for (const [title, keepId] of toKeep) {
      const badId = toDelete[Array.from(toKeep.keys()).indexOf(title)];
      if (!badId) continue;

      const relCount = await prisma.resourceKnowledgeRelation.count({
        where: { resourceId: badId },
      });
      if (relCount > 0) {
        await prisma.resourceKnowledgeRelation.updateMany({
          where: { resourceId: badId },
          data: { resourceId: keepId },
        });
        console.log(`Migrated ${relCount} ResourceKnowledgeRelation from ${badId} to ${keepId}`);
      }
    }

    // 迁移 StudentResourceRate - 如果目标已有评分则删除重复的
    for (const [title, keepId] of toKeep) {
      const badId = toDelete[Array.from(toKeep.keys()).indexOf(title)];
      if (!badId) continue;

      const badRates = await prisma.studentResourceRate.findMany({
        where: { resourceId: badId },
      });

      for (const badRate of badRates) {
        const existing = await prisma.studentResourceRate.findUnique({
          where: {
            studentId_resourceId: {
              studentId: badRate.studentId,
              resourceId: keepId,
            },
          },
        });

        if (existing) {
          // 目标已有评分，删除重复的
          await prisma.studentResourceRate.delete({
            where: { id: badRate.id },
          });
        } else {
          // 迁移到目标
          await prisma.studentResourceRate.update({
            where: { id: badRate.id },
            data: { resourceId: keepId },
          });
        }
      }
      console.log(`Migrated/deleted StudentResourceRate for ${badId} -> ${keepId}`);
    }

    // 删除重复资源
    await prisma.resource.deleteMany({ where: { id: { in: toDelete } } });
    console.log('\nDeleted duplicates successfully');

    // 验证
    const remaining = await prisma.resource.count();
    console.log(`Remaining resources: ${remaining}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
