#!/usr/bin/env ts-node
/**
 * 数据迁移脚本：从 SQL Server (阿里云) 迁移到本地 MySQL
 * 策略：冲突时优先使用 SQL Server 的数据
 * 执行顺序：按表依赖关系，先父表后子表
 */

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as sql from 'mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const mysqlUrl = 'mysql://root@localhost:3306/interaction_network_test';

// SQL Server 连接配置（源数据库）
const sourceConfig: sql.config = {
  server: 'rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com',
  port: 3433,
  database: 'interaction_network_bak',
  user: 'coding_data',
  password: 'Hello2023!',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

// 表迁移配置（按依赖顺序排列）
// 先迁移无依赖的父表，再迁移有外键依赖的子表
const tableMigrationOrder = [
  // 1. 基础配置表（无依赖）
  { name: 'learning_scenarios_test', idField: 'id', hasUnique: ['code'] },
  { name: 'cognitive_dimension_defs_test', idField: 'id', hasUnique: ['dimensionCode'] },
  { name: 'resources_test', idField: 'id', hasUnique: [] },
  
  // 2. 组织表（无依赖）
  { name: 'schools_test', idField: 'id', hasUnique: ['name'] },
  
  // 3. 年级表（依赖 schools）
  { name: 'grades_test', idField: 'id', hasUnique: ['schoolId', 'gradeName'] },
  
  // 4. 班级表（依赖 grades）
  { name: 'classes_test', idField: 'id', hasUnique: ['gradeId', 'className'] },
  
  // 5. 图谱节点（依赖 learning_scenarios, schools, grades, classes）
  { name: 'graph_nodes_test', idField: 'id', hasUnique: [] },
  
  // 6. 节点扩展表（依赖 graph_nodes）
  { name: 'student_profiles_test', idField: 'nodeId', hasUnique: ['externalUserId'] },
  { name: 'teacher_profiles_test', idField: 'nodeId', hasUnique: [] },
  { name: 'knowledge_profiles_test', idField: 'nodeId', hasUnique: [] },
  
  // 7. 交互会话（依赖 learning_scenarios）
  { name: 'interaction_sessions_test', idField: 'id', hasUnique: [] },
  
  // 8. 交互记录（依赖 interaction_sessions, graph_nodes）
  { name: 'interactions_test', idField: 'id', hasUnique: ['sessionId', 'sourceNodeId', 'targetNodeId', 'interactionType', 'actionType'] },
  
  // 9. 认知画像（依赖 graph_nodes）
  { name: 'student_cognitive_profiles_test', idField: 'id', hasUnique: [] },
  
  // 10. 认知维度得分（依赖 student_cognitive_profiles, cognitive_dimension_defs）
  { name: 'student_cognitive_dimension_scores_test', idField: 'id', hasUnique: ['profileId', 'dimensionCode'] },
  
  // 11. 问卷响应（依赖 graph_nodes, learning_scenarios）
  { name: 'student_survey_responses_test', idField: 'id', hasUnique: [] },
  
  // 12. 资源关联（依赖 resources, graph_nodes）
  { name: 'resource_knowledge_relations_test', idField: 'id', hasUnique: ['resourceId', 'knowledgeNodeId'] },
  
  // 13. 学生评分（依赖 resources）
  { name: 'student_resource_rates_test', idField: 'id', hasUnique: ['studentId', 'resourceId'] },
];

interface MigrationResult {
  tableName: string;
  sourceCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

async function getSourceData(pool: sql.ConnectionPool, tableName: string): Promise<any[]> {
  try {
    const result = await pool.request().query(`SELECT * FROM [${tableName}]`);
    return result.recordset;
  } catch (error) {
    console.error(`   ❌ Failed to read from ${tableName}:`, error);
    return [];
  }
}

async function getTargetData(prisma: PrismaClient, tableName: string): Promise<Map<string, any>> {
  const dataMap = new Map<string, any>();
  
  try {
    // 使用原始查询获取目标表数据
    const result = await prisma.$queryRawUnsafe(`SELECT * FROM \`${tableName}\``);
    const rows = result as any[];
    
    const config = tableMigrationOrder.find(t => t.name === tableName);
    const idField = config?.idField || 'id';
    
    for (const row of rows) {
      dataMap.set(row[idField], row);
    }
  } catch (error) {
    // 表可能不存在，返回空 Map
    console.log(`   ℹ️ Target table ${tableName} may not exist yet or is empty`);
  }
  
  return dataMap;
}

async function migrateTable(
  sourcePool: sql.ConnectionPool,
  prisma: PrismaClient,
  tableName: string,
  idField: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    tableName,
    sourceCount: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`\n📋 Processing table: ${tableName}`);

  // 1. 读取源数据
  const sourceData = await getSourceData(sourcePool, tableName);
  result.sourceCount = sourceData.length;
  console.log(`   📊 Source records: ${sourceData.length}`);

  if (sourceData.length === 0) {
    console.log(`   ⚠️ No data to migrate`);
    return result;
  }

  // 2. 读取目标数据（用于冲突检测）
  const targetData = await getTargetData(prisma, tableName);
  console.log(`   📊 Target existing records: ${targetData.size}`);

  // 3. 逐条处理数据
  for (const sourceRow of sourceData) {
    const rowId = sourceRow[idField];
    const exists = targetData.has(rowId);

    try {
      if (exists) {
        // 冲突：优先使用 SQL Server 数据（更新）
        await updateRow(prisma, tableName, idField, sourceRow);
        result.updated++;
      } else {
        // 不存在：插入新数据
        await insertRow(prisma, tableName, sourceRow);
        result.inserted++;
      }
    } catch (error) {
      console.error(`   ❌ Failed to process row ${rowId}:`, error);
      result.errors++;
    }
  }

  return result;
}

async function insertRow(prisma: PrismaClient, tableName: string, row: any): Promise<void> {
  const columns = Object.keys(row);
  const values = columns.map(col => {
    const val = row[col];
    if (val === null || val === undefined) {
      return 'NULL';
    }
    if (val instanceof Date) {
      return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }
    if (typeof val === 'boolean') {
      return val ? '1' : '0';
    }
    if (typeof val === 'number') {
      return val.toString();
    }
    // 字符串转义
    return `'${String(val).replace(/'/g, "''")}'`;
  });

  const sql = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${values.join(', ')})`;
  await prisma.$executeRawUnsafe(sql);
}

async function updateRow(prisma: PrismaClient, tableName: string, idField: string, row: any): Promise<void> {
  const columns = Object.keys(row).filter(col => col !== idField);
  const setClause = columns.map(col => {
    const val = row[col];
    if (val === null || val === undefined) {
      return `\`${col}\` = NULL`;
    }
    if (val instanceof Date) {
      return `\`${col}\` = '${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }
    if (typeof val === 'boolean') {
      return `\`${col}\` = ${val ? '1' : '0'}`;
    }
    if (typeof val === 'number') {
      return `\`${col}\` = ${val.toString()}`;
    }
    return `\`${col}\` = '${String(val).replace(/'/g, "''")}'`;
  }).join(', ');

  const idValue = typeof row[idField] === 'number' 
    ? row[idField] 
    : `'${String(row[idField]).replace(/'/g, "''")}'`;

  const sql = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${idField}\` = ${idValue}`;
  await prisma.$executeRawUnsafe(sql);
}

async function migrateData() {
  console.log('Starting data migration from SQL Server to MySQL...\n');
  console.log('Strategy: SQL Server data takes priority on conflicts\n');

  let sourcePool: sql.ConnectionPool | null = null;
  
  const adapter = new PrismaMariaDb(mysqlUrl);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. 连接 SQL Server
    console.log('🔌 Connecting to SQL Server (Aliyun)...');
    sourcePool = await sql.connect(sourceConfig);
    console.log('✅ Connected to SQL Server\n');

    // 2. 测试 MySQL 连接
    console.log('🔌 Testing MySQL connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Connected to MySQL\n');

    // 3. 按顺序迁移各表
    const results: MigrationResult[] = [];
    
    for (const tableConfig of tableMigrationOrder) {
      const result = await migrateTable(sourcePool, prisma, tableConfig.name, tableConfig.idField);
      results.push(result);
      
      // 显示进度
      console.log(`   📈 Inserted: ${result.inserted}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
    }

    // 4. 迁移总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (const r of results) {
      console.log(`\n📋 ${r.tableName}:`);
      console.log(`   Source: ${r.sourceCount} records`);
      console.log(`   Inserted: ${r.inserted} | Updated: ${r.updated} | Errors: ${r.errors}`);
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      totalErrors += r.errors;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ TOTAL: Inserted: ${totalInserted}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
    console.log('='.repeat(60));

    if (totalErrors > 0) {
      console.log('\n⚠️ Some errors occurred during migration. Please review the logs above.');
    } else {
      console.log('\n🎉 Migration completed successfully!');
    }

  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    if (sourcePool) await sourcePool.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateData();
}

export { migrateData };