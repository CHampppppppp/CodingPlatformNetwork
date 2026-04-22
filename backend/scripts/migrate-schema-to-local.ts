#!/usr/bin/env ts-node
import * as sql from 'mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sourceConfig: sql.config = {
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

const targetConfig: sql.config = {
  server: 'localhost',
  port: 1433,
  database: 'interaction_network',
  user: 'sa',
  password: process.env.LOCAL_MSSQL_PASSWORD || 'YourStrong@Passw0rd',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function getTableSchemas(pool: sql.ConnectionPool): Promise<string[]> {
  const result = await pool.request().query(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_TYPE = 'BASE TABLE' 
    AND TABLE_NAME LIKE '%_test'
    ORDER BY TABLE_NAME
  `);
  return result.recordset.map((r: any) => r.TABLE_NAME);
}

async function getCreateTableScript(pool: sql.ConnectionPool, tableName: string): Promise<string> {
  const columnsResult = await pool.request().input('tableName', sql.NVarChar, tableName).query(`
    SELECT 
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.CHARACTER_MAXIMUM_LENGTH,
      c.NUMERIC_PRECISION,
      c.NUMERIC_SCALE,
      c.IS_NULLABLE,
      c.COLUMN_DEFAULT,
      CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PRIMARY_KEY
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN (
      SELECT ku.COLUMN_NAME, ku.TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
      WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME AND c.TABLE_NAME = pk.TABLE_NAME
    WHERE c.TABLE_NAME = @tableName
    ORDER BY c.ORDINAL_POSITION
  `);

  const columns: string[] = [];
  for (const col of columnsResult.recordset) {
    let dataType = col.DATA_TYPE;
    if (col.CHARACTER_MAXIMUM_LENGTH && col.CHARACTER_MAXIMUM_LENGTH !== -1) {
      dataType += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
    } else if (col.CHARACTER_MAXIMUM_LENGTH === -1) {
      dataType += '(MAX)';
    } else if (col.NUMERIC_PRECISION) {
      dataType += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE || 0})`;
    }

    let colDef = `    [${col.COLUMN_NAME}] ${dataType}`;
    if (col.IS_NULLABLE === 'NO') colDef += ' NOT NULL';
    if (col.COLUMN_DEFAULT) colDef += ` DEFAULT ${col.COLUMN_DEFAULT}`;
    if (col.IS_PRIMARY_KEY) colDef += ' PRIMARY KEY';
    
    columns.push(colDef);
  }

  return `CREATE TABLE [${tableName}] (\n${columns.join(',\n')}\n)`;
}

async function migrateSchema() {
  console.log('Starting database schema migration...\n');

  let sourcePool: sql.ConnectionPool | null = null;
  let targetPool: sql.ConnectionPool | null = null;

  try {
    console.log('Connecting to Aliyun database...');
    sourcePool = await sql.connect(sourceConfig);
    console.log('Connected to Aliyun database\n');

    console.log('Connecting to local database...');
    targetPool = await new sql.ConnectionPool(targetConfig).connect();
    console.log('Connected to local database\n');

    const tables = await getTableSchemas(sourcePool);
    console.log(`Found ${tables.length} test tables:\n`);
    tables.forEach(t => console.log(`   - ${t}`));
    console.log();

    for (const tableName of tables) {
      console.log(`Processing table: ${tableName}`);
      
      try {
        const existsResult = await targetPool.request().input('tableName', sql.NVarChar, tableName).query(`
          SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName
        `);
        
        if (existsResult.recordset[0].count > 0) {
          console.log(`   Table already exists, skipping`);
          continue;
        }

        const createScript = await getCreateTableScript(sourcePool, tableName);
        await targetPool.request().query(createScript);
        console.log(`   Table created successfully`);
        
      } catch (error) {
        console.log(`   Failed to create: ${error}`);
      }
    }

    console.log('\nSchema migration completed!');
    console.log('\nMigration summary:');
    
    const localTables = await targetPool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
    `);
    
    console.log(`\nLocal database has ${localTables.recordset.length} tables:`);
    for (const t of localTables.recordset) {
      const countResult = await targetPool.request().query(`SELECT COUNT(*) as count FROM [${t.TABLE_NAME}]`);
      console.log(`  - ${t.TABLE_NAME}: ${countResult.recordset[0].count} records`);
    }

  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    if (sourcePool) await sourcePool.close();
    if (targetPool) await targetPool.close();
  }
}

if (require.main === module) {
  migrateSchema();
}

export { migrateSchema };
