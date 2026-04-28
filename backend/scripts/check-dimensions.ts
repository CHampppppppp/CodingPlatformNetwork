const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const defs = await prisma.cognitiveDimensionDef.findMany({
      select: { dimensionCode: true, dimensionNameZh: true, category: true },
      orderBy: { sortOrder: "asc" },
    });
    console.log(JSON.stringify(defs, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
