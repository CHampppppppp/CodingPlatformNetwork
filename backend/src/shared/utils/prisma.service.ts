import "dotenv/config";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function createAdapter(databaseUrl: string) {
  if (databaseUrl.startsWith("sqlserver://")) {
    return new PrismaMssql(databaseUrl);
  }
  // MariaDB adapter expects config object, not URL string
  const url = new URL(databaseUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }
    super({ adapter: createAdapter(databaseUrl) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
