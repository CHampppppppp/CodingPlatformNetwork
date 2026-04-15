import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const adapter = new PrismaMssql(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  const missingProfiles = await prisma.studentProfile.findMany({
    where: { externalUserId: null },
    select: { nodeId: true },
  });

  console.log(`找到 ${missingProfiles.length} 个缺少 externalUserId 的学生节点`);

  let updatedCount = 0;
  for (const profile of missingProfiles) {
    await prisma.studentProfile.update({
      where: { nodeId: profile.nodeId },
      data: { externalUserId: randomUUID().replace(/-/g, '') },
    });
    updatedCount++;
  }

  console.log(`✅ 已为 ${updatedCount} 个学生节点生成 externalUserId`);
  await prisma.$disconnect();
})();
