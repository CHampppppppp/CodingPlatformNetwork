import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as fs from 'fs';
import * as path from 'path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

const csvPath = path.join(__dirname, '../datas/filterd/副本调研问卷数据01.22.csv');

function parseCSV(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  
  return lines.map((line) => {
    const cols = line.split(',');
    return {
      regionCode: cols[3]?.trim(),
      schoolName: cols[6]?.trim(),
      gradeRaw: cols[8]?.trim(),
      classRaw: cols[9]?.trim(),
    };
  });
}

function parseGradeNumber(gradeStr: string): number | null {
  const match = gradeStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function extractClassName(classStr: string): string {
  const match = classStr.match(/(\d+班)/);
  return match ? match[1] : classStr;
}

async function main() {
  console.log('开始导入问卷数据...\n');

  const rows = parseCSV(csvPath);
  console.log(`读取到 ${rows.length} 条记录`);

  const schoolMap = new Map<string, Map<number, Set<string>>>();

  for (const row of rows) {
    if (!row.schoolName || !row.gradeRaw || !row.classRaw) continue;

    const gradeNum = parseGradeNumber(row.gradeRaw);
    if (!gradeNum) continue;

    const className = extractClassName(row.classRaw);

    if (!schoolMap.has(row.schoolName)) {
      schoolMap.set(row.schoolName, new Map());
    }
    const gradeMap = schoolMap.get(row.schoolName)!;
    if (!gradeMap.has(gradeNum)) {
      gradeMap.set(gradeNum, new Set());
    }
    gradeMap.get(gradeNum)!.add(className);
  }

  console.log(`发现 ${schoolMap.size} 所唯一学校\n`);

  let schoolCount = 0;
  let gradeCount = 0;
  let classCount = 0;

  for (const [schoolName, gradeMap] of schoolMap) {
    let school = await prisma.school.findUnique({
      where: { name: schoolName },
    });

    if (!school) {
      school = await prisma.school.create({
        data: { name: schoolName },
      });
      console.log(`✅ 创建学校: ${schoolName}`);
      schoolCount++;
    } else {
      console.log(`⏭️  学校已存在: ${schoolName}`);
    }

    for (const [gradeNum, classNames] of gradeMap) {
      let grade = await prisma.grade.findUnique({
        where: {
          schoolId_gradeName: {
            schoolId: school.id,
            gradeName: gradeNum,
          },
        },
      });

      if (!grade) {
        grade = await prisma.grade.create({
          data: {
            schoolId: school.id,
            gradeName: gradeNum,
          },
        });
        console.log(`  ✅ 创建年级: ${gradeNum}年级`);
        gradeCount++;
      }

      for (const className of classNames) {
        const existingClass = await prisma.schoolClass.findUnique({
          where: {
            gradeId_className: {
              gradeId: grade.id,
              className: className,
            },
          },
        });

        if (!existingClass) {
          await prisma.schoolClass.create({
            data: {
              gradeId: grade.id,
              className: className,
            },
          });
          console.log(`    ✅ 创建班级: ${className}`);
          classCount++;
        }
      }
    }
  }

  console.log(`\n📊 导入完成!`);
  console.log(`   学校: ${schoolCount}`);
  console.log(`   年级: ${gradeCount}`);
  console.log(`   班级: ${classCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
