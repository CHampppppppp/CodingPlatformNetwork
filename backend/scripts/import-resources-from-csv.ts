import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

interface ResourceCSVRow {
  content: string;
  code: string;
  知识点: string;
  主要的知识点: string;
  视频链接: string;
  教材页码: string;
  content_id: string;
  knowledge_id: string;
  id: string;
  name: string;
  creater_id: string;
  permission_level: string;
  create_time: string;
  update_time: string;
  view_count: string;
}

// Simple CSV parser that handles quoted fields with commas
function parseCSVSmart(content: string): ResourceCSVRow[] {
  const rows: ResourceCSVRow[] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let fieldCount = 0;
  const headerLength = 27; // Expected number of columns

  // Remove BOM if present
  const cleanContent = content.replace(/^﻿/, '');

  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    const nextChar = cleanContent[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim());
      currentField = '';
      fieldCount++;

      // Check if we've collected enough fields for this row
      if (fieldCount === headerLength - 1) {
        // Last field (view_count) - collect rest of line
        // Find end of line (newline not inside quotes)
        let endPos = i + 1;
        while (endPos < cleanContent.length) {
          if (cleanContent[endPos] === '\n' && !inQuotes) break;
          if (cleanContent[endPos] === '"') inQuotes = !inQuotes;
          endPos++;
        }
        currentRow.push(currentField.trim());
        rows.push(parseRow(currentRow));
        currentRow = [];
        currentField = '';
        fieldCount = 0;
        i = endPos;
        continue;
      }
    } else if (char === '\n' && !inQuotes) {
      // New line not inside quotes - end of row
      if (fieldCount > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.length >= 23) {
          rows.push(parseRow(currentRow));
        }
        currentRow = [];
        currentField = '';
        fieldCount = 0;
      }
    } else {
      currentField += char;
    }
  }

  // Handle last row if exists
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length >= 23) {
      rows.push(parseRow(currentRow));
    }
  }

  return rows;
}

function parseRow(values: string[]): ResourceCSVRow {
  return {
    content: (values[0] || '').replace(/^"|"$/g, ''),
    code: (values[1] || '').replace(/^"|"$/g, ''),
    知识点: (values[2] || '').replace(/^"|"$/g, ''),
    主要的知识点: (values[3] || '').replace(/^"|"$/g, ''),
    视频链接: (values[16] || '').replace(/^"|"$/g, ''),
    教材页码: (values[17] || '').replace(/^"|"$/g, ''),
    content_id: (values[18] || '').replace(/^"|"$/g, ''),
    knowledge_id: (values[19] || '').replace(/^"|"$/g, ''),
    id: (values[20] || '').replace(/^"|"$/g, ''),
    creater_id: (values[21] || '').replace(/^"|"$/g, ''),
    name: (values[22] || '').replace(/^"|"$/g, ''),
    permission_level: (values[23] || '').replace(/^"|"$/g, ''),
    create_time: (values[24] || '').replace(/^"|"$/g, ''),
    update_time: (values[25] || '').replace(/^"|"$/g, ''),
    view_count: (values[26] || '0').replace(/^"|"$/g, ''),
  };
}

async function main() {
  const csvPath = path.resolve(__dirname, '../datas/ONLINE_COURSE_resources.csv');

  if (!fs.existsSync(csvPath)) {
    console.log('CSV file not found:', csvPath);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const resourceData = parseCSVSmart(csvContent);

  console.log('Parsed', resourceData.length, 'resource records from CSV');

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }

  // ===== Step 1: Extract and insert knowledge points =====
  console.log('\n=== Step 1: Importing knowledge points ===');

  const knowledgeNames = new Set<string>();
  for (const row of resourceData) {
    const knames = row.知识点.split('、').map(k => k.trim()).filter(k => k.length > 0 && k !== '暂无');
    for (const name of knames) {
      knowledgeNames.add(name);
    }
  }
  console.log('Unique knowledge names found:', knowledgeNames.size);

  const existingKnowledges = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    select: { id: true, displayName: true },
  });
  const existingMap = new Map(existingKnowledges.map(k => [k.displayName, k.id]));
  console.log('Existing knowledge nodes:', existingKnowledges.length);

  let newKnowledgeCount = 0;
  const knowledgeNodeIds = new Map<string, string>();

  for (const name of knowledgeNames) {
    if (existingMap.has(name)) {
      knowledgeNodeIds.set(name, existingMap.get(name)!);
    } else {
      const newNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Knowledge',
          displayName: name,
          scenarioId: scenario.id,
          schoolId: null,
          gradeId: null,
          classId: null,
        },
      });
      knowledgeNodeIds.set(name, newNode.id);
      newKnowledgeCount++;
    }
  }
  console.log('Created', newKnowledgeCount, 'new knowledge nodes');
  console.log('Total knowledge nodes now:', knowledgeNodeIds.size);

  for (const [name, nodeId] of knowledgeNodeIds) {
    const existing = await prisma.knowledgeProfile.findUnique({ where: { nodeId } });
    if (!existing) {
      await prisma.knowledgeProfile.create({
        data: {
          nodeId,
          content: '',
          knowledgeType: 'TEACHING',
          category: '',
        },
      });
    }
  }
  console.log('Knowledge profiles ensured for all nodes');

  // ===== Step 2: Extract and insert resources =====
  console.log('\n=== Step 2: Importing resources ===');

  const validResources = resourceData.filter(r => r.id.length > 0);
  console.log('Valid resources:', validResources.length);

  let resourceCount = 0;
  const resourceIdMap = new Map<string, string>();

  for (const row of validResources) {
    const resourceId = `res_${row.id}`;

    const existing = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (existing) {
      resourceIdMap.set(row.id, resourceId);
      continue;
    }

    let resourceType = 'DOCUMENT';
    if (row.视频链接.includes('bilibili') || row.视频链接.includes('video') || row.视频链接.includes('http')) {
      resourceType = 'VIDEO';
    } else if (row.code.length > 10) {
      resourceType = 'PRACTICE';
    } else if (row.content.includes('<p>')) {
      resourceType = 'ARTICLE';
    }

    // Truncate URL to fit database column limit (VARCHAR 191 in MySQL)
    const urlValue = (row.视频链接 || '').length > 191 ? (row.视频链接 || '').substring(0, 188) + '...' : (row.视频链接 || '');

    await prisma.resource.create({
      data: {
        id: resourceId,
        title: (row.name || `Resource ${row.id}`).substring(0, 255),
        description: (row.教材页码 || '').substring(0, 500),
        url: urlValue,
        resourceType,
      },
    });
    resourceIdMap.set(row.id, resourceId);
    resourceCount++;
  }
  console.log('Created', resourceCount, 'new resources');

  // ===== Step 3: Create knowledge-resource relations =====
  console.log('\n=== Step 3: Creating knowledge-resource relations ===');

  let relationCount = 0;

  for (const row of validResources) {
    const resourceId = resourceIdMap.get(row.id);
    if (!resourceId) continue;

    const knames = row.知识点.split('、').map(k => k.trim()).filter(k => k.length > 0 && k !== '暂无');

    for (const kname of knames) {
      const nodeId = knowledgeNodeIds.get(kname);
      if (!nodeId) continue;

      const existing = await prisma.resourceKnowledgeRelation.findUnique({
        where: {
          resourceId_knowledgeNodeId: {
            resourceId,
            knowledgeNodeId: nodeId,
          },
        },
      });

      if (!existing) {
        await prisma.resourceKnowledgeRelation.create({
          data: {
            resourceId,
            knowledgeNodeId: nodeId,
          },
        });
        relationCount++;
      }
    }
  }
  console.log('Created', relationCount, 'new knowledge-resource relations');

  // ===== Summary =====
  console.log('\n=== Import Summary ===');
  console.log('Knowledge nodes total:', knowledgeNodeIds.size);
  console.log('Resources total:', resourceIdMap.size);
  console.log('Knowledge-Resource relations total:', relationCount);

  await prisma.$disconnect();
}

main().catch(console.error);