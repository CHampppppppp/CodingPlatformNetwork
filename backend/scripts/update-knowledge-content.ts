import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

interface KnowledgeCSVRow {
  courses_id: string;
  内容: string;
  知识点: string;
  grade: string;
  main: string;
  id: string;
}

function parseCSV(content: string): KnowledgeCSVRow[] {
  const lines = content.trim().split('\n');
  const rows: KnowledgeCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length >= 6) {
      const main = values[4].replace(/^"|"$/g, '').trim();
      // If main is empty, try to extract first knowledge name from 知识点 column
      let knowledgeName = main;
      if (!knowledgeName) {
        const knowledgesStr = values[2].replace(/^"|"$/g, '').trim();
        if (knowledgesStr) {
          knowledgeName = knowledgesStr.split('、')[0]; // Take first knowledge name
        }
      }

      if (knowledgeName) {
        rows.push({
          courses_id: values[0],
          内容: values[1].replace(/^"|"$/g, ''),
          知识点: values[2].replace(/^"|"$/g, ''),
          grade: values[3].replace(/^"|"$/g, ''),
          main: knowledgeName,
          id: values[5].replace(/^"|"$/g, ''),
        });
      }
    }
  }

  return rows;
}

async function main() {
  const csvPath = path.resolve(__dirname, '../datas/ONLINE_COURSE_knowledges.csv');

  if (!fs.existsSync(csvPath)) {
    console.log('CSV file not found:', csvPath);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const knowledgeData = parseCSV(csvContent);

  console.log('Parsed', knowledgeData.length, 'knowledge records from CSV');

  // Get all knowledge nodes
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });

  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    select: { id: true, displayName: true },
  });

  console.log('Found', knowledgeNodes.length, 'knowledge nodes in database');

  // Create a map of displayName -> [nodeId, nodeId, ...]
  const nodesByName = new Map<string, string[]>();
  for (const node of knowledgeNodes) {
    if (!nodesByName.has(node.displayName)) {
      nodesByName.set(node.displayName, []);
    }
    nodesByName.get(node.displayName)!.push(node.id);
  }

  // Update knowledge profiles with content
  let updated = 0;
  let notFound = 0;
  const notFoundNames: string[] = [];

  for (const row of knowledgeData) {
    const nodeIds = nodesByName.get(row.main);

    if (!nodeIds) {
      notFound++;
      if (notFound <= 10) {
        notFoundNames.push(row.main);
      }
      continue;
    }

    // Update ALL nodes with this knowledge name
    for (const nodeId of nodeIds) {
      await prisma.knowledgeProfile.upsert({
        where: { nodeId },
        update: { content: row.内容 },
        create: {
          nodeId,
          content: row.内容,
          knowledgeType: 'TEACHING',
          category: row.grade,
        },
      });
      updated++;
    }
  }

  console.log('\nUpdated', updated, 'knowledge profiles (some names updated multiple times)');
  console.log('Not found in database:', notFound);
  if (notFoundNames.length > 0) {
    console.log('Sample not found names:', notFoundNames);
  }

  // Verify
  const withContent = await prisma.knowledgeProfile.count({
    where: { content: { not: null } },
  });
  console.log('\nKnowledge profiles with content now:', withContent);

  await prisma.$disconnect();
}

main().catch(console.error);