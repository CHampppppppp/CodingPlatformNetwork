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

const KEEP_PER_DIMENSION = 2; // 每个维度保留的资源数

async function main() {
  try {
    console.log('🧹 开始清理教学资源...\n');

    // 1. 查询所有资源
    const allResources = await prisma.resource.findMany({
      select: { id: true, title: true, description: true },
    });
    console.log(`📊 资源总数: ${allResources.length}`);

    // 2. 按维度分组
    const dimensionGroups = new Map<string, typeof allResources>();
    const nonDimensionResources: typeof allResources = [];

    const dimensionRegex = /^\[([^\]]+)\]/;

    for (const resource of allResources) {
      const match = resource.description?.match(dimensionRegex);
      if (match) {
        const dimName = match[1].trim();
        if (!dimensionGroups.has(dimName)) {
          dimensionGroups.set(dimName, []);
        }
        dimensionGroups.get(dimName)!.push(resource);
      } else {
        nonDimensionResources.push(resource);
      }
    }

    console.log(`📦 维度资源组数: ${dimensionGroups.size}`);
    console.log(`📦 非维度资源数: ${nonDimensionResources.length}\n`);

    // 3. 收集要保留的资源ID
    const keepIds = new Set<string>();

    for (const [dimName, resources] of dimensionGroups) {
      // 保留前 KEEP_PER_DIMENSION 个
      const keep = resources.slice(0, KEEP_PER_DIMENSION);
      for (const r of keep) {
        keepIds.add(r.id);
      }
      console.log(`  ✅ [${dimName}]: ${resources.length} → ${keep.length}`);
    }

    // 4. 收集要删除的资源ID（包括非维度资源）
    const deleteIds = allResources
      .filter((r) => !keepIds.has(r.id))
      .map((r) => r.id);

    console.log(`\n🗑️  将删除资源: ${deleteIds.length} 个`);
    console.log(`💾 将保留资源: ${keepIds.size} 个`);

    if (deleteIds.length === 0) {
      console.log('\n✅ 无需清理');
      return;
    }

    // 5. 批量删除（级联删除关联的评分和知识点关系）
    const BATCH_SIZE = 100;
    let deletedCount = 0;

    for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
      const batch = deleteIds.slice(i, i + BATCH_SIZE);
      const result = await prisma.resource.deleteMany({
        where: { id: { in: batch } },
      });
      deletedCount += result.count;
      console.log(`  已删除 ${deletedCount}/${deleteIds.length}`);
    }

    // 6. 验证结果
    const remainingCount = await prisma.resource.count();
    const remainingRelations = await prisma.resourceKnowledgeRelation.count();
    const remainingRates = await prisma.studentResourceRate.count();

    console.log(`\n📊 清理后统计:`);
    console.log(`  - 资源: ${remainingCount}`);
    console.log(`  - 资源-知识点关联: ${remainingRelations}`);
    console.log(`  - 学生评分: ${remainingRates}`);

    console.log('\n✅ 清理完成!');
  } catch (error) {
    console.error('\n❌ 清理失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
