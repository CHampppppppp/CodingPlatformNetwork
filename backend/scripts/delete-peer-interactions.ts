#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

async function main() {
  const count = await prisma.interaction.count({
    where: {
      actionType: {
        in: ['PEER_CHAT', 'PEER_HELP', 'PEER_COLLABORATION']
      }
    }
  });
  console.log('待删除的 PEER_* 交互记录数:', count);
  
  const result = await prisma.interaction.deleteMany({
    where: {
      actionType: {
        in: ['PEER_CHAT', 'PEER_HELP', 'PEER_COLLABORATION']
      }
    }
  });
  console.log('已删除:', result.count);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
