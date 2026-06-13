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
const DEFAULT_FILENAME = "ONLINE_COURSE_long_format_v3.csv";
const DEFAULT_OCCURRED_AT = new Date("2026-01-13T00:00:00Z");
const DEFAULT_CLASS_FALLBACK = "默认班级";

interface LongFormatRow {
  姓名: string;
  user_id: string;
  school_id: string;
  年级: string;
  班级: string;
  关联知识?: string;
  点赞学生ID列表?: string;
  评论内容列表?: string;
}

type CsvRow = Record<string, string>;

export class OnlineCourseLongFormatAdapter implements PlatformAdapter {
  readonly scenarioCode = SCENARIO_CODE;

  constructor(
    private readonly datasDir: string,
    private readonly filename: string = DEFAULT_FILENAME,
  ) {}

  async parse(): Promise<NormalizedPlatformData> {
    const rows = this.readLongFormatCsv();

    const schools = this.buildSchools(rows);
    const classes = this.buildClasses(rows);
    const users = this.buildUsers(rows);
    const knowledges = this.buildKnowledges(rows);
    const sessions = this.buildSessions(classes, schools);
    const studentKnowledgeRelations = this.buildStudentKnowledgeRelations(rows);
    const interactions = this.buildInteractions(rows, sessions);

    return {
      scenario: {
        code: SCENARIO_CODE,
        nameZh: SCENARIO_NAME,
        sortOrder: 1,
        isActive: true,
      },
      schools,
      classes,
      users,
      knowledges,
      sessions,
      studentKnowledgeRelations,
      interactions,
      sourceStats: {
        longFormatRows: rows.length,
      },
    };
  }

  private readLongFormatCsv(): CsvRow[] {
    const filepath = path.join(this.datasDir, this.filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Long-format CSV not found: ${filepath}`);
    }
    const content = fs.readFileSync(filepath, "utf-8");
    return csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
  }

  private buildSchools(rows: CsvRow[]): NormalizedSchool[] {
    const seen = new Set<string>();
    const schools: NormalizedSchool[] = [];
    for (const row of rows) {
      const externalId = (row["school_id"] || "").trim();
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      schools.push({ externalId, name: externalId });
    }
    return schools;
  }

  private buildClasses(rows: CsvRow[]): NormalizedClassGroup[] {
    const seen = new Set<string>();
    const classes: NormalizedClassGroup[] = [];
    for (const row of rows) {
      const school = (row["school_id"] || "").trim();
      if (!school) continue;
      const gradeName = this.parseGradeNumber(row["年级"]);
      if (gradeName == null) continue;
      const rawClass = (row["班级"] || "").trim();
      const className = rawClass || DEFAULT_CLASS_FALLBACK;
      const key = `${school}|${gradeName}|${className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      classes.push({ externalSchoolId: school, gradeName, className });
    }
    return classes;
  }

  private buildUsers(rows: CsvRow[]): NormalizedUser[] {
    const seen = new Set<string>();
    const users: NormalizedUser[] = [];
    for (const row of rows) {
      const externalId = (row["user_id"] || "").trim();
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      const externalUserId = (row["姓名"] || "").trim();
      const school = (row["school_id"] || "").trim();
      const gradeName = this.parseGradeNumber(row["年级"]);
      const rawClass = (row["班级"] || "").trim();
      const className = rawClass || null;
      users.push({
        externalId,
        role: "STUDENT",
        displayName: externalUserId || externalId,
        externalUserId: externalUserId || null,
        externalSchoolId: school || null,
        gradeName,
        className,
      });
    }
    return users;
  }

  private buildKnowledges(rows: CsvRow[]): NormalizedKnowledge[] {
    const seen = new Set<string>();
    const knowledges: NormalizedKnowledge[] = [];
    for (const row of rows) {
      const kgRaw = (row["关联知识"] || "").trim();
      if (!kgRaw) continue;
      let ids: string[] = [];
      try {
        const parsed = JSON.parse(kgRaw);
        if (Array.isArray(parsed)) {
          ids = parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        continue;
      }
      for (const kid of ids) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        knowledges.push({
          externalId: kid,
          displayName: `知识 ${kid.slice(0, 8)}`,
        });
      }
    }
    return knowledges;
  }

  private buildSessions(
    classes: NormalizedClassGroup[],
    schools: NormalizedSchool[],
  ): NormalizedSession[] {
    const schoolNameById = new Map<string, string>(
      schools.map((s) => [s.externalId, s.name]),
    );
    return classes.map((c) => {
      const externalId = `${c.externalSchoolId}:${c.gradeName}:${c.className}`;
      const schoolName =
        schoolNameById.get(c.externalSchoolId) ?? c.externalSchoolId;
      return {
        externalId,
        externalSchoolId: c.externalSchoolId,
        gradeName: c.gradeName,
        className: c.className,
        sessionName: `${schoolName} ${c.gradeName}年级 ${c.className} 班`,
        occurredAt: DEFAULT_OCCURRED_AT,
      };
    });
  }

  private buildStudentKnowledgeRelations(
    rows: CsvRow[],
  ): NormalizedStudentKnowledgeRelation[] {
    const relations: NormalizedStudentKnowledgeRelation[] = [];
    for (const row of rows) {
      const studentExternalId = (row["user_id"] || "").trim();
      if (!studentExternalId) continue;
      const school = (row["school_id"] || "").trim();
      if (!school) continue;
      const gradeName = this.parseGradeNumber(row["年级"]);
      if (gradeName == null) continue;
      const rawClass = (row["班级"] || "").trim();
      const className = rawClass || DEFAULT_CLASS_FALLBACK;
      const sessionExternalId = `${school}:${gradeName}:${className}`;

      const kgRaw = (row["关联知识"] || "").trim();
      if (!kgRaw) continue;
      let ids: string[] = [];
      try {
        const parsed = JSON.parse(kgRaw);
        if (Array.isArray(parsed)) {
          ids = parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        continue;
      }

      for (const knowledgeId of ids) {
        relations.push({
          studentExternalId,
          knowledgeExternalId: knowledgeId,
          sessionExternalId,
          strength: 1,
          actionType: "STUDY",
        });
      }
    }
    return relations;
  }

  private buildInteractions(
    rows: CsvRow[],
    sessions: NormalizedSession[],
  ): NormalizedInteraction[] {
    const firstSessionExternalId = sessions[0]?.externalId;
    if (!firstSessionExternalId) return [];

    const interactions: NormalizedInteraction[] = [];

    for (const row of rows) {
      const targetExternalUserId = (row["user_id"] || "").trim();
      if (!targetExternalUserId) continue;
      const sessionExternalId = this.sessionExternalIdForRow(row) ?? firstSessionExternalId;

      // LIKE interactions from 点赞学生ID列表
      const likersRaw = (row["点赞学生ID列表"] || "").trim();
      if (likersRaw && likersRaw !== "[]") {
        let likers: string[] = [];
        try {
          const parsed = JSON.parse(likersRaw);
          if (Array.isArray(parsed)) {
            likers = parsed.map((x) => String(x).trim()).filter(Boolean);
          }
        } catch {
          // ignore
        }
        for (const sourceExternalUserId of likers) {
          if (!sourceExternalUserId) continue;
          interactions.push({
            sourceExternalUserId,
            targetExternalUserId,
            sessionExternalId,
            interactionType: "PLATFORM",
            actionType: "LIKE",
            strength: 1,
          });
        }
      }

      // COMMENT interactions from 评论内容列表
      const commentsRaw = (row["评论内容列表"] || "").trim();
      if (commentsRaw && commentsRaw !== "[]") {
        let comments: Array<{ commenter_id?: string; user_id?: string }> = [];
        try {
          const parsed = JSON.parse(commentsRaw);
          if (Array.isArray(parsed)) {
            comments = parsed;
          }
        } catch {
          // ignore
        }
        for (const c of comments) {
          const commenterId = String(c.commenter_id || "").trim();
          if (!commenterId) continue;
          interactions.push({
            sourceExternalUserId: commenterId,
            targetExternalUserId,
            sessionExternalId,
            interactionType: "PLATFORM",
            actionType: "COMMENT",
            strength: 1,
          });
        }
      }
    }

    return interactions;
  }

  private sessionExternalIdForRow(row: CsvRow): string | null {
    const school = (row["school_id"] || "").trim();
    if (!school) return null;
    const gradeName = this.parseGradeNumber(row["年级"]);
    if (gradeName == null) return null;
    const rawClass = (row["班级"] || "").trim();
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    return `${school}:${gradeName}:${className}`;
  }

  private parseGradeNumber(value: string | undefined): number | null {
    if (!value) return null;
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return null;
    return n;
  }
}