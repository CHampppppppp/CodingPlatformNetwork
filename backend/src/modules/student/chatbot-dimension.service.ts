import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createPool, Pool, RowDataPacket } from "mysql2/promise";

const RECOGNIZED_BASE_DIMENSIONS = new Set([
  "COG_READING",
  "COG_LANGUAGE",
  "COG_SCIENCE_KNOWLEDGE",
  "COG_SCIENCE_INQUIRY",
  "COG_COMPUTATIONAL",
  "COG_TECH_LITERACY",
  "PSY_ANXIETY",
  "PSY_DEPRESSION",
  "PSY_RESILIENCE",
  "PSY_INTEREST_STABILITY",
  "PSY_PRESSURE",
  "PSY_LIFE_SATISFACTION",
  "PRAC_INNOVATION",
  "PRAC_PROBLEM_SOLVING",
  "PRAC_COLLABORATION",
  "PRAC_PRACTICE",
]);

const DIMENSION_NAME_ZH: Record<string, string> = {
  COG_READING: "阅读理解",
  COG_LANGUAGE: "语言表达",
  COG_SCIENCE_KNOWLEDGE: "科学知识",
  COG_SCIENCE_INQUIRY: "科学探究",
  COG_COMPUTATIONAL: "计算思维",
  COG_TECH_LITERACY: "技术素养",
  PSY_ANXIETY: "焦虑倾向",
  PSY_DEPRESSION: "抑郁倾向",
  PSY_RESILIENCE: "心理韧性",
  PSY_INTEREST_STABILITY: "兴趣稳定性",
  PSY_PRESSURE: "学业压力",
  PSY_LIFE_SATISFACTION: "生活满意度",
  PRAC_INNOVATION: "创新能力",
  PRAC_PROBLEM_SOLVING: "问题解决能力",
  PRAC_COLLABORATION: "协作能力",
  PRAC_PRACTICE: "实践能力",
};

const DIMENSION_CATEGORY: Record<string, string> = {
  COG_READING: "认知能力",
  COG_LANGUAGE: "认知能力",
  COG_SCIENCE_KNOWLEDGE: "认知能力",
  COG_SCIENCE_INQUIRY: "认知能力",
  COG_COMPUTATIONAL: "认知能力",
  COG_TECH_LITERACY: "认知能力",
  PSY_ANXIETY: "心理健康",
  PSY_DEPRESSION: "心理健康",
  PSY_RESILIENCE: "心理健康",
  PSY_INTEREST_STABILITY: "心理健康",
  PSY_PRESSURE: "心理健康",
  PSY_LIFE_SATISFACTION: "心理健康",
  PRAC_INNOVATION: "实践能力",
  PRAC_PROBLEM_SOLVING: "实践能力",
  PRAC_COLLABORATION: "实践能力",
  PRAC_PRACTICE: "实践能力",
};

export interface ChatbotDimensionIncrementItem {
  dimensionCode: string;
  dimensionNameZh: string;
  category: string;
  previousValue: number | null;
  newValue: number;
  changeDelta: number;
  reason: string;
  updatedAt: string | null;
}

export interface ChatbotDimensionIncrementResult {
  studentNodeId: string;
  baseDimensions: ChatbotDimensionIncrementItem[];
}

interface DimensionHistoryRow extends RowDataPacket {
  dimension_key: string;
  previous_value: string | null;
  new_value: string;
  change_delta: string;
  reason: string;
  created_at: string;
}

interface UserIdRow extends RowDataPacket {
  id: number;
}

@Injectable()
export class ChatbotDimensionService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatbotDimensionService.name);
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.CHATBOT_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("CHATBOT_DATABASE_URL is not set");
    }
    this.pool = createPool(this.parseDatabaseUrl(databaseUrl));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private parseDatabaseUrl(databaseUrl: string) {
    const url = new URL(databaseUrl);
    const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
    return {
      host,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    };
  }

  async getDimensionIncrement(
    studentNodeId: string,
  ): Promise<ChatbotDimensionIncrementResult | null> {
    const chatbotUserId = await this.resolveChatbotUserId(studentNodeId);
    if (!chatbotUserId) {
      return null;
    }

    const rows = await this.fetchLatestHistory(chatbotUserId);
    const baseDimensions = rows
      .filter((row) => RECOGNIZED_BASE_DIMENSIONS.has(row.dimension_key))
      .map((row) => this.mapRowToItem(row))
      .sort((a, b) => a.dimensionCode.localeCompare(b.dimensionCode));

    return {
      studentNodeId,
      baseDimensions,
    };
  }

  private async resolveChatbotUserId(
    studentNodeId: string,
  ): Promise<number | null> {
    try {
      const [rows] = await this.pool.execute<UserIdRow[]>(
        `SELECT id FROM users WHERE user_id = ? AND role = 1 AND disable = 0 AND Class = '801班'`,
        [studentNodeId],
      );
      return rows.length > 0 ? rows[0].id : null;
    } catch (error) {
      this.logger.error(
        `解析学生 chatbot 用户 ID 失败: ${studentNodeId}`,
        error,
      );
      return null;
    }
  }

  private async fetchLatestHistory(
    chatbotUserId: number,
  ): Promise<DimensionHistoryRow[]> {
    const [rows] = await this.pool.execute<DimensionHistoryRow[]>(
      `SELECT
         h.dimension_key,
         h.previous_value,
         h.new_value,
         h.change_delta,
         h.reason,
         h.created_at
       FROM student_dimension_score_history h
       INNER JOIN (
         SELECT dimension_key, MAX(id) AS max_id
         FROM student_dimension_score_history
         WHERE user_id = ?
         GROUP BY dimension_key
       ) latest ON h.dimension_key = latest.dimension_key AND h.id = latest.max_id
       WHERE h.user_id = ?`,
      [chatbotUserId, chatbotUserId],
    );
    return rows;
  }

  private mapRowToItem(row: DimensionHistoryRow): ChatbotDimensionIncrementItem {
    return {
      dimensionCode: row.dimension_key,
      dimensionNameZh: DIMENSION_NAME_ZH[row.dimension_key] ?? row.dimension_key,
      category: DIMENSION_CATEGORY[row.dimension_key] ?? "其他",
      previousValue:
        row.previous_value !== null
          ? Number(row.previous_value)
          : null,
      newValue: Number(row.new_value),
      changeDelta: Number(row.change_delta),
      reason: row.reason,
      updatedAt: row.created_at,
    };
  }
}
