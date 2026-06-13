import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
dotenv.config({ path: "./.env" });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
(async () => {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: "ONLINE_COURSE" } });
  const school = await prisma.school.findFirst({ where: { scenarioId: scenario.id } });
  console.log("Test school:", school?.id, school?.name);
  const before = await prisma.graphNode.count({ where: { scenarioId: scenario.id, nodeType: "Student" } });
  console.log("Before:", before);

  // Try creating 5 students
  for (let i = 0; i < 5; i++) {
    try {
      const node = await prisma.graphNode.create({
        data: {
          nodeType: "Student",
          displayName: `test_${i}`,
          scenarioId: scenario.id,
          schoolId: school.id,
          studentProfile: { create: { externalUserId: `test_${i}_ext` } },
        },
      });
      console.log(`Created ${i}: ${node.id}`);
    } catch (e) {
      console.log(`Error ${i}:`, (e as Error).message);
    }
  }
  const after = await prisma.graphNode.count({ where: { scenarioId: scenario.id, nodeType: "Student" } });
  console.log("After:", after);
  // Cleanup
  await prisma.studentProfile.deleteMany({ where: { node: { displayName: { startsWith: "test_" } } } });
  await prisma.graphNode.deleteMany({ where: { displayName: { startsWith: "test_" } } });
  await prisma.$disconnect();
})();
