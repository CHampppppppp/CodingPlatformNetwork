# ONLINE_COURSE 长表整合设计

日期：2026-06-13
状态：设计稿，待用户审阅

## 背景

`backend/datas/ONLINE_COURSE/` 下有 6 个原始 CSV：

- `ONLINE_COURSE_users.csv`（8965 行）—— 用户，含 `id` / `user_id` / `role` / `school` / `grade`（JSON 数组）/ `classes`
- `ONLINE_COURSE_classes.csv`（1458 行）—— 班级/课程
- `ONLINE_COURSE_knowledges.csv`（379 行）—— 知识点
- `ONLINE_COURSE_resources.csv`（1259 行）—— 资源
- `ONLINE_COURSE_comments.csv`（495 行）—— 评论
- `ONLINE_COURSE_likes.csv`（74 行）—— 点赞

用户希望把这 6 个 CSV 整合成 **1 个以学生为行的扁平长表**，列结构对齐 `backend/datas/标准数据格式示例.csv`（约 95 列）。这是一个**纯数据处理任务**，不修改后端代码、不入库、不调用 Prisma。

注：`标准数据格式示例.csv` 不被后端代码引用（grep 已确认），是离线参考模板。

## 目标

产出一份 `ONLINE_COURSE_long_format.csv`（约 8000 行 × 95 列），列结构与 `标准数据格式示例.csv` 严格一致；缺数据字段用确定性伪随机补齐；并附一份 `build_report.txt` 描述运行情况。

## 范围

**做**：

- 用 Python 标准库写一个独立脚本 `backend/datas/ONLINE_COURSE/build_long_format.py`
- 读取 6 个 ONLINE_COURSE CSV，按用户筛选规则 + 字段映射规则生成 1 份长表 CSV + 1 份运行报告
- 修复 `users.csv` 解析错位问题（用 `csv.DictReader` 按列名取，避免按位置切）

**不做**：

- 不修改 `backend/src/` 下任何代码
- 不改 Prisma schema、不连数据库、不跑现有 `import-online-course.ts`
- 不复用 `comments.csv` / `likes.csv` 的实际内容填进作品互动字段（用户决定全 mock）
- 不动 `标准数据格式示例.csv`
- 不写正式单元测试，仅在脚本内做轻量 sanity 校验

## 字段映射

### 直接利用 ONLINE_COURSE 真实数据（6 个映射）

| 长表列 | 源 | 取法 |
|---|---|---|
| 姓名 | `users.user_id` | 原值 |
| user_id | `users.id` | 原值 |
| school_id | `users.school` | 原值 |
| 年级 | `users.grade[0]` | `JSON.parse` 数组取第 1 个 |
| 班级 | `users.classes` | 原值（注意：与 `classes.id` 不对应的独立班号） |
| 1、你的学校 | `users.school` | 重复 `school_id` |
| 2、你的姓名 | `users.user_id` | 重复 |
| 3、你的年级 | `users.grade[0]` | 重复 |

### mock 补齐（约 80 列）

| 分组 | 字段数 | 策略 |
|---|---|---|
| 匿名问卷列（`问卷_列1` ~ `问卷_列53`）| 50 | 1-5 整数，确定性伪随机 |
| 学龄段 | 1 | 由 `grade[0]` 推断（1-6 → 小学，7-9 → 初中，10-12 → 高中）|
| 性别 | 1 | 男/女，确定性伪随机 |
| 答卷元数据（序号/提交时间/所用时间/来源/来源详情/IP/总分）| 7 | 自增 / 固定 2026-01-13 / 40-300s 随机 / 固定"链接" / 固定"直接访问" / 随机 IP / 18±2 |
| 满意度 4-7 | 4 | 3-5 整数（偏正向），确定性伪随机 |
| 第 8 题（开放题"谁给的帮助最大"）| 1 | 从固定字典 ["教师", "AI", "同学", "家长", "自己"] 选 |
| 作品字段 | 18 | 80% 学生有 mock 作品，20% 无；详见下方"作品 mock 策略" |

**确定性伪随机规则**：

```python
rng = random.Random(f"{user_external_id}:{column_name}")
# 同一 user_external_id + 同一 column_name 多次调用结果一致
```

- `column_name` 隔离：50 个问卷列各自独立 seed，避免不同列答案完全相关
- 默认全局 `seed=42`，可通过 `--seed` 参数调整

### Mock 字典清单

实现时所有固定字典：

```python
SCHOOL_STAGE_BY_GRADE = {
    **{i: "小学" for i in range(1, 7)},     # 1-6 年级
    **{i: "初中" for i in range(7, 10)},    # 7-9 年级
    **{i: "高中" for i in range(10, 13)},   # 10-12 年级
}

GENDER_OPTIONS = ["男", "女"]

OPEN_QUESTION_8_OPTIONS = ["教师", "AI", "同学", "家长", "自己"]

MOCK_TEACHER_NAMES = ["陈环环", "李建华"]
MOCK_WORK_TITLES = [
    "我的学校", "我的家乡", "我的偶像", "我最喜欢的书", "我的寒假生活",
    "向世界介绍我的学校", "我的家乡美食", "我的兴趣爱好", "我的梦想", "我的家庭",
]
MOCK_WORK_THEME = ("2026年寒假活动", "向世界介绍我的学校", "2032699")
MOCK_TEACHER_COMMENTS = [
    "完成度很好，继续保持！",
    "创意新颖，期待下一个作品。",
    "排版可以再优化一下。",
    "内容充实，结构清晰。",
    "非常用心的作品，给你点赞！",
]
SUBMIT_TIMESTAMP = "2026-01-13"  # 固定
SOURCE_CHANNEL = ("链接", "直接访问")  # 固定
```

### 作品 mock 策略

每个有作品的学生（80% 命中率）生成以下字段，**所有数值/字符串都用同一 `rng` 派生**：

| 字段 | mock 方式 |
|---|---|
| 作品_作品ID | `int(rng.randint(4000000, 4999999))` |
| 作品_作品名称 | 从 10+ 个固定标题中选 |
| 作品_作品发布时间 | 2026-01-13 ~ 2026-02-15 之间的随机日期 |
| 作品_学生姓名 | 重复"姓名"列 |
| 作品_所在班级 | 重复"班级"列 |
| 作品_所在学校 | 重复"1、你的学校"列 |
| 作品_学校ID | 重复"school_id"列 |
| 作品_所属教材 | 固定"（待补充）" |
| 作品_主题所属目录 | 固定"2026年寒假活动" |
| 作品_主题名称 | 固定"向世界介绍我的学校" |
| 作品_主题ID | 固定"2032699" |
| 作品_作品被点赞数 | `rng.randint(0, 15)` |
| 作品_作品被评论数 | `rng.randint(0, 5)` |
| 作品_教师姓名 | 从 ["陈环环", "李建华"] 选 |
| 作品_教师评分 | `rng.choice([None, 4, 5])`（部分学生有评分）|
| 作品_教师评语 | 80% 评语为空，20% 从 5 条固定评语中选 |
| 点赞学生ID列表 | `[]`（空 JSON 数组）|
| 点赞学生学校ID列表 | `[]` |
| 点赞时间列表 | `[]` |
| 点赞总数 | 同 `作品_作品被点赞数` |
| 点赞学生姓名列表 | `[]` |
| 评论内容列表 | `[]` |
| 埋点记录数 | `rng.randint(0, 30)` |
| 埋点meta数据 | `[]` |

无作品的学生（20%）：所有"作品_"前缀字段置空字符串或 0。

## 用户筛选规则

| 角色 | grade 形态 | 处理 |
|---|---|---|
| `role=1`（学生）| 单值 | 正常保留 |
| `role=1`（学生）| 多值 `[5,6]` | **保留行**，取第 1 个值；剩余值记入 `build_report.txt` |
| `role=1`（学生）| 解析失败（空串/非 JSON）| 跳过 + 记入 report |
| `role=2`（教师）| 单值 | 正常 |
| `role=2`（教师）| 多值 | 正常保留，**第 1 个值作为主年级写入长表"年级"列**，其他值记入 report |
| 其他 role（3/4/5/...）| — | 跳过 + 记入 report |
| 缺 `role` / `grade` / `school` 字段 | — | 跳过 + 记入 report |

教师与学生的输出长表结构完全一致（都是 95 列）。**教师节点的多年级展开属于 GraphNode schema 改造范围，本次不做。**

## 架构

### 文件结构

```
backend/datas/ONLINE_COURSE/
├── ONLINE_COURSE_classes.csv           ← 输入
├── ONLINE_COURSE_comments.csv          ← 输入
├── ONLINE_COURSE_knowledges.csv        ← 输入
├── ONLINE_COURSE_likes.csv             ← 输入
├── ONLINE_COURSE_resources.csv         ← 输入
├── ONLINE_COURSE_users.csv             ← 输入
├── build_long_format.py                ← 本次新增
├── ONLINE_COURSE_long_format.csv       ← 脚本输出（主产物）
└── build_report.txt                    ← 脚本输出（运行报告）
```

### 组件

```
build_long_format.py
├── 常量
│   ├── ROLE_STUDENT = "1"
│   ├── ROLE_TEACHER = "2"
│   ├── STANDARD_COLUMNS: list[str]    # 95 列名，按标准格式示例顺序写死
│   ├── QUESTIONNAIRE_COLS: list[str]  # 50 个匿名问卷列名
│   ├── SATISFACTION_QUESTIONS: list[(col, prompt)]
│   ├── WORK_HIT_RATE = 0.80
│   ├── MOCK_TEACHER_NAMES = ["陈环环", "李建华"]
│   ├── MOCK_WORK_TITLES = [...]       # 10+ 个固定标题
│   ├── MOCK_WORK_THEME = ("2026年寒假活动", "向世界介绍我的学校", "2032699")
│   └── MOCK_WORK_TEXTS = [...]        # 5 条固定评语
│
├── LongFormatBuilder 类
│   ├── __init__(datas_dir: Path, seed: int = 42)
│   ├── load_data() → dict[str, list[dict]]
│   │     # csv.DictReader, utf-8-sig
│   ├── filter_users(users) → (kept, dropped_count, warnings: list[str])
│   ├── mock_for_user(user) → dict
│   │     # 输出 1 个学生的全部 95 列
│   ├── build() → (rows: list[dict], report: dict)
│   ├── write_outputs(rows, report) → None
│   └── verify_output(rows, report) → None
│         # 写完后 sanity 校验
│
├── main() → argparse + 实例化 builder + build + write + verify
└── __name__ == "__main__" → main()
```

### CLI

```
python build_long_format.py [--datas-dir DIR] [--output-csv PATH] [--report PATH] [--seed N]
```

默认值：

- `--datas-dir`：脚本所在目录
- `--output-csv`：`<datas-dir>/ONLINE_COURSE_long_format.csv`
- `--report`：`<datas-dir>/build_report.txt`
- `--seed`：42

## 数据流

```
6 个 CSV 文件
    ↓
csv.DictReader 读入（utf-8-sig, bom=True, 按列名取）
    ↓
filter_users: 按 role 过滤 + 修 grade + 收集 warnings
    ↓
kept_users: list[dict]
    ↓
for each user in kept_users:
    mock_for_user(user) → 1 个 dict (95 列)
    ↓
rows: list[dict]
    ↓
csv.DictWriter 写 ONLINE_COURSE_long_format.csv
    - fieldnames = STANDARD_COLUMNS
    - 空值 → 空字符串
    - 编码 utf-8-sig
    ↓
写 build_report.txt
    ↓
verify_output() 校验
```

## 错误处理

| 失败场景 | 处理 |
|---|---|
| 输入 CSV 文件不存在 | `FileNotFoundError` → main 捕获 → 打印 + `exit(1)` |
| 输入 CSV 缺关键列（users 缺 `role`/`grade`/`id`/`user_id`）| `KeyError` → 同上 |
| 单个用户 grade 解析失败 | 跳过该用户 + 记入 report（不抛）|
| 单个用户 mock 抛异常（理论不应有）| 跳过 + 记入 report（不抛）|
| 输出 CSV 写失败（磁盘满 / 权限）| `OSError` → main 捕获 → 打印 + `exit(1)`|
| `user_id` 是非数字字符串 | 不强求（保持原样写入），但报告里记一行 |
| 编码问题 | 全程 `utf-8-sig`（带 BOM），跟 `标准数据格式示例.csv` 一致 |

## 测试 / 验证

**不写正式单元测试**，脚本末尾内置 `verify_output()` 函数，写完 CSV 后调用：

- 断言：输出文件存在
- 断言：行数 == `len(kept_users)`
- 断言：列数 == `len(STANDARD_COLUMNS)` == 95
- 断言：≥99% 学生"姓名"/"user_id" 非空
- 断言：≥99% 学生"4、AI 帮你..."/"5、智能体..."/"6、海报..."/"7、上课..." 非空
- 断言：75% ≤ 作品_作品ID 填充率 ≤ 85%（容忍 80% 命中率 ±5%）
- 任一断言失败 → 打印 FAIL + `exit(1)`；全过 → 打印 OK + `exit(0)`

**手动验证**：

- 跑完后用 Excel 打开 `ONLINE_COURSE_long_format.csv`
- 随机抽 5 行
- 确认 姓名/user_id/学校/年级/班级 列内容跟原 `users.csv` 对应行一致
- 确认满意度/问卷列都是 1-5 整数
- 用同一 seed 再跑一次，输出文件 byte-for-byte 一致

## 关键决策记录

| 决策 | 选项 | 决定 | 理由 |
|---|---|---|---|
| 行粒度 | 1 学生 1 行 / 多行展开 | **1 学生 1 行** | 与标准格式示例完全对齐；避免行数爆炸 |
| 派生列（资源浏览数等）| 加 / 不加 | **不加** | 破坏结构一致性；分析用原 6 个 CSV |
| 学生筛选 | 全部 / 仅行为 > 0 | **全部进入** | 行为为 0 的学生在 mock 阶段自然得到空作品/空点赞 |
| 作品 mock 命中率 | 50% / 80% / 100% | **80%** | 参考标准格式示例 ~17% 空作品率 |
| 复用 comments/likes | 是 / 否 | **否** | 用户决定全 mock，保持数据源一致性 |
| mock 策略 | 固定 / 纯随机 / 确定性伪随机 | **确定性伪随机** | 同 user 多次跑结果一致；学生间有合理差异 |
| 工具 | pandas / 标准库 csv | **标准库 csv** | 与项目内现有 .py 脚本风格一致；0 新增依赖 |
| 脚本位置 | `datas/ONLINE_COURSE/` / `tools/` | **同数据目录** | 数据和脚本在一起，方便 |
| 是否写正式测试 | 是 / 否 | **否（仅 sanity 校验）** | 单次脚本任务，overhead 不值 |

## 风险

1. **脚本位置与现有约定**：项目内 Python 脚本都放 `backend/scripts/` 或 `backend/datas/filterd/`，本次放 `backend/datas/ONLINE_COURSE/` 是基于"数据和脚本在一起"的选择。如有不同意见可调。
2. **mock 字段的语义真实度**：满意度、作品标题、IP 等都是 mock 出来的，对**真实业务分析**没有意义；本产物仅用于**对齐数据格式**或**演示/测试**。
3. **多值 grade 的业务语义**：本次以"取第 1 个"简化处理；真实业务场景里可能需要"展开为多行"或"取最频繁值"，但这属于业务规则而非数据整合。
4. **comments / likes 不复用**：意味着"作品被点赞数"等互动字段是 mock 出来的，跟真实平台行为数据不挂钩。如果将来要切换到复用，需要重写 `mock_for_user` 里互动部分。
5. **不连后端、不入库**：本次产出物是离线 CSV；如要让平台可视化使用，需要另行 ingest 到 DB（不在本次范围）。

## 验证命令

```bash
# 1. 编译检查（如果有 type hints）
python -c "import ast; ast.parse(open('backend/datas/ONLINE_COURSE/build_long_format.py', encoding='utf-8').read())"

# 2. 跑脚本
cd backend/datas/ONLINE_COURSE
python build_long_format.py

# 3. 验证输出
ls -la ONLINE_COURSE_long_format.csv build_report.txt
head -2 ONLINE_COURSE_long_format.csv
cat build_report.txt

# 4. 同 seed 重跑，校验可复现
python build_long_format.py --seed 42
diff <(md5sum ONLINE_COURSE_long_format.csv) <(md5sum ONLINE_COURSE_long_format.csv)  # 自身 diff 应为空
```
