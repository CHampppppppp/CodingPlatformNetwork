import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = ((hash << 5) - hash + 1) | 0;
    return ((hash >>> 0) % 1000) / 1000;
  };
}

// 生成符合真实情况的评分分布
function generateRating(rng: () => number, baseQuality: number): number {
  const qualityBias = (baseQuality - 0.5) * 1.5;
  const rand = rng();
  const rand2 = rng();
  const normal = Math.sqrt(-2 * Math.log(rand2)) * Math.cos(2 * Math.PI * rand);
  const score = 3 + normal * 0.8 + qualityBias;
  return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }

  console.log('=== Student Resource Ratings Generator ===\n');
  console.log('Scenario ID:', scenario.id);

  // 获取所有资源
  const resources = await prisma.resource.findMany({
    select: { id: true, resourceType: true },
  });
  console.log('Total resources:', resources.length);

  // 获取所有资源-知识点关联
  const resourceKnowledgeRelations = await prisma.resourceKnowledgeRelation.findMany({
    select: { resourceId: true, knowledgeNodeId: true },
  });

  // 建立知识点到资源的映射
  const knowledgeToResources = new Map<string, string[]>();
  for (const rk of resourceKnowledgeRelations) {
    const list = knowledgeToResources.get(rk.knowledgeNodeId) || [];
    list.push(rk.resourceId);
    knowledgeToResources.set(rk.knowledgeNodeId, list);
  }

  const knowledgeIds = Array.from(knowledgeToResources.keys());
  console.log('Knowledge nodes with resources:', knowledgeIds.length);

  // 只获取与这些知识点有关联的学生
  const studentKnowledges = await prisma.studentKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: knowledgeIds } },
    select: { studentNodeId: true, knowledgeNodeId: true },
  });

  // 建立学生到已学知识点的映射
  const studentToKnowledges = new Map<string, string[]>();
  for (const sk of studentKnowledges) {
    const list = studentToKnowledges.get(sk.studentNodeId) || [];
    list.push(sk.knowledgeNodeId);
    studentToKnowledges.set(sk.studentNodeId, list);
  }

  const studentIds = Array.from(studentToKnowledges.keys());
  console.log('Students with learned knowledges:', studentIds.length);

  // 获取已有的评分
  const existingRatings = await prisma.studentResourceRate.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, resourceId: true },
  });

  const existingRateKeys = new Set<string>();
  for (const r of existingRatings) {
    existingRateKeys.add(`${r.studentId}:${r.resourceId}`);
  }
  console.log('Existing ratings:', existingRateKeys.size);

  // 评分概率配置
  const RATE_PROBABILITY = 0.65;

  // 分批处理学生
  const BATCH_SIZE = 500;
  let totalInserted = 0;
  let totalGenerated = 0;

  console.log('\nProcessing students in batches...\n');

  for (let batchStart = 0; batchStart < studentIds.length; batchStart += BATCH_SIZE) {
    const batchStudentIds = studentIds.slice(batchStart, batchStart + BATCH_SIZE);
    const rateData: { studentId: string; resourceId: string; rate: number }[] = [];

    for (const studentId of batchStudentIds) {
      const learnedKnowledges = studentToKnowledges.get(studentId) || [];
      const rng = seededRandom(studentId + 'resource_rates');
      const studentQuality = 0.3 + rng() * 0.4;

      for (const knowledgeId of learnedKnowledges) {
        const relatedResourceIds = knowledgeToResources.get(knowledgeId) || [];

        for (const resourceId of relatedResourceIds) {
          if (existingRateKeys.has(`${studentId}:${resourceId}`)) {
            continue;
          }

          if (rng() > RATE_PROBABILITY) {
            continue;
          }

          let resourceQuality = 0.5;
          const resource = resources.find(r => r.id === resourceId);
          if (resource) {
            switch (resource.resourceType) {
              case 'VIDEO': resourceQuality = 0.6 + rng() * 0.3; break;
              case 'PRACTICE': resourceQuality = 0.5 + rng() * 0.3; break;
              case 'ARTICLE': resourceQuality = 0.4 + rng() * 0.4; break;
              case 'GAME': resourceQuality = 0.3 + rng() * 0.5; break;
              case 'DOCUMENT': resourceQuality = 0.4 + rng() * 0.4; break;
              default: resourceQuality = 0.4 + rng() * 0.3; break;
            }
          }

          const combinedQuality = (studentQuality + resourceQuality) / 2;
          const rating = generateRating(rng, combinedQuality);

          rateData.push({ studentId, resourceId, rate: rating });
        }
      }
    }

    totalGenerated += rateData.length;

    if (rateData.length > 0) {
      try {
        await prisma.studentResourceRate.createMany({
          data: rateData.map(d => ({
            studentId: d.studentId,
            resourceId: d.resourceId,
            rate: d.rate,
          })),
          skipDuplicates: true,
        });
        totalInserted += rateData.length;
      } catch (error) {
        console.error('Error inserting batch:', error);
      }
    }

    const progress = Math.min(batchStart + BATCH_SIZE, studentIds.length);
    if (progress % 5000 === 0 || batchStart + BATCH_SIZE >= studentIds.length) {
      console.log(`Progress: ${progress}/${studentIds.length} students, generated: ${totalGenerated}, inserted: ${totalInserted}`);
    }
  }

  console.log('\n=== Final Summary ===');
  console.log('Total ratings generated:', totalGenerated);
  console.log('Total ratings inserted:', totalInserted);

  const finalCount = await prisma.studentResourceRate.count();
  console.log('Total ratings in database:', finalCount);

  await prisma.$disconnect();
}

main().catch(console.error);
