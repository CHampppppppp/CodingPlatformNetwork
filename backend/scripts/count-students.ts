import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
dotenv.config({ path: "./.env" });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
(async () => {
  const allStudents = await prisma.graphNode.count({ where: { nodeType: "Student" } });
  const ocStudents = await prisma.graphNode.count({
    where: { nodeType: "Student", scenario: { code: "ONLINE_COURSE" } },
  });
  console.log("All students (any scenario):", allStudents);
  console.log("ONLINE_COURSE students:", ocStudents);
  await prisma.$disconnect();
})();
