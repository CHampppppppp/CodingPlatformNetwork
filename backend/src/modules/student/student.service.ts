import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  async getLatestCognitiveTemplate(studentNodeId: string) {
    const studentNode = await this.prisma.graphNode.findFirst({
      where: {
        id: studentNodeId,
        nodeType: "STUDENT",
      },
      include: {
        studentProfile: true,
      },
    });

    if (!studentNode) {
      return null;
    }

    const latestProfile = await this.prisma.studentCognitiveProfile.findFirst({
      where: { studentNodeId },
      orderBy: {
        generatedAt: "desc",
      },
      include: {
        dimensionScores: {
          include: {
            dimensionDef: true,
          },
          orderBy: {
            dimensionDef: {
              sortOrder: "asc",
            },
          },
        },
      },
    });

    const [school, grade, schoolClass] = await Promise.all([
      studentNode.schoolId
        ? this.prisma.school.findUnique({
            where: { id: studentNode.schoolId },
            select: { name: true },
          })
        : Promise.resolve(null),
      studentNode.gradeId
        ? this.prisma.grade.findUnique({
            where: { id: studentNode.gradeId },
            select: { gradeName: true },
          })
        : Promise.resolve(null),
      studentNode.classId
        ? this.prisma.schoolClass.findUnique({
            where: { id: studentNode.classId },
            select: { className: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      data: {
        student: {
          id: studentNode.id,
          name: studentNode.displayName,
          school: school?.name ?? studentNode.schoolId ?? null,
          grade: grade?.gradeName != null ? `${grade.gradeName}年级` : studentNode.gradeId ?? null,
          classId: schoolClass?.className ?? studentNode.classId ?? null,
          learningStylePreference:
            studentNode.studentProfile?.learningStylePreference ?? null,
          personality: studentNode.studentProfile?.personality ?? null,
          groupBehavior: studentNode.studentProfile?.groupBehavior ?? null,
        },
        profile: latestProfile
          ? {
              profileVersion: latestProfile.profileVersion,
              generatedAt: latestProfile.generatedAt,
              totalScore: Number(latestProfile.totalScore),
            }
          : null,
        dimensions:
          latestProfile?.dimensionScores.map((item) => ({
            dimensionCode: item.dimensionCode,
            dimensionNameZh: item.dimensionDef.dimensionNameZh,
            category: item.dimensionDef.category,
            scoreValue: Number(item.scoreValue),
            scoreLevel: item.scoreLevel,
          })) ?? [],
      },
      meta: null,
      error: null,
    };
  }
}
