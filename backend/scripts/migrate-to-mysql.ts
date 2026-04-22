#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function migrateSchemaToMySQL() {
  console.log('Starting MySQL schema migration...\n');

  try {
    console.log('Pushing Prisma schema to MySQL database...');
    console.log('Run: npx prisma db push --accept-data-loss');
    console.log('\nOr use Prisma Migrate:');
    console.log('Run: npx prisma migrate dev --name init_mysql');
    
    console.log('\n✅ MySQL migration instructions prepared');
    console.log('\nNext steps:');
    console.log('1. Ensure MySQL is running locally');
    console.log('2. Create database: interaction_network_test');
    console.log('3. Run: cd backend && npx prisma generate');
    console.log('4. Run: npx prisma db push --accept-data-loss');
    console.log('5. Verify with: npx ts-node scripts/db-explorer.ts');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrateSchemaToMySQL();
}

export { migrateSchemaToMySQL };