process.env.DATABASE_URL = 'sqlserver://coding_data:Hello2023%21@rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com:3433;database=interaction_network_bak;encrypt=true;trustServerCertificate=true';
process.env.DATABASE_PROVIDER = 'sqlserver';

const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

const adapter = new PrismaMssql(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

prisma.$queryRaw`SELECT COUNT(*) as total FROM Resource`.then(r => {
  console.log('Total:', JSON.stringify(r));
  return prisma.$queryRaw`SELECT TOP 20 title, COUNT(*) as dup_count FROM Resource GROUP BY title ORDER BY dup_count DESC`;
}).then(r => {
  console.log('Duplicate analysis:', JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => { 
  console.error(e.message.split('\n')[0]); 
  process.exit(1); 
});
