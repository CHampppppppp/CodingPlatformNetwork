#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

function randomRate() {
  return Math.round((1 + Math.random() * 4) * 100) / 100;
}

function escapeCsv(value: string | number) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const school = await prisma.school.findFirst({ where: { name: { contains: '秀水' } } });
  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school?.id },
    include: { studentProfile: true }
  });

  const externalIds = students.map(s => s.studentProfile?.externalUserId).filter(Boolean) as string[];
  const externalIdToStudent = new Map(students.map(s => [s.studentProfile!.externalUserId, s]));

  const rates = await prisma.studentResourceRate.findMany({
    where: { studentId: { in: externalIds } },
    include: { resource: { select: { title: true } } }
  });

  const interactions = await prisma.interaction.findMany({
    where: {
      sourceNode: { nodeType: 'Student', schoolId: school?.id },
      targetNode: { nodeType: 'Knowledge' }
    },
    select: { sourceNodeId: true, targetNodeId: true }
  });

  const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
    select: { resourceId: true, knowledgeNodeId: true }
  });

  const studentToKnowledges = new Map<string, Set<string>>();
  for (const i of interactions) {
    if (!studentToKnowledges.has(i.sourceNodeId)) {
      studentToKnowledges.set(i.sourceNodeId, new Set());
    }
    studentToKnowledges.get(i.sourceNodeId)!.add(i.targetNodeId);
  }

  const resourceToKnowledges = new Map<string, Set<string>>();
  for (const r of resourceRelations) {
    if (!resourceToKnowledges.has(r.resourceId)) {
      resourceToKnowledges.set(r.resourceId, new Set());
    }
    resourceToKnowledges.get(r.resourceId)!.add(r.knowledgeNodeId);
  }

  const invalidRates: typeof rates = [];
  const existingRateKeys = new Set<string>();

  for (const rate of rates) {
    existingRateKeys.add(`${rate.studentId}|${rate.resourceId}`);
    const student = externalIdToStudent.get(rate.studentId);
    if (!student) {
      invalidRates.push(rate);
      continue;
    }
    const studentKnowledges = studentToKnowledges.get(student.id) || new Set();
    const resourceKnowledges = resourceToKnowledges.get(rate.resourceId) || new Set();

    let hasCommon = false;
    for (const k of resourceKnowledges) {
      if (studentKnowledges.has(k)) {
        hasCommon = true;
        break;
      }
    }

    if (!hasCommon) {
      invalidRates.push(rate);
    }
  }

  console.log(`需要置0的不合法评分: ${invalidRates.length} 条`);

  const invalidRateIds = invalidRates.map(r => r.id);

  if (invalidRates.length > 0) {
    const csvDir = path.resolve(__dirname, '../datas/script_filterd');
    fs.mkdirSync(csvDir, { recursive: true });
    const csvPath = path.join(csvDir, 'xiushui-invalid-ratings.csv');
    const header = ['id', 'studentId', 'resource', 'originalRate'].map(escapeCsv).join(',');
    const rows = invalidRates.map(r => {
      const student = externalIdToStudent.get(r.studentId);
      return [r.id, student?.displayName || r.studentId, r.resource.title, r.rate.toString()].map(escapeCsv).join(',');
    });
    fs.writeFileSync(csvPath, [header, ...rows].join('\n'), 'utf-8');
    console.log(`已导出不合法评分到: ${csvPath}`);
  }

  const resources = await prisma.resource.findMany({ select: { id: true } });
  const newRates: { studentId: string; resourceId: string; rate: number }[] = [];

  for (const student of students) {
    const studentKnowledges = studentToKnowledges.get(student.id) || new Set();
    const extId = student.studentProfile?.externalUserId;
    if (!extId) continue;
    for (const resource of resources) {
      const resourceKnowledges = resourceToKnowledges.get(resource.id) || new Set();
      let hasCommon = false;
      for (const k of resourceKnowledges) {
        if (studentKnowledges.has(k)) {
          hasCommon = true;
          break;
        }
      }
      if (hasCommon && !existingRateKeys.has(`${extId}|${resource.id}`)) {
        newRates.push({ studentId: extId, resourceId: resource.id, rate: randomRate() });
      }
    }
  }

  console.log(`需要新增的有效评分: ${newRates.length} 条`);

  if (invalidRateIds.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < invalidRateIds.length; i += batchSize) {
      const batch = invalidRateIds.slice(i, i + batchSize);
      await prisma.studentResourceRate.updateMany({
        where: { id: { in: batch } },
        data: { rate: 0 }
      });
      console.log(`已置0: ${batch.length} 条`);
    }
  }

  if (newRates.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < newRates.length; i += batchSize) {
      const batch = newRates.slice(i, i + batchSize);
      await prisma.studentResourceRate.createMany({ data: batch });
      console.log(`已新增: ${batch.length} 条`);
    }
  }

  console.log('修改完成');

  const afterRates = await prisma.studentResourceRate.findMany({
    where: { studentId: { in: externalIds } },
    select: { rate: true }
  });
  const zeroCount = afterRates.filter(r => r.rate.toNumber() === 0).length;
  const positiveCount = afterRates.filter(r => r.rate.toNumber() > 0).length;
  console.log(`修改后: 0分评分 ${zeroCount} 条, 有效评分 ${positiveCount} 条, 总计 ${afterRates.length} 条`);

  await prisma.$disconnect();
}

main().catch(console.error);
