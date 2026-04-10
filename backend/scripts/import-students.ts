/**
 * Student Data Import Script
 * 
 * Imports student data from CSV files into the database test tables:
 * - graph_nodes_test (with nodeType='Student')
 * - student_profiles_test (with learningStyle, personality, groupBehavior)
 * 
 * Usage: npx ts-node scripts/import-students.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as mssql from 'mssql';

// Configuration
const CONFIG = {
  server: 'rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com',
  port: 3433,
  database: 'interaction_network',
  user: 'coding_data',
  password: 'Hello2023!',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const SCENARIO_ID = 'scenario_collab_001'; // Placeholder - must exist in learning_scenarios_test

const CSV_PATH = path.join(
  __dirname,
  '../datas/script_filterd/问卷_后测_共同学生列表.csv'
);

// CSV Column indices (0-based)
const COL = {
  NAME: 0,           // 姓名
  SCHOOL: 8,         // 学校 (问卷_列7)
  GRADE: 10,         // 年级 (问卷_列9) - e.g., "6年级"
  CLASS: 11,         // 班级 (问卷_列10) - e.g., "六年级10班"
  LEARNING_STYLE: 14, // 学习方式 (问卷_列13)
  PERSONALITY: 15,    // 性格 (问卷_列14)
  GROUP_BEHAVIOR: 16, // 群体行为 (问卷_列15)
  // Post-questionnaire columns (for reference/validation)
  POST_SCHOOL: 62,   // 1、你的学校：
  POST_GRADE: 64,    // 3、你的年级：
};

// Interfaces
interface StudentRow {
  name: string;
  school: string;
  grade: string;
  className: string;
  learningStyle: string;
  personality: string;
  groupBehavior: string;
}

interface SchoolCache {
  [name: string]: string;
}

interface GradeCache {
  [key: string]: string;
}

interface ClassCache {
  [key: string]: string;
}

interface ImportStats {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
}

class StudentImporter {
  private pool: mssql.ConnectionPool | null = null;
  private schoolCache: SchoolCache = {};
  private gradeCache: GradeCache = {};
  private classCache: ClassCache = {};
  private stats: ImportStats = { total: 0, imported: 0, skipped: 0, errors: 0 };

  async initialize(): Promise<void> {
    console.log('Connecting to database...');
    try {
      this.pool = await mssql.connect(CONFIG);
      console.log('Database connected successfully');
      
      // Load caches
      await this.loadSchoolCache();
      await this.loadGradeCache();
      await this.loadClassCache();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  private async loadSchoolCache(): Promise<void> {
    const result = await this.pool!.request().query('SELECT id, name FROM schools_test');
    for (const row of result.recordset) {
      this.schoolCache[row.name] = row.id;
    }
    console.log(`Loaded ${Object.keys(this.schoolCache).length} schools`);
  }

  private async loadGradeCache(): Promise<void> {
    const result = await this.pool!.request().query('SELECT id, schoolId, gradeName FROM grades_test');
    for (const row of result.recordset) {
      const key = `${row.schoolId}:${row.gradeName}`;
      this.gradeCache[key] = row.id;
    }
    console.log(`Loaded ${Object.keys(this.gradeCache).length} grades`);
  }

  private async loadClassCache(): Promise<void> {
    const result = await this.pool!.request().query('SELECT id, gradeId, className FROM classes_test');
    for (const row of result.recordset) {
      const key = `${row.gradeId}:${row.className}`;
      this.classCache[key] = row.id;
    }
    console.log(`Loaded ${Object.keys(this.classCache).length} classes`);
  }

  async import(): Promise<void> {
    console.log(`\nReading CSV file: ${CSV_PATH}`);
    
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV file not found: ${CSV_PATH}`);
    }

    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
    
    const records: string[][] = [];
    
    await new Promise<void>((resolve, reject) => {
      parse(fileContent, {
        delimiter: ',',
        relaxColumnCount: true,
        skipEmptyLines: true,
      })
        .on('data', (row: string[]) => {
          records.push(row);
        })
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    console.log(`CSV records (including header): ${records.length}`);
    
    // Skip header row
    const dataRows = records.slice(1);
    this.stats.total = dataRows.length;

    console.log(`Starting import of ${this.stats.total} students...\n`);

    // Process in batches with transaction
    const batchSize = 10;
    for (let i = 0; i < dataRows.length; i += batchSize) {
      const batch = dataRows.slice(i, i + batchSize);
      await this.processBatch(batch, i);
      
      // Progress update
      const progress = Math.min(i + batchSize, dataRows.length);
      process.stdout.write(`\rProgress: ${progress}/${dataRows.length} students processed`);
    }

    console.log('\n');
  }

  private async processBatch(rows: string[][], offset: number): Promise<void> {
    const transaction = new mssql.Transaction(this.pool!);
    
    try {
      await transaction.begin();
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = offset + i + 2; // +2 for 1-indexed and header
        
        try {
          const student = this.parseRow(row, rowNum);
          if (!student) {
            this.stats.skipped++;
            continue;
          }
          
          const exists = await this.checkStudentExists(transaction, student);
          if (exists) {
            console.log(`  Row ${rowNum}: Skipping duplicate - ${student.name}@${student.school}`);
            this.stats.skipped++;
            continue;
          }
          
          await this.insertStudent(transaction, student);
          this.stats.imported++;
          
        } catch (error) {
          console.error(`\n  Row ${rowNum}: Error processing row - ${error}`);
          this.stats.errors++;
        }
      }
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error(`\nBatch error, rolled back: ${error}`);
      this.stats.errors += rows.length;
    }
  }

  private parseRow(row: string[], rowNum: number): StudentRow | null {
    // Validate row has minimum required columns
    if (row.length < 17) {
      console.log(`\n  Row ${rowNum}: Skipping - insufficient columns (${row.length})`);
      return null;
    }

    const name = row[COL.NAME]?.trim();
    const school = row[COL.SCHOOL]?.trim();
    const grade = row[COL.GRADE]?.trim();
    const className = row[COL.CLASS]?.trim();
    const learningStyle = row[COL.LEARNING_STYLE]?.trim();
    const personality = row[COL.PERSONALITY]?.trim();
    const groupBehavior = row[COL.GROUP_BEHAVIOR]?.trim();

    // Validate required fields
    if (!name || !school || !grade || !className) {
      console.log(`\n  Row ${rowNum}: Skipping - missing required fields`);
      return null;
    }

    // Skip empty or placeholder names
    if (name === '1' || name === '序号' || name.length < 2) {
      return null;
    }

    return {
      name,
      school,
      grade,
      className,
      learningStyle: learningStyle || null,
      personality: personality || null,
      groupBehavior: groupBehavior || null,
    };
  }

  private async checkStudentExists(transaction: mssql.Transaction, student: StudentRow): Promise<boolean> {
    // First get schoolId for this student's school
    let schoolId = this.schoolCache[student.school];
    if (!schoolId) {
      return false; // School doesn't exist, can't be duplicate
    }

    // Parse grade number from grade string (e.g., "6年级" -> 6)
    const gradeNum = this.parseGradeNumber(student.grade);
    
    // Check if grade exists
    const gradeKey = `${schoolId}:${gradeNum}`;
    const gradeId = this.gradeCache[gradeKey];
    if (!gradeId) {
      return false; // Grade doesn't exist, can't be duplicate
    }

    // Check if class exists
    const classKey = `${gradeId}:${student.className}`;
    const classId = this.classCache[classKey];
    if (!classId) {
      return false; // Class doesn't exist, can't be duplicate
    }

    // Now check if student node exists with same name and classId
    const request = new mssql.Request(transaction);
    request.input('name', mssql.VarChar(255), student.name);
    request.input('classId', mssql.VarChar(50), classId);
    const result = await request.query(`
      SELECT COUNT(*) as count FROM graph_nodes_test
      WHERE nodeType = 'Student'
        AND displayName = @name
        AND classId = @classId
    `);
    
    return result.recordset[0].count > 0;
  }

  private parseGradeNumber(gradeStr: string): number {
    // Extract number from grade string like "6年级", "5年级", "一年级"
    const match = gradeStr.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    // Handle Chinese numbers
    const chineseNumbers: { [key: string]: number } = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    };
    for (const [cn, num] of Object.entries(chineseNumbers)) {
      if (gradeStr.includes(cn)) {
        return num;
      }
    }
    return 0;
  }

  private async insertStudent(transaction: mssql.Transaction, student: StudentRow): Promise<void> {
    // Get or create school
    let schoolId = this.schoolCache[student.school];
    if (!schoolId) {
      schoolId = await this.insertSchool(transaction, student.school);
      this.schoolCache[student.school] = schoolId;
    }

    // Get or create grade
    const gradeNum = this.parseGradeNumber(student.grade);
    const gradeKey = `${schoolId}:${gradeNum}`;
    let gradeId = this.gradeCache[gradeKey];
    if (!gradeId) {
      gradeId = await this.insertGrade(transaction, schoolId, gradeNum);
      this.gradeCache[gradeKey] = gradeId;
    }

    // Get or create class
    const classKey = `${gradeId}:${student.className}`;
    let classId = this.classCache[classKey];
    if (!classId) {
      classId = await this.insertClass(transaction, gradeId, student.className);
      this.classCache[classKey] = classId;
    }

    // Generate unique node ID
    const nodeId = this.generateId();

    // Insert into graph_nodes_test
    const nodeRequest = new mssql.Request(transaction);
    nodeRequest.input('nodeId', mssql.VarChar(50), nodeId);
    nodeRequest.input('displayName', mssql.VarChar(255), student.name);
    nodeRequest.input('scenarioId', mssql.VarChar(50), SCENARIO_ID);
    nodeRequest.input('schoolId', mssql.VarChar(50), schoolId);
    nodeRequest.input('gradeId', mssql.VarChar(50), gradeId);
    nodeRequest.input('classId', mssql.VarChar(50), classId);
    await nodeRequest.query(`
      INSERT INTO graph_nodes_test (id, nodeType, displayName, scenarioId, schoolId, gradeId, classId, createdAt, updatedAt)
      VALUES (@nodeId, 'Student', @displayName, @scenarioId, @schoolId, @gradeId, @classId, GETDATE(), GETDATE())
    `);

    // Insert into student_profiles_test
    const profileRequest = new mssql.Request(transaction);
    profileRequest.input('nodeId', mssql.VarChar(50), nodeId);
    profileRequest.input('learningStyle', mssql.VarChar(255), student.learningStyle || null);
    profileRequest.input('personality', mssql.VarChar(255), student.personality || null);
    profileRequest.input('groupBehavior', mssql.VarChar(255), student.groupBehavior || null);
    await profileRequest.query(`
      INSERT INTO student_profiles_test (nodeId, learningStylePreference, personality, groupBehavior, createdAt, updatedAt)
      VALUES (@nodeId, @learningStyle, @personality, @groupBehavior, GETDATE(), GETDATE())
    `);
  }

  private async insertSchool(transaction: mssql.Transaction, name: string): Promise<string> {
    const id = this.generateId();
    const request = new mssql.Request(transaction);
    request.input('id', mssql.VarChar(50), id);
    request.input('name', mssql.VarChar(255), name);
    await request.query(`
      INSERT INTO schools_test (id, name, createdAt)
      VALUES (@id, @name, GETDATE())
    `);
    console.log(`    Created school: ${name}`);
    return id;
  }

  private async insertGrade(transaction: mssql.Transaction, schoolId: string, gradeName: number): Promise<string> {
    const id = this.generateId();
    const request = new mssql.Request(transaction);
    request.input('id', mssql.VarChar(50), id);
    request.input('schoolId', mssql.VarChar(50), schoolId);
    request.input('gradeName', mssql.Int, gradeName);
    await request.query(`
      INSERT INTO grades_test (id, schoolId, gradeName, createdAt)
      VALUES (@id, @schoolId, @gradeName, GETDATE())
    `);
    return id;
  }

  private async insertClass(transaction: mssql.Transaction, gradeId: string, className: string): Promise<string> {
    const id = this.generateId();
    const request = new mssql.Request(transaction);
    request.input('id', mssql.VarChar(50), id);
    request.input('gradeId', mssql.VarChar(50), gradeId);
    request.input('className', mssql.VarChar(255), className);
    await request.query(`
      INSERT INTO classes_test (id, gradeId, className, createdAt)
      VALUES (@id, @gradeId, @className, GETDATE())
    `);
    return id;
  }

  private generateId(): string {
    // Generate a unique ID similar to cuid
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `c${timestamp}${randomPart}${randomPart2}`;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      console.log('Database connection closed');
    }
  }

  printSummary(): void {
    console.log('\n========== Import Summary ==========');
    console.log(`Total rows in CSV:    ${this.stats.total}`);
    console.log(`Successfully imported: ${this.stats.imported}`);
    console.log(`Skipped (duplicates):  ${this.stats.skipped}`);
    console.log(`Errors:                ${this.stats.errors}`);
    console.log('=====================================\n');
  }
}

// Main execution
async function main() {
  console.log('========================================');
  console.log('   Student Data Import Script');
  console.log('========================================\n');

  const importer = new StudentImporter();
  
  try {
    await importer.initialize();
    
    // Verify scenario exists
    console.log(`\nUsing scenarioId: ${SCENARIO_ID}`);
    const scenarioCheck = await importer['pool'].request().query(`
      SELECT id, nameZh FROM learning_scenarios_test WHERE id = '${SCENARIO_ID}'
    `);
    
    if (scenarioCheck.recordset.length === 0) {
      console.warn(`\nWARNING: Scenario '${SCENARIO_ID}' does not exist in learning_scenarios_test.`);
      console.warn('Please create it first or update SCENARIO_ID in the script.');
      console.warn('Students will still be imported but will have invalid foreign key.\n');
    } else {
      console.log(`Scenario found: ${scenarioCheck.recordset[0].nameZh}`);
    }

    await importer.import();
    importer.printSummary();
    
  } catch (error) {
    console.error('\nImport failed with error:', error);
    importer.printSummary();
    process.exit(1);
  } finally {
    await importer.close();
  }
}

main().catch(console.error);
