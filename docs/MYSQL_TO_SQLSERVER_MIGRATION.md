# MySQL 到 Aliyun SQL Server 迁移方案

## 概述

本项目已配置为支持双数据库模式：
- **开发环境**: 本地 MySQL (通过 `.env` 配置)
- **生产环境**: Aliyun SQL Server (通过 `.env.production` 配置)

## 一键迁移方案

### 方案 1: 使用 Prisma 的 db pull + db push (推荐)

```bash
# 1. 从 MySQL 导出数据为 SQL
mysqldump -u root -p interaction_network_test > mysql_backup.sql

# 2. 使用工具将 MySQL SQL 转换为 SQL Server SQL
# 可以使用: https://www.sqlines.com/online 或 AWS Schema Conversion Tool

# 3. 在 Aliyun SQL Server 上执行转换后的 SQL
sqlcmd -S rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com,3433 -U coding_data -P Hello2023! -i converted_sqlserver.sql
```

### 方案 2: 使用 Prisma 的 migrate 系统

```bash
# 1. 切换到生产环境配置
cp .env.production .env

# 2. 生成 Prisma Client (SQL Server 版本)
npx prisma generate

# 3. 推送 schema 到 Aliyun SQL Server
npx prisma db push --accept-data-loss

# 4. 编写数据迁移脚本 (从 MySQL 读取，写入 SQL Server)
npx ts-node scripts/migrate-mysql-to-sqlserver.ts
```

### 方案 3: 使用第三方工具

**推荐工具:**
- **AWS Database Migration Service (DMS)**: 支持 MySQL → SQL Server
- **SQL Server Migration Assistant (SSMA)**: 微软官方工具
- **DataGrip**: 支持跨数据库数据复制

## 数据迁移脚本示例

创建 `scripts/migrate-mysql-to-sqlserver.ts`:

```typescript
import { PrismaClient as PrismaClientMySQL } from '@prisma/client';
import { PrismaClient as PrismaClientSQLServer } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

async function migrateData() {
  // MySQL 连接
  const mysqlPrisma = new PrismaClientMySQL({
    datasources: { db: { url: 'mysql://root:password@localhost:3306/interaction_network_test' } }
  });
  
  // SQL Server 连接
  const sqlserverUrl = 'sqlserver://rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com:3433;database=interaction_network;user=coding_data;password=Hello2023!;encrypt=true;trustServerCertificate=true';
  const adapter = new PrismaMssql(sqlserverUrl);
  const sqlserverPrisma = new PrismaClientSQLServer({ adapter });
  
  // 迁移数据 (按依赖顺序)
  console.log('Migrating LearningScenario...');
  const scenarios = await mysqlPrisma.learningScenario.findMany();
  for (const s of scenarios) {
    await sqlserverPrisma.learningScenario.create({ data: s });
  }
  
  console.log('Migrating School...');
  const schools = await mysqlPrisma.school.findMany();
  for (const s of schools) {
    await sqlserverPrisma.school.create({ data: s });
  }
  
  // ... 继续迁移其他表
  
  await mysqlPrisma.$disconnect();
  await sqlserverPrisma.$disconnect();
}

migrateData();
```

## 环境切换

### 切换到本地 MySQL (开发)
```bash
cp .env .env.production  # 备份当前配置
cp .env.local.mysql .env  # 使用 MySQL 配置
npx prisma generate
```

### 切换到 Aliyun SQL Server (生产)
```bash
cp .env .env.local.mysql  # 备份 MySQL 配置
cp .env.production .env   # 使用 SQL Server 配置
npx prisma generate
```

## 注意事项

1. **数据类型差异**:
   - MySQL `TINYINT(1)` → SQL Server `BIT`
   - MySQL `DATETIME` → SQL Server `DATETIME2`
   - MySQL `VARCHAR` → SQL Server `NVARCHAR`

2. **SQL 语法差异**:
   - MySQL 使用 `` ` `` 引用标识符
   - SQL Server 使用 `[]` 引用标识符

3. **Prisma Schema**:
   - 开发时使用 `provider = "mysql"`
   - 生产部署前改为 `provider = "sqlserver"`
   - 或使用环境变量控制

4. **推荐做法**:
   - 保持 Prisma schema 与数据库无关（不使用 `@db.` 特定注解）
   - 使用 Prisma Migrate 管理 schema 变更
   - 数据迁移使用脚本或第三方工具