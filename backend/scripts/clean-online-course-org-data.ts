#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { throw new Error('DATABASE_URL is not set'); }

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else if (databaseUrl.startsWith('mysql://')) {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
} else {
  throw new Error(`Unsupported DATABASE_URL scheme`);
}

const isSqlServer = databaseUrl.startsWith('sqlserver://');

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });
  if (!scenario) { console.log('ONLINE_COURSE not found'); await prisma.$disconnect(); return; }
  const ocId = scenario.id;
  console.log(`Scenario ID: ${ocId}`);

  // Use raw SQL for efficient bulk deletes with JOINs
  // Prisma's deleteMany doesn't support joins, so we use $executeRawUnsafe

  if (isSqlServer) {
    // SQL Server syntax
    console.log('\n--- Step 1: Cognitive dimension scores ---');
    await prisma.$executeRawUnsafe(`
      DELETE scds FROM student_cognitive_dimension_scores_test scds
      INNER JOIN student_cognitive_profiles_test scp ON scds.profileId = scp.id
      INNER JOIN graph_nodes_test gn ON scp.studentNodeId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Student'
    `);

    console.log('--- Step 2: Cognitive profiles ---');
    await prisma.$executeRawUnsafe(`
      DELETE scp FROM student_cognitive_profiles_test scp
      INNER JOIN graph_nodes_test gn ON scp.studentNodeId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Student'
    `);

    console.log('--- Step 3: Student resource rates ---');
    await prisma.$executeRawUnsafe(`
      DELETE srr FROM student_resource_rates_test srr
      INNER JOIN graph_nodes_test gn ON srr.studentId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Student'
    `);

    console.log('--- Step 4: Student-knowledge relations ---');
    await prisma.$executeRawUnsafe(`
      DELETE skr FROM student_knowledge_relations_test skr
      INNER JOIN graph_nodes_test gn ON skr.studentNodeId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Student'
    `);

    console.log('--- Step 5: Interactions ---');
    await prisma.$executeRawUnsafe(`
      DELETE i FROM interactions_test i
      INNER JOIN interaction_sessions_test s ON i.sessionId = s.id
      WHERE s.scenarioId = '${ocId}'
    `);

    console.log('--- Step 6: Classroom analyses ---');
    await prisma.$executeRawUnsafe(`
      DELETE sca FROM session_classroom_analyses_test sca
      INNER JOIN interaction_sessions_test s ON sca.sessionId = s.id
      WHERE s.scenarioId = '${ocId}'
    `);

    console.log('--- Step 7: Student works ---');
    await prisma.$executeRawUnsafe(`
      DELETE sw FROM student_works_test sw
      INNER JOIN interaction_sessions_test s ON sw.sessionId = s.id
      WHERE s.scenarioId = '${ocId}'
    `);

    console.log('--- Step 8: Sessions ---');
    await prisma.$executeRawUnsafe(`DELETE FROM interaction_sessions_test WHERE scenarioId = '${ocId}'`);

    console.log('--- Step 9: Student profiles ---');
    await prisma.$executeRawUnsafe(`
      DELETE sp FROM student_profiles_test sp
      INNER JOIN graph_nodes_test gn ON sp.nodeId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Student'
    `);

    console.log('--- Step 10: Teacher profiles ---');
    await prisma.$executeRawUnsafe(`
      DELETE tp FROM teacher_profiles_test tp
      INNER JOIN graph_nodes_test gn ON tp.nodeId = gn.id
      WHERE gn.scenarioId = '${ocId}' AND gn.nodeType = 'Teacher'
    `);

    console.log('--- Step 11: Graph nodes ---');
    await prisma.$executeRawUnsafe(`DELETE FROM graph_nodes_test WHERE scenarioId = '${ocId}' AND nodeType IN ('Student', 'Teacher')`);

  } else {
    // MySQL syntax - same queries work
    console.log('\n--- Step 1: Cognitive dimension scores ---');
    const r1 = await prisma.$executeRawUnsafe(`
      DELETE scds FROM student_cognitive_dimension_scores_test scds
      INNER JOIN student_cognitive_profiles_test scp ON scds.profileId = scp.id
      INNER JOIN graph_nodes_test gn ON scp.studentNodeId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Student'
    `, ocId);
    console.log(`  Deleted (raw result): ${r1}`);

    console.log('--- Step 2: Cognitive profiles ---');
    const r2 = await prisma.$executeRawUnsafe(`
      DELETE scp FROM student_cognitive_profiles_test scp
      INNER JOIN graph_nodes_test gn ON scp.studentNodeId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Student'
    `, ocId);
    console.log(`  Deleted: ${r2}`);

    console.log('--- Step 3: Student resource rates ---');
    const r3 = await prisma.$executeRawUnsafe(`
      DELETE srr FROM student_resource_rates_test srr
      INNER JOIN graph_nodes_test gn ON srr.studentId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Student'
    `, ocId);
    console.log(`  Deleted: ${r3}`);

    console.log('--- Step 4: Student-knowledge relations ---');
    const r4 = await prisma.$executeRawUnsafe(`
      DELETE skr FROM student_knowledge_relations_test skr
      INNER JOIN graph_nodes_test gn ON skr.studentNodeId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Student'
    `, ocId);
    console.log(`  Deleted: ${r4}`);

    console.log('--- Step 5: Interactions ---');
    const r5 = await prisma.$executeRawUnsafe(`
      DELETE i FROM interactions_test i
      INNER JOIN interaction_sessions_test s ON i.sessionId = s.id
      WHERE s.scenarioId = ?
    `, ocId);
    console.log(`  Deleted: ${r5}`);

    console.log('--- Step 6: Classroom analyses ---');
    const r6 = await prisma.$executeRawUnsafe(`
      DELETE sca FROM session_classroom_analyses_test sca
      INNER JOIN interaction_sessions_test s ON sca.sessionId = s.id
      WHERE s.scenarioId = ?
    `, ocId);
    console.log(`  Deleted: ${r6}`);

    console.log('--- Step 7: Student works ---');
    const r7 = await prisma.$executeRawUnsafe(`
      DELETE sw FROM student_works_test sw
      INNER JOIN interaction_sessions_test s ON sw.sessionId = s.id
      WHERE s.scenarioId = ?
    `, ocId);
    console.log(`  Deleted: ${r7}`);

    console.log('--- Step 8: Sessions ---');
    const r8 = await prisma.$executeRawUnsafe(`DELETE FROM interaction_sessions_test WHERE scenarioId = ?`, ocId);
    console.log(`  Deleted: ${r8}`);

    console.log('--- Step 9: Student profiles ---');
    const r9 = await prisma.$executeRawUnsafe(`
      DELETE sp FROM student_profiles_test sp
      INNER JOIN graph_nodes_test gn ON sp.nodeId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Student'
    `, ocId);
    console.log(`  Deleted: ${r9}`);

    console.log('--- Step 10: Teacher profiles ---');
    const r10 = await prisma.$executeRawUnsafe(`
      DELETE tp FROM teacher_profiles_test tp
      INNER JOIN graph_nodes_test gn ON tp.nodeId = gn.id
      WHERE gn.scenarioId = ? AND gn.nodeType = 'Teacher'
    `, ocId);
    console.log(`  Deleted: ${r10}`);

    console.log('--- Step 11: Graph nodes ---');
    const r11 = await prisma.$executeRawUnsafe(
      `DELETE FROM graph_nodes_test WHERE scenarioId = ? AND nodeType IN ('Student', 'Teacher')`,
      ocId
    );
    console.log(`  Deleted: ${r11}`);
  }

  // Step 12: Clean orphan org structures
  console.log('\n--- Step 12: Clean orphan org structures ---');
  // Find schools with no students
  const schoolsWithStudents = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: { not: null } },
    distinct: ['schoolId'],
    select: { schoolId: true },
  });
  const schoolIdsWithStudents = new Set(schoolsWithStudents.map(s => s.schoolId).filter(Boolean) as string[]);

  const allSchools = await prisma.school.findMany({ select: { id: true, name: true } });
  const orphans = allSchools.filter(s => !schoolIdsWithStudents.has(s.id));
  console.log(`Orphan schools: ${orphans.length}`);

  for (const school of orphans) {
    try {
      await prisma.class.deleteMany({ where: { grade: { schoolId: school.id } } });
      await prisma.grade.deleteMany({ where: { schoolId: school.id } });
      await prisma.school.delete({ where: { id: school.id } });
    } catch (e: any) {
      console.log(`  Could not delete school ${school.name}: ${e.message}`);
    }
  }
  console.log(`Orphan schools deleted: ${orphans.length}`);

  // Verify
  console.log('\n=== Verification ===');
  const remainingStudents = await prisma.graphNode.count({ where: { scenarioId: ocId, nodeType: 'Student' } });
  const remainingTeachers = await prisma.graphNode.count({ where: { scenarioId: ocId, nodeType: 'Teacher' } });
  const remainingSessions = await prisma.interactionSession.count({ where: { scenarioId: ocId } });
  const remainingKnowledge = await prisma.graphNode.count({ where: { scenarioId: ocId, nodeType: 'Knowledge' } });
  console.log(`Remaining students: ${remainingStudents}`);
  console.log(`Remaining teachers: ${remainingTeachers}`);
  console.log(`Remaining sessions: ${remainingSessions}`);
  console.log(`Knowledge nodes preserved: ${remainingKnowledge}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error('Error:', e); prisma.$disconnect(); process.exit(1); });