import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const code of ["SHOW_CASE", "INFORMAL_LEARNING", "COLLABORATIVE_LEARNING", "ONLINE_COURSE"]) {
    const scenario = await prisma.learningScenario.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!scenario) {
      console.log(`[${code}] not found`);
      continue;
    }
    const filtered = await prisma.school.findMany({
      where: { scenarioId: scenario.id },
      select: { id: true, name: true },
    });
    const unfiltered = await prisma.school.findMany({
      select: { id: true, name: true },
    });
    console.log(`[${code}] id=${scenario.id} filtered=${filtered.length} unfiltered=${unfiltered.length}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
