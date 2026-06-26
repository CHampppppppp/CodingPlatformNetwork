import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaMssql } from '@prisma/adapter-mssql';

function createAdapter(databaseUrl: string) {
  if (databaseUrl.startsWith('sqlserver://')) {
    return new PrismaMssql(databaseUrl);
  }
  const url = new URL(databaseUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

async function main() {
  const before = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM classes_test WHERE teacherId IS NULL) AS classesWithoutTeacher,
      (SELECT COUNT(*) FROM teacher_profiles_test) AS teacherProfileCount
  `;
  console.log('同步前:', before[0]);

  const [linkResult, profileResult] = await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE classes_test c
      LEFT JOIN graph_nodes_test gn
        ON gn.nodeType = 'Teacher' AND gn.classId = c.id
      SET c.teacherId = gn.id
      WHERE c.teacherId IS NULL AND gn.id IS NOT NULL
    `,
    prisma.$executeRaw`
      INSERT INTO teacher_profiles_test
        (nodeId, subject, teachingGrade, teachingClass, schoolId, gradeId, classId, createdAt, updatedAt)
      SELECT
        gn.id,
        NULL,
        NULL,
        NULL,
        gn.schoolId,
        gn.gradeId,
        gn.classId,
        NOW(),
        NOW()
      FROM graph_nodes_test gn
      LEFT JOIN teacher_profiles_test tp ON tp.nodeId = gn.id
      WHERE gn.nodeType = 'Teacher' AND tp.nodeId IS NULL
    `,
  ]);

  console.log('更新 classes_test 行数:', Number(linkResult));
  console.log('插入 teacher_profiles_test 行数:', Number(profileResult));

  const after = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM classes_test WHERE teacherId IS NULL) AS classesWithoutTeacher,
      (SELECT COUNT(*) FROM teacher_profiles_test) AS teacherProfileCount,
      (SELECT COUNT(*) FROM classes_test c
       LEFT JOIN teacher_profiles_test tp ON tp.nodeId = c.teacherId
       WHERE c.teacherId IS NOT NULL AND tp.nodeId IS NULL) AS linkedClassesWithoutProfile
  `;
  console.log('同步后:', after[0]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
