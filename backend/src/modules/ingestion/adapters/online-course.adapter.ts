import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";
import {
  NormalizedClassGroup,
  NormalizedInteraction,
  NormalizedKnowledge,
  NormalizedPlatformData,
  NormalizedSchool,
  NormalizedSession,
  NormalizedStudentKnowledgeRelation,
  NormalizedUser,
  PlatformAdapter,
} from "../types/normalized-platform-data";

const SCENARIO_CODE = "ONLINE_COURSE";
const SCENARIO_NAME = "学科课程在线学习";
const DEFAULT_OCCURRED_AT = new Date("2025-09-01T09:00:00Z");
const MAX_KNOWLEDGE_PER_STUDENT = 5;

interface KnowledgeRow {
  courses_id: string;
  content: string;
  knowledgePoints: string;
  grade: string;
  main: string;
  id: string;
}

type CsvRow = Record<string, string>;

export class OnlineCourseAdapter implements PlatformAdapter {
  readonly scenarioCode = SCENARIO_CODE;

  constructor(private readonly datasDir: string) {}

  async parse(): Promise<NormalizedPlatformData> {
    const users = this.readSimpleCsv("ONLINE_COURSE_users.csv");
    const classesCsv = this.readSimpleCsv("ONLINE_COURSE_classes.csv");
    const knowledgesCsv = this.readKnowledgesCsv();
    const comments = this.readSimpleCsv("ONLINE_COURSE_comments.csv");
    const likes = this.readSimpleCsv("ONLINE_COURSE_likes.csv");

    const schools = this.buildSchools(users);
    const classes = this.buildClasses(users);
    const normalizedUsers = this.buildUsers(users);
    const knowledges = this.buildKnowledges(knowledgesCsv, classes);
    const sessions = this.buildSessions(classes, schools);
    const studentKnowledgeRelations = this.buildStudentKnowledgeRelations(
      normalizedUsers,
      knowledgesCsv,
    );
    const interactions = this.buildSocialInteractions(comments, likes, sessions);

    return {
      scenario: {
        code: SCENARIO_CODE,
        nameZh: SCENARIO_NAME,
        sortOrder: 1,
        isActive: true,
      },
      schools,
      classes,
      users: normalizedUsers,
      knowledges,
      sessions,
      studentKnowledgeRelations,
      interactions,
      sourceStats: {
        users: users.length,
        classes: classesCsv.length,
        knowledges: knowledgesCsv.length,
        comments: comments.length,
        likes: likes.length,
      },
    };
  }

  private readSimpleCsv(filename: string): CsvRow[] {
    const content = fs.readFileSync(path.join(this.datasDir, filename), "utf-8");
    return csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
  }

  private readKnowledgesCsv(): KnowledgeRow[] {
    const content = fs.readFileSync(
      path.join(this.datasDir, "ONLINE_COURSE_knowledges.csv"),
      "utf-8",
    );
    const lines = content.split("\n");
    const results: KnowledgeRow[] = [];
    let current = "";

    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim() && !current) continue;
      current = current ? `${current}\n${line}` : line;

      const endMatch = current.match(
        /,"(\[\d+(?:,\d+)*\])","([^"]*)","(\d+)"\s*$/,
      );
      if (!endMatch) continue;

      const coursesMatch = current.match(/^"(\d+)"/);
      const kpMatch = current.match(/","([^"]+)","(\[\d)/);

      results.push({
        courses_id: coursesMatch ? coursesMatch[1] : "",
        content: "",
        knowledgePoints: kpMatch ? kpMatch[1] : "",
        grade: endMatch[1],
        main: endMatch[2],
        id: endMatch[3],
      });
      current = "";
    }

    return results;
  }

  private buildSchools(users: CsvRow[]): NormalizedSchool[] {
    const schoolCodes = new Set<string>();

    for (const user of users) {
      const schoolCode = user.school?.trim();
      if (schoolCode) schoolCodes.add(schoolCode);
    }

    schoolCodes.add("unknown");

    return Array.from(schoolCodes).map((externalId) => ({
      externalId,
      name: externalId === "unknown" ? "未知学校" : externalId,
    }));
  }

  private buildClasses(users: CsvRow[]): NormalizedClassGroup[] {
    const classMap = new Map<string, NormalizedClassGroup>();

    for (const user of users) {
      if (user.role?.trim() !== "1" || !this.isSingleValueGrade(user.grade)) {
        continue;
      }

      const externalSchoolId = user.school?.trim() || "unknown";
      const gradeName = this.parseGrade(user.grade)[0];
      const className = user.classes?.trim() || "0";
      const key = `${externalSchoolId}:${gradeName}:${className}`;

      if (!classMap.has(key)) {
        classMap.set(key, {
          externalSchoolId,
          gradeName,
          className,
        });
      }
    }

    return Array.from(classMap.values());
  }

  private buildUsers(users: CsvRow[]): NormalizedUser[] {
    return users
      .map((user): NormalizedUser | null => {
        const externalId = user.id?.trim();
        if (!externalId) return null;

        const role = user.role?.trim();
        const grades = this.parseGrade(user.grade);
        const gradeName = grades[0] ?? null;
        const externalSchoolId = user.school?.trim() || "unknown";
        const displayName =
          user.user_id?.trim() ||
          (role === "2" ? `teacher_${externalId}` : `student_${externalId}`);

        if (role === "1") {
          if (!this.isSingleValueGrade(user.grade)) return null;
          return {
            externalId,
            role: "STUDENT",
            displayName,
            externalUserId: user.user_id?.trim() || null,
            externalSchoolId,
            gradeName,
            className: user.classes?.trim() || "0",
          };
        }

        if (role === "2") {
          return {
            externalId,
            role: "TEACHER",
            displayName,
            externalUserId: user.user_id?.trim() || null,
            externalSchoolId: user.school?.trim() || null,
            gradeName,
            className: null,
            subject: "编程",
          };
        }

        return null;
      })
      .filter((user): user is NormalizedUser => user !== null);
  }

  private buildKnowledges(
    knowledges: KnowledgeRow[],
    classes: NormalizedClassGroup[],
  ): NormalizedKnowledge[] {
    const firstSchoolByGrade = new Map<number, string>();

    for (const item of classes) {
      if (!firstSchoolByGrade.has(item.gradeName)) {
        firstSchoolByGrade.set(item.gradeName, item.externalSchoolId);
      }
    }

    return knowledges.map((knowledge) => {
      const gradeNames = this.parseGrade(knowledge.grade);
      const gradeName = gradeNames[0] ?? null;
      const displayName =
        knowledge.main ||
        knowledge.knowledgePoints.split("、")[0] ||
        `知识_${knowledge.id}`;

      return {
        externalId: knowledge.id,
        displayName,
        content: knowledge.content || null,
        knowledgeType: knowledge.knowledgePoints.split("、")[0] || null,
        category: displayName,
        externalSchoolId:
          gradeName != null ? firstSchoolByGrade.get(gradeName) ?? null : null,
        gradeName,
        gradeNames,
      };
    });
  }

  private buildSessions(
    classes: NormalizedClassGroup[],
    schools: NormalizedSchool[],
  ): NormalizedSession[] {
    const schoolNames = new Map(schools.map((school) => [school.externalId, school.name]));
    const sessions = new Map<string, NormalizedSession>();

    for (const item of classes) {
      const externalId = this.sessionExternalId(item.externalSchoolId, item.gradeName);
      if (sessions.has(externalId)) continue;

      const schoolName = schoolNames.get(item.externalSchoolId) ?? item.externalSchoolId;
      sessions.set(externalId, {
        externalId,
        externalSchoolId: item.externalSchoolId,
        gradeName: item.gradeName,
        sessionName: `${schoolName} ${item.gradeName}年级在线学习`,
        occurredAt: DEFAULT_OCCURRED_AT,
      });
    }

    return Array.from(sessions.values());
  }

  private buildStudentKnowledgeRelations(
    users: NormalizedUser[],
    knowledges: KnowledgeRow[],
  ): NormalizedStudentKnowledgeRelation[] {
    const knowledgeIdsByGrade = new Map<number, string[]>();

    for (const knowledge of knowledges) {
      for (const gradeName of this.parseGrade(knowledge.grade)) {
        const knowledgeIds = knowledgeIdsByGrade.get(gradeName) ?? [];
        knowledgeIds.push(knowledge.id);
        knowledgeIdsByGrade.set(gradeName, knowledgeIds);
      }
    }

    const relations: NormalizedStudentKnowledgeRelation[] = [];
    for (const user of users) {
      if (user.role !== "STUDENT" || user.gradeName == null || !user.externalSchoolId) {
        continue;
      }

      const knowledgeIds = (knowledgeIdsByGrade.get(user.gradeName) ?? []).slice(
        0,
        MAX_KNOWLEDGE_PER_STUDENT,
      );

      for (const knowledgeExternalId of knowledgeIds) {
        relations.push({
          studentExternalId: user.externalId,
          knowledgeExternalId,
          sessionExternalId: this.sessionExternalId(
            user.externalSchoolId,
            user.gradeName,
          ),
          actionType: "STUDY",
          strength: 1,
        });
      }
    }

    return relations;
  }

  private buildSocialInteractions(
    comments: CsvRow[],
    likes: CsvRow[],
    sessions: NormalizedSession[],
  ): NormalizedInteraction[] {
    const interactions: NormalizedInteraction[] = [];
    const firstSessionExternalId = sessions[0]?.externalId;

    for (const comment of comments) {
      const sourceExternalUserId = comment.commenter_id?.trim();
      const targetExternalUserId = comment.user_id?.trim();
      if (!sourceExternalUserId || !targetExternalUserId) continue;

      const school = comment.school?.trim() || "unknown";
      const gradeName = this.parseGrade(comment.grade?.trim() || "[]")[0];
      if (gradeName == null) continue;

      interactions.push({
        sourceExternalUserId,
        targetExternalUserId,
        sessionExternalId: this.sessionExternalId(school, gradeName),
        interactionType: "PLATFORM",
        actionType: "COMMENT",
        strength: 1,
      });
    }

    if (!firstSessionExternalId) return interactions;

    for (const like of likes) {
      const sourceExternalUserId = like.liker_id?.trim();
      const targetExternalUserId = like.liked_user_id?.trim();
      if (!sourceExternalUserId || !targetExternalUserId) continue;

      interactions.push({
        sourceExternalUserId,
        targetExternalUserId,
        sessionExternalId: firstSessionExternalId,
        interactionType: "PLATFORM",
        actionType: "LIKE",
        strength: like.is_active?.trim() === "1" ? 1 : 0.5,
      });
    }

    return interactions;
  }

  private sessionExternalId(externalSchoolId: string, gradeName: number): string {
    return `${externalSchoolId}:${gradeName}`;
  }

  private parseGrade(gradeStr: string | undefined): number[] {
    if (!gradeStr) return [];
    try {
      const parsed = JSON.parse(gradeStr);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter((value) => !Number.isNaN(value));
      }
    } catch (error) {
      if (error instanceof SyntaxError) return [];
      throw error;
    }
    return [];
  }

  private isSingleValueGrade(gradeStr: string | undefined): boolean {
    return this.parseGrade(gradeStr).length === 1;
  }
}
