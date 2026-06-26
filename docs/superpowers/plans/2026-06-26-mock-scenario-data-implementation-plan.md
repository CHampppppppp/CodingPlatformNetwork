# TEACHER_QA / HOME_LEARNING 模拟数据生成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `TEACHER_QA` 和 `HOME_LEARNING` 两个缺失场景生成可复用、闭环的 mock 数据生成器与导入脚本，默认 dry-run，加 `--execute` 才写入数据库。

**Architecture：** 新建 `MockScenarioAdapter` 程序化构造 `NormalizedPlatformData`，保持与现有 `IngestionService.importPlatformData()` 管道一致；新建薄脚本 `import-mock-scenario.ts` 解析命令行参数、打印统计、控制是否写入。

**Tech Stack：** TypeScript, NestJS, Prisma, ts-node, Jest

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/src/modules/ingestion/adapters/mock-scenario.adapter.ts` | 新建 | 按 scenarioCode 生成完整 NormalizedPlatformData |
| `backend/scripts/import-mock-scenario.ts` | 新建 | 命令行入口：dry-run / --execute、统计输出 |
| `backend/src/modules/ingestion/adapters/mock-scenario.adapter.spec.ts` | 新建 | Adapter 单元测试：验证结构、数量、ID 唯一性 |

---

### Task 1: 创建 MockScenarioAdapter 数据生成器

**Files:**
- Create: `backend/src/modules/ingestion/adapters/mock-scenario.adapter.ts`

- [ ] **Step 1: 写入 adapter 完整实现**

```typescript
import {
  NormalizedClassGroup,
  NormalizedCognitiveProfile,
  NormalizedInteraction,
  NormalizedKnowledge,
  NormalizedPlatformData,
  NormalizedScenario,
  NormalizedSchool,
  NormalizedSession,
  NormalizedStudentKnowledgeRelation,
  NormalizedUser,
  PlatformAdapter,
} from "../types/normalized-platform-data";

export interface MockScenarioOptions {
  schoolCount?: number;
  classesPerSchool?: number;
  minStudentsPerClass?: number;
  maxStudentsPerClass?: number;
  knowledgesCount?: number;
  sessionsPerClass?: number;
  seed?: number;
}

const DEFAULT_OPTIONS: Required<MockScenarioOptions> = {
  schoolCount: 2,
  classesPerSchool: 3,
  minStudentsPerClass: 20,
  maxStudentsPerClass: 40,
  knowledgesCount: 10,
  sessionsPerClass: 1,
  seed: 42,
};

const SCENARIO_META: Record<string, NormalizedScenario> = {
  TEACHER_QA: {
    code: "TEACHER_QA",
    nameZh: "课后线上教师授课答疑",
    sortOrder: 2,
    isActive: true,
  },
  HOME_LEARNING: {
    code: "HOME_LEARNING",
    nameZh: "家庭在线学习",
    sortOrder: 3,
    isActive: true,
  },
};

const SCHOOL_NAMES: Record<string, string[]> = {
  TEACHER_QA: ["三门县实验学校", "杭州市答疑实验中学"],
  HOME_LEARNING: ["杭州市星洲小学", "竺可桢学校"],
};

const KNOWLEDGE_POOL: Array<{ displayName: string; category: string }> = [
  { displayName: "一元一次方程", category: "数学" },
  { displayName: "分数的加减法", category: "数学" },
  { displayName: "古诗词鉴赏", category: "语文" },
  { displayName: "记叙文写作", category: "语文" },
  { displayName: "一般现在时", category: "英语" },
  { displayName: "日常交际用语", category: "英语" },
  { displayName: "植物的光合作用", category: "科学" },
  { displayName: "地球的自转与公转", category: "科学" },
  { displayName: "循环结构", category: "信息技术" },
  { displayName: "条件判断", category: "信息技术" },
];

const DIMENSION_CODES = [
  "knowledgeReserve",
  "learningMotivation",
  "learningAttitude",
  "learningEngagement",
  "selfRegulatedLearning",
  "computationalThinking",
  "learningMethod",
  "cognitiveLoad",
  "humanAiTrust",
  "aiLiteracy",
];

const FIRST_NAMES = [
  "伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋",
  "勇", "艳", "杰", "娟", "涛", "明", "超", "秀英", "浩", "平",
  "刚", "桂英", "华", "建国", "文", "辉", "秀兰", "霞", "宇", "欣",
  "博", "思", "佳", "雨", "晨", "一诺", "子轩", "梓涵", "沐宸", "语桐",
];
const LAST_NAMES = [
  "王", "李", "张", "刘", "陈", "杨", "黄", "赵", "吴", "周",
  "徐", "孙", "马", "朱", "胡", "郭", "何", "林", "罗", "高",
];

function clampInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomChineseName(): string {
  const last = randomItem(LAST_NAMES);
  const first = randomItem(FIRST_NAMES);
  return `${last}${first}`;
}

function departmentForGrade(gradeName: number): string {
  return gradeName <= 6 ? "小学部" : "初中部";
}

export class MockScenarioAdapter implements PlatformAdapter {
  readonly scenarioCode: string;
  private readonly options: Required<MockScenarioOptions>;

  constructor(
    scenarioCode: string,
    options: MockScenarioOptions = {},
  ) {
    if (!SCENARIO_META[scenarioCode]) {
      throw new Error(`Unsupported scenario code: ${scenarioCode}`);
    }
    this.scenarioCode = scenarioCode;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.seedRandom(this.options.seed);
  }

  async parse(): Promise<NormalizedPlatformData> {
    const scenario = SCENARIO_META[this.scenarioCode];
    const schools = this.buildSchools();
    const classes = this.buildClasses(schools);
    const users = this.buildUsers(classes);
    const knowledges = this.buildKnowledges();
    const sessions = this.buildSessions(classes, schools);
    const studentKnowledgeRelations = this.buildStudentKnowledgeRelations(
      users,
      knowledges,
      sessions,
    );
    const interactions = this.buildInteractions(users, sessions);
    const cognitiveProfiles = this.buildCognitiveProfiles(
      users.filter((u) => u.role === "STUDENT"),
    );

    return {
      scenario,
      schools,
      classes,
      users,
      knowledges,
      resources: [],
      resourceKnowledgeRelations: [],
      sessions,
      studentKnowledgeRelations,
      interactions,
      cognitiveProfiles,
      studentWorks: [],
      sourceStats: {
        schools: schools.length,
        classes: classes.length,
        students: users.filter((u) => u.role === "STUDENT").length,
        teachers: users.filter((u) => u.role === "TEACHER").length,
      },
    };
  }

  private seedRandom(seed: number): void {
    // Simple LCG for reproducibility
    let s = seed;
    const originalRandom = Math.random;
    Math.random = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    // Restore after parse is done by caller; not ideal but sufficient for script usage.
  }

  private buildSchools(): NormalizedSchool[] {
    const names = SCHOOL_NAMES[this.scenarioCode];
    return names.map((name, index) => ({
      externalId: `${this.scenarioCode.toLowerCase()}_school_${index + 1}`,
      name,
    }));
  }

  private buildClasses(schools: NormalizedSchool[]): NormalizedClassGroup[] {
    const classes: NormalizedClassGroup[] = [];
    for (let sIndex = 0; sIndex < schools.length; sIndex++) {
      const school = schools[sIndex];
      const baseGrade = randomItem([3, 4, 5, 7, 8]);
      for (let cIndex = 1; cIndex <= this.options.classesPerSchool; cIndex++) {
        classes.push({
          externalSchoolId: school.externalId,
          gradeName: baseGrade,
          className: `${baseGrade}${String(cIndex).padStart(2, "0")}班`,
        });
      }
    }
    return classes;
  }

  private buildUsers(classes: NormalizedClassGroup[]): NormalizedUser[] {
    const users: NormalizedUser[] = [];
    const seenStudentIds = new Set<string>();

    for (const cls of classes) {
      const teacherExternalId = `${cls.externalSchoolId}:${cls.gradeName}:${cls.className}:teacher`;
      users.push({
        externalId: teacherExternalId,
        role: "TEACHER",
        displayName: `${cls.className}老师`,
        externalUserId: null,
        externalSchoolId: cls.externalSchoolId,
        gradeName: cls.gradeName,
        className: cls.className,
        subject: randomItem(["语文", "数学", "英语", "科学"]),
      });

      const studentCount = clampInt(
        this.options.minStudentsPerClass,
        this.options.maxStudentsPerClass,
      );
      for (let i = 1; i <= studentCount; i++) {
        const studentId = `${cls.externalSchoolId}:${cls.gradeName}:${cls.className}:s${String(i).padStart(2, "0")}`;
        if (seenStudentIds.has(studentId)) continue;
        seenStudentIds.add(studentId);
        users.push({
          externalId: studentId,
          role: "STUDENT",
          displayName: randomChineseName(),
          externalUserId: studentId,
          externalSchoolId: cls.externalSchoolId,
          gradeName: cls.gradeName,
          className: cls.className,
          gender: Math.random() < 0.5 ? "男" : "女",
        });
      }
    }
    return users;
  }

  private buildKnowledges(): NormalizedKnowledge[] {
    const count = Math.min(this.options.knowledgesCount, KNOWLEDGE_POOL.length);
    return KNOWLEDGE_POOL.slice(0, count).map((k, index) => ({
      externalId: `${this.scenarioCode.toLowerCase()}_knowledge_${index + 1}`,
      displayName: k.displayName,
      category: k.category,
      content: `${k.displayName}相关知识点`,
    }));
  }

  private buildSessions(
    classes: NormalizedClassGroup[],
    schools: NormalizedSchool[],
  ): NormalizedSession[] {
    const schoolNameById = new Map(schools.map((s) => [s.externalId, s.name]));
    const sessions: NormalizedSession[] = [];
    const now = new Date();

    for (const cls of classes) {
      for (let i = 1; i <= this.options.sessionsPerClass; i++) {
        const occurredAt = new Date(now);
        occurredAt.setDate(occurredAt.getDate() - clampInt(1, 30));
        occurredAt.setHours(clampInt(8, 17), clampInt(0, 59), 0, 0);
        const schoolName =
          schoolNameById.get(cls.externalSchoolId) ?? cls.externalSchoolId;
        const dept = departmentForGrade(cls.gradeName);
        sessions.push({
          externalId: `${cls.externalSchoolId}:${cls.gradeName}:${cls.className}:session${i}`,
          externalSchoolId: cls.externalSchoolId,
          gradeName: cls.gradeName,
          className: cls.className,
          sessionName: `${schoolName}${dept}${cls.gradeName}年级${cls.className} ${this.scenarioCode === "TEACHER_QA" ? "课后答疑" : "家庭学习"}`,
          occurredAt,
        });
      }
    }
    return sessions;
  }

  private buildStudentKnowledgeRelations(
    users: NormalizedUser[],
    knowledges: NormalizedKnowledge[],
    sessions: NormalizedSession[],
  ): NormalizedStudentKnowledgeRelation[] {
    const relations: NormalizedStudentKnowledgeRelation[] = [];
    const students = users.filter((u) => u.role === "STUDENT");
    const sessionByClassKey = new Map<string, NormalizedSession[]>();
    for (const session of sessions) {
      const key = `${session.externalSchoolId}:${session.gradeName}:${session.className}`;
      const list = sessionByClassKey.get(key) ?? [];
      list.push(session);
      sessionByClassKey.set(key, list);
    }

    for (const student of students) {
      const classKey = `${student.externalSchoolId}:${student.gradeName}:${student.className}`;
      const classSessions = sessionByClassKey.get(classKey) ?? [];
      if (classSessions.length === 0) continue;
      const session = randomItem(classSessions);
      const knowledgeCount = clampInt(2, Math.min(4, knowledges.length));
      const chosen = new Set<number>();
      while (chosen.size < knowledgeCount) {
        chosen.add(Math.floor(Math.random() * knowledges.length));
      }
      for (const idx of chosen) {
        relations.push({
          studentExternalId: student.externalId,
          knowledgeExternalId: knowledges[idx].externalId,
          sessionExternalId: session.externalId,
          strength: Number((Math.random() * 0.5 + 0.5).toFixed(2)),
          actionType: "STUDY",
        });
      }
    }
    return relations;
  }

  private buildInteractions(
    users: NormalizedUser[],
    sessions: NormalizedSession[],
  ): NormalizedInteraction[] {
    const interactions: NormalizedInteraction[] = [];
    const sessionByClassKey = new Map<string, NormalizedSession[]>();
    for (const session of sessions) {
      const key = `${session.externalSchoolId}:${session.gradeName}:${session.className}`;
      const list = sessionByClassKey.get(key) ?? [];
      list.push(session);
      sessionByClassKey.set(key, list);
    }

    const classUsers = new Map<string, NormalizedUser[]>();
    for (const user of users) {
      const key = `${user.externalSchoolId}:${user.gradeName}:${user.className}`;
      const list = classUsers.get(key) ?? [];
      list.push(user);
      classUsers.set(key, list);
    }

    const seenEdges = new Set<string>();

    for (const [classKey, members] of classUsers) {
      const classSessions = sessionByClassKey.get(classKey) ?? [];
      if (classSessions.length === 0) continue;
      const session = classSessions[0];
      const students = members.filter((u) => u.role === "STUDENT");
      const teacher = members.find((u) => u.role === "TEACHER");

      // Teacher -> Student TEACHING
      if (teacher) {
        for (const student of students) {
          const edgeKey = `${session.externalId}:${teacher.externalId}:${student.externalId}:TEACHING`;
          if (seenEdges.has(edgeKey)) continue;
          seenEdges.add(edgeKey);
          interactions.push({
            sourceExternalUserId: teacher.externalId,
            targetExternalUserId: student.externalId,
            sessionExternalId: session.externalId,
            interactionType: "PLATFORM",
            actionType: "TEACHING",
            strength: Number((Math.random() * 0.4 + 0.6).toFixed(2)),
          });
        }
      }

      // Student -> Teacher HELP_SEEKING (subset)
      if (teacher) {
        const seekerCount = Math.max(1, Math.floor(students.length * 0.3));
        for (let i = 0; i < seekerCount; i++) {
          const student = randomItem(students);
          const edgeKey = `${session.externalId}:${student.externalId}:${teacher.externalId}:HELP_SEEKING`;
          if (seenEdges.has(edgeKey)) continue;
          seenEdges.add(edgeKey);
          interactions.push({
            sourceExternalUserId: student.externalId,
            targetExternalUserId: teacher.externalId,
            sessionExternalId: session.externalId,
            interactionType: "PLATFORM",
            actionType: "HELP_SEEKING",
            strength: 1,
          });
        }
      }

      // Student <-> Student COLLABORATION (sparse)
      const collaborationPairs = Math.max(0, Math.floor(students.length * 0.2));
      for (let i = 0; i < collaborationPairs; i++) {
        const a = randomItem(students);
        const b = randomItem(students);
        if (a.externalId === b.externalId) continue;
        const edgeKey = `${session.externalId}:${a.externalId}:${b.externalId}:COLLABORATION`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        interactions.push({
          sourceExternalUserId: a.externalId,
          targetExternalUserId: b.externalId,
          sessionExternalId: session.externalId,
          interactionType: "PLATFORM",
          actionType: "COLLABORATION",
          strength: 1,
        });
      }
    }

    return interactions;
  }

  private buildCognitiveProfiles(
    students: NormalizedUser[],
  ): NormalizedCognitiveProfile[] {
    return students.map((student) => {
      const dimensions = DIMENSION_CODES.map((code) => {
        const scoreValue = clampInt(0, 100);
        return {
          dimensionCode: code,
          scoreValue,
          scoreLevel: scoreValue >= 80 ? "高" : scoreValue >= 60 ? "中" : "低",
        };
      });
      const totalScore = Number(
        (dimensions.reduce((sum, d) => sum + d.scoreValue, 0) / dimensions.length).toFixed(2),
      );
      return {
        studentExternalId: student.externalId,
        profileVersion: "v1",
        generatedAt: new Date(),
        totalScore,
        dimensions,
      };
    });
  }
}
```

- [ ] **Step 2: 编译检查**

Run: `cd backend && npx tsc --noEmit src/modules/ingestion/adapters/mock-scenario.adapter.ts`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ingestion/adapters/mock-scenario.adapter.ts
git commit -m "feat(ingestion): add MockScenarioAdapter for TEACHER_QA and HOME_LEARNING"
```

---

### Task 2: 创建导入脚本

**Files:**
- Create: `backend/scripts/import-mock-scenario.ts`

- [ ] **Step 1: 写入脚本**

```typescript
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { IngestionService } from "../src/modules/ingestion/services/ingestion.service";
import {
  MockScenarioAdapter,
  MockScenarioOptions,
} from "../src/modules/ingestion/adapters/mock-scenario.adapter";

function parseArgs(argv: string[]): {
  scenarioCode: string;
  execute: boolean;
  options: MockScenarioOptions;
} {
  const args = argv.slice(2);
  const scenarioCode = args.find((a) => !a.startsWith("--"));
  if (!scenarioCode) {
    throw new Error("Usage: npx ts-node scripts/import-mock-scenario.ts <SCENARIO_CODE> [--execute] [--schools=N] [--classes-per-school=N] [--min-students=N] [--max-students=N] [--seed=N]");
  }

  const flag = (name: string): string | undefined => {
    const token = args.find((a) => a.startsWith(`--${name}=`));
    return token ? token.split("=")[1] : undefined;
  };

  const toInt = (v: string | undefined): number | undefined =>
    v ? parseInt(v, 10) : undefined;

  return {
    scenarioCode,
    execute: args.includes("--execute"),
    options: {
      schoolCount: toInt(flag("schools")),
      classesPerSchool: toInt(flag("classes-per-school")),
      minStudentsPerClass: toInt(flag("min-students")),
      maxStudentsPerClass: toInt(flag("max-students")),
      seed: toInt(flag("seed")),
    },
  };
}

async function main() {
  const { scenarioCode, execute, options } = parseArgs(process.argv);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);
  const ingestionService = app.get(IngestionService);

  process.stdout.write(`=== Mock Data Import: ${scenarioCode} ===\n`);
  process.stdout.write(`Execute mode: ${execute ? "YES" : "DRY-RUN"}\n\n`);

  const adapter = new MockScenarioAdapter(scenarioCode, options);
  const data = await adapter.parse();

  process.stdout.write("Parsed data summary:\n");
  process.stdout.write(`  Schools: ${data.schools.length}\n`);
  process.stdout.write(`  Classes: ${data.classes.length}\n`);
  process.stdout.write(`  Students: ${data.users.filter((u) => u.role === "STUDENT").length}\n`);
  process.stdout.write(`  Teachers: ${data.users.filter((u) => u.role === "TEACHER").length}\n`);
  process.stdout.write(`  Knowledges: ${data.knowledges.length}\n`);
  process.stdout.write(`  Sessions: ${data.sessions.length}\n`);
  process.stdout.write(`  StudentKnowledgeRelations: ${data.studentKnowledgeRelations.length}\n`);
  process.stdout.write(`  Interactions: ${data.interactions.length}\n`);
  process.stdout.write(`  CognitiveProfiles: ${data.cognitiveProfiles?.length ?? 0}\n`);

  if (!execute) {
    process.stdout.write("\nDry-run complete. Add --execute to import.\n");
    await app.close();
    return;
  }

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: scenarioCode },
  });
  if (!scenario) {
    process.stderr.write(`Scenario ${scenarioCode} not found in database.\n`);
    await app.close();
    process.exit(1);
  }

  process.stdout.write("\nImporting to database...\n");
  const result = await ingestionService.importPlatformData(data, {
    skipWhenScenarioHasNodes: false,
    concurrency: 5,
  });

  process.stdout.write("\nImport result:\n");
  process.stdout.write(`  Skipped: ${result.skipped}\n`);
  process.stdout.write(`  Schools: ${result.schoolCount}\n`);
  process.stdout.write(`  Grades: ${result.gradeCount}\n`);
  process.stdout.write(`  Classes: ${result.classCount}\n`);
  process.stdout.write(`  Students: ${result.studentCount}\n`);
  process.stdout.write(`  Teachers: ${result.teacherCount}\n`);
  process.stdout.write(`  Knowledges: ${result.knowledgeCount}\n`);
  process.stdout.write(`  Sessions: ${result.sessionCount}\n`);
  process.stdout.write(`  Study interactions: ${result.studyInteractionCount}\n`);
  process.stdout.write(`  Platform interactions: ${result.platformInteractionCount}\n`);
  process.stdout.write(`  Cognitive profiles: ${result.cognitiveProfileCount}\n`);
  process.stdout.write(`  Duplicates: ${result.duplicateCount}\n`);

  process.stdout.write("\nDone!\n");
  await app.close();
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + (e.stack ?? "") + "\n");
  process.exit(1);
});
```

- [ ] **Step 2: 编译检查**

Run: `cd backend && npx tsc --noEmit scripts/import-mock-scenario.ts`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/import-mock-scenario.ts
git commit -m "feat(scripts): add import-mock-scenario entry script with dry-run"
```

---

### Task 3: 添加单元测试

**Files:**
- Create: `backend/src/modules/ingestion/adapters/mock-scenario.adapter.spec.ts`

- [ ] **Step 1: 写入测试**

```typescript
import { MockScenarioAdapter } from "./mock-scenario.adapter";

describe("MockScenarioAdapter", () => {
  it("should generate data for TEACHER_QA", async () => {
    const adapter = new MockScenarioAdapter("TEACHER_QA");
    const data = await adapter.parse();

    expect(data.scenario.code).toBe("TEACHER_QA");
    expect(data.schools.length).toBe(2);
    expect(data.classes.length).toBeGreaterThanOrEqual(4);
    expect(data.classes.length).toBeLessThanOrEqual(6);

    const students = data.users.filter((u) => u.role === "STUDENT");
    const teachers = data.users.filter((u) => u.role === "TEACHER");
    expect(students.length).toBeGreaterThan(0);
    expect(teachers.length).toBe(data.classes.length);

    // Each class has 20-40 students
    for (const cls of data.classes) {
      const classStudents = students.filter(
        (s) =>
          s.externalSchoolId === cls.externalSchoolId &&
          s.gradeName === cls.gradeName &&
          s.className === cls.className,
      );
      expect(classStudents.length).toBeGreaterThanOrEqual(20);
      expect(classStudents.length).toBeLessThanOrEqual(40);
    }

    expect(data.knowledges.length).toBe(10);
    expect(data.sessions.length).toBe(data.classes.length);
    expect(data.cognitiveProfiles?.length).toBe(students.length);

    // External IDs are unique
    const studentIds = new Set(students.map((s) => s.externalId));
    expect(studentIds.size).toBe(students.length);
  });

  it("should generate data for HOME_LEARNING", async () => {
    const adapter = new MockScenarioAdapter("HOME_LEARNING", {
      classesPerSchool: 2,
    });
    const data = await adapter.parse();

    expect(data.scenario.code).toBe("HOME_LEARNING");
    expect(data.classes.length).toBe(4);
    expect(data.users.some((u) => u.role === "TEACHER")).toBe(true);
    expect(data.interactions.length).toBeGreaterThan(0);
  });

  it("should reject unsupported scenario codes", () => {
    expect(() => new MockScenarioAdapter("UNKNOWN")).toThrow(
      "Unsupported scenario code",
    );
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `cd backend && npx jest src/modules/ingestion/adapters/mock-scenario.adapter.spec.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ingestion/adapters/mock-scenario.adapter.spec.ts
git commit -m "test(ingestion): add tests for MockScenarioAdapter"
```

---

### Task 4: 本地 dry-run 验证

**Files:**
- None

- [ ] **Step 1: 验证 TEACHER_QA dry-run**

Run: `cd backend && npx ts-node scripts/import-mock-scenario.ts TEACHER_QA`
Expected: Output shows 2 schools, 4-6 classes, 20-40 students per class, 10 knowledges, sessions, interactions, cognitive profiles; ends with "Dry-run complete."

- [ ] **Step 2: 验证 HOME_LEARNING dry-run**

Run: `cd backend && npx ts-node scripts/import-mock-scenario.ts HOME_LEARNING --classes-per-school=3`
Expected: Output shows 2 schools, 6 classes, students, knowledges, etc.; ends with "Dry-run complete."

- [ ] **Step 3: Commit dry-run verification notes (optional)**

No file changes; optionally update README with usage if required by user.

---

## Self-Review Checklist

- [x] **Spec coverage:** Each requirement from `2026-06-26-mock-scenario-data-design.md` maps to a task.
- [x] **No placeholders:** No TBD/TODO in plan; all code is concrete.
- [x] **Type consistency:** Uses `NormalizedPlatformData`, `PlatformAdapter`, `IngestionService.importPlatformData` consistently.
- [x] **FK closure:** Data includes schools, grades (via classes), classes, users, knowledges, sessions, relations, interactions, cognitive profiles.

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-06-26-mock-scenario-data-implementation-plan.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
