import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";
import {
  NormalizedClassGroup,
  NormalizedCognitiveProfile,
  NormalizedCognitiveScore,
  NormalizedInteraction,
  NormalizedKnowledge,
  NormalizedPlatformData,
  NormalizedResource,
  NormalizedResourceKnowledgeRelation,
  NormalizedSchool,
  NormalizedSession,
  NormalizedStudentKnowledgeRelation,
  NormalizedStudentWork,
  NormalizedUser,
  PlatformAdapter,
} from "../types/normalized-platform-data";

const SCENARIO_CODE = "ONLINE_COURSE";
const SCENARIO_NAME = "学科课程在线学习";
const DEFAULT_FILENAME = "ONLINE_COURSE_V7.csv";
const RESOURCES_FILENAME = "ONLINE_COURSE_resources.csv";
const DEFAULT_OCCURRED_AT = new Date("2026-01-13T00:00:00Z");
const DEFAULT_CLASS_FALLBACK = "默认班级";

// V6 CSV column names
const COL_USER_ID = "姓名";
const COL_SCHOOL = "作品_学校ID";
const COL_SCHOOL_FALLBACK = "1、你的学校：";
const COL_DISPLAY_NAME = "2、你的姓名：";
const COL_GRADE = "3、你的年级：";
const COL_CLASS = "班级";
const COL_GENDER = "性别";
const COL_Q4 = "4、AI帮你生成的文案或图片，符合你心里的想法吗？";
const COL_Q5 = "5、智能体推送的资源链接对你制作海报有帮助吗？";
const COL_Q6 = "6、请评价你对今天自己制作的海报的满意程度：";
const COL_Q7 = "7、相比传统的“老师讲、学生做”，你更喜欢这种“和AI一起做项目”的上课方式吗？";
const COL_Q8 = "8、在这次设计中，谁给你的帮助最大？";
const COL_THEME_ID = "作品_主题ID";
const COL_THEME_NAME = "作品_主题名称";
const COL_LIKERS = "点赞学生ID列表";
const COL_COMMENTS = "评论内容列表";

// Work columns
const COL_WORK_ID = "作品_作品ID";
const COL_WORK_NAME = "作品_作品名称";
const COL_WORK_PUBLISHED_AT = "作品_作品发布时间";
const COL_WORK_STUDENT_NAME = "作品_学生姓名";
const COL_WORK_CLASS = "作品_所在班级";
const COL_WORK_SCHOOL = "作品_所在学校";
const COL_WORK_SCHOOL_ID = "作品_学校ID";
const COL_WORK_TEXTBOOK = "作品_所属教材";
const COL_WORK_THEME_DIR = "作品_主题所属目录";
const COL_WORK_LIKE_COUNT = "作品_作品被点赞数";
const COL_WORK_COMMENT_COUNT = "作品_作品被评论数";
const COL_WORK_TEACHER = "作品_教师姓名";
const COL_WORK_TEACHER_SCORE = "作品_教师评分";
const COL_WORK_TEACHER_COMMENT = "作品_教师评语";
const COL_WORK_LIKE_DETAILS = "点赞学生姓名列表";
const COL_WORK_ACTIVITY_COUNT = "埋点记录数";

// Resources CSV column names
const RES_COL_CONTENT = "content";
const RES_COL_CODE = "代码 code";
const RES_COL_KNOWLEDGE = "知识点";
const RES_COL_MAIN = "主要的知识点";
const RES_COL_QUESTION_PREFIX = "试题-题干";
const RES_COL_CODE_PREFIX = "试题-代码";
const RES_COL_KNOWLEDGE_PREFIX = "试题-知识点";
const RES_COL_ANSWER_PREFIX = "试题-答案";
const RES_COL_VIDEO_URL = "视频链接";
const RES_COL_TEXTBOOK_PAGE = "教材-对应的页码";
const RES_COL_ID = "id";

// Likert scale mapping: 非常同意=5, 同意=4, 一般=3, 不同意=2, 非常不同意=1
const LIKERT_MAP: Record<string, number> = {
  非常同意: 5,
  同意: 4,
  一般: 3,
  不同意: 2,
  非常不同意: 1,
};

// 10 aggregate dimensions mapped to 问卷_列 indices (1-based column number in CSV)
// 问卷_列16~53 = 38 Likert items
const DIMENSION_ITEM_MAP: Record<string, number[]> = {
  learningMotivation: [16, 17, 18], // 学习动机
  learningAttitude: [19, 20, 21], // 学习态度
  learningEngagement: [22, 23, 24], // 学习投入
  selfRegulatedLearning: [25, 26, 27], // 自我调节学习
  computationalThinking: [28, 29, 30], // 计算思维
  learningMethod: [31, 32, 33], // 学习方法倾向
  cognitiveLoad: [34, 35, 36], // 认知负荷
  humanAiTrust: [37, 38, 39], // 人机信任度
  aiLiteracy: [40, 41, 42, 43, 44, 45, 46, 47], // 人工智能素养
  knowledgeReserve: [48, 49, 50, 51, 52, 53], // 知识储备
};

function scoreLevel(score: number, maxScore: number): string {
  const ratio = score / maxScore;
  if (ratio >= 0.8) return "高";
  if (ratio >= 0.6) return "中";
  return "低";
}

type CsvRow = Record<string, string>;

export class OnlineCourseLongFormatAdapter implements PlatformAdapter {
  readonly scenarioCode = SCENARIO_CODE;
  private classGradeMap: Map<string, number> | null = null;

  constructor(
    private readonly datasDir: string,
    private readonly filename: string = DEFAULT_FILENAME,
  ) {}

  async parse(): Promise<NormalizedPlatformData> {
    const rows = this.readCsv();
    this.classGradeMap = this.buildClassGradeMap(rows);

    const resourceRows = this.readResourcesCsv();

    const schools = this.buildSchools(rows);
    const classes = this.buildClasses(rows);
    const users = this.buildUsers(rows);
    const { knowledges, resources, resourceKnowledgeRelations } =
      this.buildKnowledgesAndResources(resourceRows);
    const sessions = this.buildSessions(classes, schools);
    const studentKnowledgeRelations = this.buildStudentKnowledgeRelations(rows);
    const interactions = this.buildInteractions(rows, sessions);
    const cognitiveProfiles = this.buildCognitiveProfiles(rows);
    const studentWorks = this.buildStudentWorks(rows, sessions);

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
      resources,
      resourceKnowledgeRelations,
      sessions,
      studentKnowledgeRelations,
      interactions,
      cognitiveProfiles,
      studentWorks,
      sourceStats: {
        longFormatRows: rows.length,
        resourceRows: resourceRows.length,
      },
    };
  }

  private readResourcesCsv(): CsvRow[] {
    const filepath = path.join(this.datasDir, RESOURCES_FILENAME);
    if (!fs.existsSync(filepath)) {
      return [];
    }
    const content = fs.readFileSync(filepath, "utf-8");
    return csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
  }

  private readCsv(): CsvRow[] {
    const filepath = path.join(this.datasDir, this.filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`CSV not found: ${filepath}`);
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
      const externalId = this.resolveSchool(row);
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      schools.push({ externalId, name: externalId });
    }
    return schools;
  }

  /**
   * 为每个 (school, class) 组合选取最频繁的年级作为该班级的规范年级。
   * 原始数据中同一名称的班级可能出现在多个年级，按最频繁值归一化后可避免班级被拆散。
   */
  private resolveSchool(row: CsvRow): string {
    return (
      (row[COL_SCHOOL] || "").trim() ||
      (row[COL_SCHOOL_FALLBACK] || "").trim()
    );
  }

  private buildClassGradeMap(rows: CsvRow[]): Map<string, number> {
    const gradeCounts = new Map<string, Map<number, number>>();

    for (const row of rows) {
      const school = this.resolveSchool(row);
      const className = (row[COL_CLASS] || "").trim();
      const gradeName = this.parseGradeFromSurvey(row[COL_GRADE]);
      if (!school || !className || gradeName == null) continue;

      const key = `${school}:${className}`;
      const counts = gradeCounts.get(key) || new Map<number, number>();
      counts.set(gradeName, (counts.get(gradeName) || 0) + 1);
      gradeCounts.set(key, counts);
    }

    const map = new Map<string, number>();
    for (const [key, counts] of gradeCounts) {
      let bestGrade = 0;
      let bestCount = -1;
      for (const [grade, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          bestGrade = grade;
        }
      }
      map.set(key, bestGrade);
    }

    return map;
  }

  private buildClasses(rows: CsvRow[]): NormalizedClassGroup[] {
    const classGradeMap = this.buildClassGradeMap(rows);
    const seen = new Set<string>();
    const classes: NormalizedClassGroup[] = [];
    for (const row of rows) {
      const school = this.resolveSchool(row);
      const rawClass = (row[COL_CLASS] || "").trim();
      if (!school || !rawClass) continue;

      const key = `${school}:${rawClass}`;
      const gradeName = classGradeMap.get(key);
      if (gradeName == null) continue;

      const className = rawClass;
      const seenKey = `${school}|${gradeName}|${className}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      classes.push({ externalSchoolId: school, gradeName, className });
    }
    return classes;
  }

  private buildUsers(rows: CsvRow[]): NormalizedUser[] {
    const classGradeMap = this.buildClassGradeMap(rows);
    const seenStudents = new Set<string>();
    const seenTeachers = new Set<string>();
    const users: NormalizedUser[] = [];
    for (const row of rows) {
      const externalId = (row[COL_USER_ID] || "").trim();
      if (!externalId || seenStudents.has(externalId)) continue;
      seenStudents.add(externalId);
      const displayName = (row[COL_DISPLAY_NAME] || "").trim();
      const school = this.resolveSchool(row);
      const rawClass = (row[COL_CLASS] || "").trim();
      const className = rawClass || null;
      const gradeName =
        school && rawClass
          ? classGradeMap.get(`${school}:${rawClass}`) ??
            this.parseGradeFromSurvey(row[COL_GRADE])
          : this.parseGradeFromSurvey(row[COL_GRADE]);
      const gender = (row[COL_GENDER] || "").trim() || null;
      const learningStyle = (row["问卷_列13"] || "").trim() || null;
      const personality = (row["问卷_列14"] || "").trim() || null;
      const groupBehavior = (row["问卷_列15"] || "").trim() || null;
      const aiContentSatisfaction = this.parseIntOrNull(row[COL_Q4]);
      const resourceHelpfulness = this.parseIntOrNull(row[COL_Q5]);
      const posterSatisfaction = this.parseIntOrNull(row[COL_Q6]);
      const teachingPreference = this.parseIntOrNull(row[COL_Q7]);
      const helpSource = this.parseIntOrNull(row[COL_Q8]);

      users.push({
        externalId,
        role: "STUDENT",
        displayName: displayName || externalId,
        externalUserId: displayName || null,
        externalSchoolId: school || null,
        gradeName,
        className,
        gender,
        learningStyle,
        personality,
        groupBehavior,
        aiContentSatisfaction,
        resourceHelpfulness,
        posterSatisfaction,
        teachingPreference,
        helpSource,
      });
    }

    // 为每个班级生成一个教师节点（姓名来自作品_教师姓名）
    for (const row of rows) {
      const school = this.resolveSchool(row);
      const rawClass = (row[COL_CLASS] || "").trim();
      if (!school || !rawClass) continue;

      const gradeName = classGradeMap.get(`${school}:${rawClass}`);
      if (gradeName == null) continue;

      const teacherName = (row[COL_WORK_TEACHER] || "").trim();
      if (!teacherName) continue;

      const externalId = `${school}:${gradeName}:${rawClass}:teacher`;
      if (seenTeachers.has(externalId)) continue;
      seenTeachers.add(externalId);

      users.push({
        externalId,
        role: "TEACHER",
        displayName: teacherName,
        externalUserId: null,
        externalSchoolId: school,
        gradeName,
        className: rawClass,
        subject: null,
      });
    }

    return users;
  }

  private buildKnowledgesAndResources(
    resourceRows: CsvRow[],
  ): {
    knowledges: NormalizedKnowledge[];
    resources: NormalizedResource[];
    resourceKnowledgeRelations: NormalizedResourceKnowledgeRelation[];
  } {
    const resources: NormalizedResource[] = [];
    const resourceById = new Map<string, NormalizedResource>();
    const knowledgeById = new Map<string, NormalizedKnowledge>();
    const relations: NormalizedResourceKnowledgeRelation[] = [];

    for (const row of resourceRows) {
      const resourceId = (row[RES_COL_ID] || "").trim();
      const videoUrl = (row[RES_COL_VIDEO_URL] || "").trim();
      if (!resourceId || !videoUrl) continue;

      const mainKnowledge = (row[RES_COL_MAIN] || "").trim();
      const resourceTitle = mainKnowledge || `资源 ${resourceId}`;

      if (!resourceById.has(resourceId)) {
        const resource: NormalizedResource = {
          externalId: resourceId,
          title: resourceTitle,
          description: (row[RES_COL_KNOWLEDGE] || "").trim() || null,
          url: videoUrl,
          resourceType: "VIDEO",
        };
        resourceById.set(resourceId, resource);
        resources.push(resource);
      }

      for (let i = 1; i <= 3; i++) {
        const title = (row[`${RES_COL_KNOWLEDGE_PREFIX}${i}`] || "").trim();
        if (!title) continue;

        const question = (row[`${RES_COL_QUESTION_PREFIX}${i}`] || "").trim();
        const code = (row[`${RES_COL_CODE_PREFIX}${i}`] || "").trim();
        const answer = (row[`${RES_COL_ANSWER_PREFIX}${i}`] || "").trim();

        const parts: string[] = [];
        if (question) parts.push(question);
        if (code) parts.push(`\n代码：\n${code}`);
        if (answer) parts.push(`\n答案：\n${answer}`);
        const content = parts.join("\n").trim() || null;

        const knowledgeId = `${resourceId}:knowledge:${i}`;
        if (!knowledgeById.has(knowledgeId)) {
          knowledgeById.set(knowledgeId, {
            externalId: knowledgeId,
            displayName: title,
            content,
            resourceExternalId: resourceId,
          });
        }

        relations.push({
          resourceExternalId: resourceId,
          knowledgeExternalId: knowledgeId,
        });
      }
    }

    return {
      knowledges: Array.from(knowledgeById.values()),
      resources,
      resourceKnowledgeRelations: relations,
    };
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
        sessionName: `${schoolName} ${c.gradeName}年级 ${c.className}`,
        occurredAt: DEFAULT_OCCURRED_AT,
      };
    });
  }

  private buildStudentKnowledgeRelations(
    rows: CsvRow[],
  ): NormalizedStudentKnowledgeRelation[] {
    // 学生与知识点的 STUDY 关系不再从原始 CSV 中直接推导，
    // 因为真实知识点来自 resources.csv，学生行为数据中没有直接对应键。
    // 导入后可通过 generate-random-study-interactions.ts 脚本补充。
    return [];
  }

  private buildInteractions(
    rows: CsvRow[],
    sessions: NormalizedSession[],
  ): NormalizedInteraction[] {
    const firstSessionExternalId = sessions[0]?.externalId;
    if (!firstSessionExternalId) return [];

    const interactions: NormalizedInteraction[] = [];

    for (const row of rows) {
      const targetExternalUserId = (row[COL_USER_ID] || "").trim();
      if (!targetExternalUserId) continue;
      const sessionExternalId =
        this.sessionExternalIdForRow(row) ?? firstSessionExternalId;

      // LIKE interactions from 点赞学生ID列表 (comma-separated user_ids)
      const likersRaw = (row[COL_LIKERS] || "").trim();
      if (likersRaw) {
        const likers = likersRaw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        for (const sourceExternalUserId of likers) {
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
      const commentsRaw = (row[COL_COMMENTS] || "").trim();
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

    // HELP_SEEKING & TEACHER_EVALUATION interactions between students and teachers
    const uniqueStudents = new Map<string, CsvRow>();
    for (const row of rows) {
      const studentId = (row[COL_USER_ID] || "").trim();
      if (!studentId || uniqueStudents.has(studentId)) continue;
      uniqueStudents.set(studentId, row);
    }

    for (const row of uniqueStudents.values()) {
      const studentId = (row[COL_USER_ID] || "").trim();
      const sessionExternalId =
        this.sessionExternalIdForRow(row) ?? firstSessionExternalId;
      if (!sessionExternalId) continue;

      const q8 = (row[COL_Q8] || "").trim();
      const teacherScore = (row[COL_WORK_TEACHER_SCORE] || "").trim();
      const teacherComment = (row[COL_WORK_TEACHER_COMMENT] || "").trim();
      const hasTeacherEvaluation = teacherScore !== "" || teacherComment !== "";
      const teacherExternalId = `${sessionExternalId}:teacher`;

      // Student -> Teacher: seeking help (real Q8=教师, or student has teacher evaluation)
      if (q8 === "1" || hasTeacherEvaluation) {
        interactions.push({
          sourceExternalUserId: studentId,
          targetExternalUserId: teacherExternalId,
          sessionExternalId,
          interactionType: "PLATFORM",
          actionType: "HELP_SEEKING",
          strength: 1,
        });
      }

      // Teacher -> Student: evaluation based on mocked score/comment in CSV
      if (hasTeacherEvaluation) {
        const scoreValue = this.parseIntOrNull(teacherScore) ?? 1;
        interactions.push({
          sourceExternalUserId: teacherExternalId,
          targetExternalUserId: studentId,
          sessionExternalId,
          interactionType: "PLATFORM",
          actionType: "TEACHER_EVALUATION",
          strength: scoreValue,
        });
      }
    }

    return interactions;
  }

  private buildCognitiveProfiles(
    rows: CsvRow[],
  ): NormalizedCognitiveProfile[] {
    const seen = new Set<string>();
    const profiles: NormalizedCognitiveProfile[] = [];

    for (const row of rows) {
      const studentExternalId = (row[COL_USER_ID] || "").trim();
      if (!studentExternalId || seen.has(studentExternalId)) continue;
      seen.add(studentExternalId);

      const dimensions: NormalizedCognitiveScore[] = [];
      let totalScore = 0;

      for (const [dimCode, colIndices] of Object.entries(
        DIMENSION_ITEM_MAP,
      )) {
        const values: number[] = [];
        for (const colNum of colIndices) {
          const colKey = `问卷_列${colNum}`;
          const raw = (row[colKey] || "").trim();
          const val = LIKERT_MAP[raw];
          if (val != null) values.push(val);
        }
        if (values.length === 0) continue;

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const scoreValue = Number(avg.toFixed(2));
        totalScore += scoreValue;
        dimensions.push({
          dimensionCode: dimCode,
          scoreValue,
          scoreLevel: scoreLevel(scoreValue, 5),
        });
      }

      if (dimensions.length === 0) continue;

      profiles.push({
        studentExternalId,
        profileVersion: "v1",
        generatedAt: DEFAULT_OCCURRED_AT,
        totalScore: Number(totalScore.toFixed(2)),
        dimensions,
      });
    }

    return profiles;
  }

  private buildStudentWorks(
    rows: CsvRow[],
    sessions: NormalizedSession[],
  ): NormalizedStudentWork[] {
    const works: NormalizedStudentWork[] = [];
    const firstSessionExternalId = sessions[0]?.externalId;

    for (const row of rows) {
      const workId = (row[COL_WORK_ID] || "").trim();
      if (!workId) continue;

      const studentExternalId = (row[COL_USER_ID] || "").trim();
      if (!studentExternalId) continue;

      const sessionExternalId =
        this.sessionExternalIdForRow(row) ?? firstSessionExternalId ?? "";
      const teacherExternalId = sessionExternalId
        ? `${sessionExternalId}:teacher`
        : null;
      const workName = (row[COL_WORK_NAME] || "").trim() || `作品 ${workId}`;
      const publishedAtStr = (row[COL_WORK_PUBLISHED_AT] || "").trim();
      const publishedAt = publishedAtStr ? new Date(publishedAtStr) : null;
      const teacherScoreStr = (row[COL_WORK_TEACHER_SCORE] || "").trim();
      const teacherScore = teacherScoreStr ? Number(teacherScoreStr) : null;

      works.push({
        studentExternalId,
        sessionExternalId,
        externalWorkId: `${studentExternalId}:${workId}`,
        workName,
        publishedAt,
        themeId: (row[COL_THEME_ID] || "").trim() || null,
        themeName: (row[COL_THEME_NAME] || "").trim() || null,
        themeDirectory: (row[COL_WORK_THEME_DIR] || "").trim() || null,
        textbookName: (row[COL_WORK_TEXTBOOK] || "").trim() || null,
        likeCount: this.parseIntOrNull(row[COL_WORK_LIKE_COUNT]) ?? 0,
        commentCount: this.parseIntOrNull(row[COL_WORK_COMMENT_COUNT]) ?? 0,
        teacherExternalId,
        teacherScore: teacherScore != null && !isNaN(teacherScore)
          ? teacherScore
          : null,
        teacherComment: (row[COL_WORK_TEACHER_COMMENT] || "").trim() || null,
        likeDetails: (row[COL_WORK_LIKE_DETAILS] || "").trim() || null,
        commentDetails: (row[COL_COMMENTS] || "").trim() || null,
        activityLogCount: this.parseIntOrNull(row[COL_WORK_ACTIVITY_COUNT]) ?? 0,
      });
    }

    return works;
  }

  private sessionExternalIdForRow(row: CsvRow): string | null {
    const school = this.resolveSchool(row);
    if (!school) return null;
    const rawClass = (row[COL_CLASS] || "").trim();
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    const key = `${school}:${className}`;
    const gradeName =
      rawClass && this.classGradeMap?.has(key)
        ? this.classGradeMap.get(key)!
        : this.parseGradeFromSurvey(row[COL_GRADE]);
    if (gradeName == null) return null;
    return `${school}:${gradeName}:${className}`;
  }

  private parseGradeFromSurvey(value: string | undefined): number | null {
    if (!value) return null;
    const match = value.match(/(\d+)/);
    if (!match) return null;
    return parseInt(match[1], 10);
  }

  private parseIntOrNull(value: string | undefined): number | null {
    if (!value) return null;
    const n = parseInt(value.trim(), 10);
    return isNaN(n) ? null : n;
  }
}
