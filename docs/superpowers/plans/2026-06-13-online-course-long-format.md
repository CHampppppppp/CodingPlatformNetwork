# ONLINE_COURSE 长表整合实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Python 脚本 `build_long_format.py`，把 `backend/datas/ONLINE_COURSE/` 下的 6 个 CSV 整合成 1 份与 `标准数据格式示例.csv` 对齐的扁平长表 CSV，附带运行报告。

**Architecture:** 单进程 Python 脚本，零外部依赖（只用标准库）。`csv.DictReader` 按列名读取避免位置错位；用 `random.Random(seed_str)` 做确定性伪随机 mock；`csv.DictWriter` 按 95 列固定 schema 写回；末尾用 `verify_output()` 做轻量 sanity 校验。

**Tech Stack:** Python 3.12+ 标准库（`csv` / `json` / `random` / `dataclasses` / `argparse` / `datetime` / `pathlib` / `collections`），pytest 9.0（仅开发时用，不进生产依赖）。

**参考 spec:** `docs/superpowers/specs/2026-06-13-online-course-long-format-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/datas/ONLINE_COURSE/build_long_format.py` | Create | 主脚本（约 350-450 行）|
| `backend/datas/ONLINE_COURSE/test_build_long_format.py` | Create | pytest 单元测试（约 30-40 个 test cases）|
| `backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv` | Create（脚本输出）| 主产物 |
| `backend/datas/ONLINE_COURSE/build_report.txt` | Create（脚本输出）| 运行报告 |
| `pytest.ini` | Create（项目根）| 让 pytest 找到 `test_*.py` |

**`build_long_format.py` 内部模块划分**：
- 常量段（顶部）：`STANDARD_COLUMNS` / `QUESTIONNAIRE_COLS` / `SCHOOL_STAGE_BY_GRADE` / mock 字典
- 工具函数（独立可测）：`parse_grade` / `safe_get` / `stable_rng`
- `LongFormatBuilder` 类：聚合所有逻辑
- CLI：`main()` + `if __name__ == "__main__"`

---

## Task 1: 脚手架（空脚本 + pytest 可发现 + 常量骨架）

**Files:**
- Create: `pytest.ini`
- Create: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Create: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 创建 `pytest.ini`**

项目根 `pytest.ini`：

```ini
[pytest]
testpaths = backend/datas/ONLINE_COURSE
python_files = test_*.py
addopts = -v --tb=short
```

- [ ] **Step 2: 创建空脚本骨架**

`backend/datas/ONLINE_COURSE/build_long_format.py`：

```python
"""Build the ONLINE_COURSE long-format CSV from 6 source CSVs.

See docs/superpowers/specs/2026-06-13-online-course-long-format-design.md
for the full specification.
"""

__version__ = "0.1.0"

STANDARD_COLUMNS: list[str] = []
"""All 95 columns in the order matching 标准数据格式示例.csv."""

QUESTIONNAIRE_COLS: list[str] = []
"""50 anonymous questionnaire column names (问卷_列1, 问卷_列5, ..., 问卷_列53)."""

ROLE_STUDENT = "1"
ROLE_TEACHER = "2"


def main() -> None:
    """Entry point placeholder; implemented in Task 10."""
    raise NotImplementedError("main() not yet implemented")
```

- [ ] **Step 3: 写第一个失败测试**

`backend/datas/ONLINE_COURSE/test_build_long_format.py`：

```python
"""Tests for build_long_format.py."""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).parent / "build_long_format.py"


def test_script_is_importable():
    """The main script must be importable as a module."""
    spec = importlib.util.spec_from_file_location("build_long_format", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.__version__ == "0.1.0"


def test_main_not_implemented_yet():
    """main() should raise NotImplementedError until Task 10."""
    from build_long_format import main

    with pytest.raises(NotImplementedError):
        main()
```

> 关键：第 2 个 test 期望 `main()` 抛 `NotImplementedError`。这本身就是一个 failing test，等 Task 10 把它变 passing。

- [ ] **Step 4: 跑测试，确认 fail/pass 分布**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py -v
```

Expected: 2 passed
- `test_script_is_importable`: PASS（脚本存在 + 可 import）
- `test_main_not_implemented_yet`: PASS（`main()` 抛 `NotImplementedError` 是预期行为）

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add pytest.ini backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): scaffold build_long_format.py with version and main placeholder"
```

---

## Task 2: 写满 STANDARD_COLUMNS + 全部 mock 字典常量

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`（顶部常量段）
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`（加常量验证测试）

- [ ] **Step 1: 写失败测试：验证常量结构**

往 `test_build_long_format.py` 追加：

```python
def test_standard_columns_count():
    """STANDARD_COLUMNS must have exactly 95 entries matching the standard format."""
    from build_long_format import STANDARD_COLUMNS

    assert len(STANDARD_COLUMNS) == 95


def test_questionnaire_cols_count():
    """QUESTIONNAIRE_COLS must have exactly 50 entries."""
    from build_long_format import QUESTIONNAIRE_COLS

    assert len(QUESTIONNAIRE_COLS) == 50


def test_questionnaire_cols_format():
    """Each questionnaire column must be either 问卷_列1, 问卷_列5, 问卷_列6, 问卷_列7, 问卷_列11, or 问卷_列13..53."""
    from build_long_format import QUESTIONNAIRE_COLS

    expected = {"问卷_列1", "问卷_列5", "问卷_列6", "问卷_列7", "问卷_列11"}
    expected.update({f"问卷_列{i}" for i in range(13, 54)})  # 13..53 inclusive
    assert set(QUESTIONNAIRE_COLS) == expected


def test_school_stage_by_grade():
    """1-6 → 小学, 7-9 → 初中, 10-12 → 高中."""
    from build_long_format import SCHOOL_STAGE_BY_GRADE

    assert SCHOOL_STAGE_BY_GRADE[1] == "小学"
    assert SCHOOL_STAGE_BY_GRADE[6] == "小学"
    assert SCHOOL_STAGE_BY_GRADE[7] == "初中"
    assert SCHOOL_STAGE_BY_GRADE[9] == "初中"
    assert SCHOOL_STAGE_BY_GRADE[10] == "高中"
    assert SCHOOL_STAGE_BY_GRADE[12] == "高中"
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py -v
```

Expected: 4 new tests FAIL with assertion errors (constants are empty / undefined)

- [ ] **Step 3: 填入完整常量**

修改 `backend/datas/ONLINE_COURSE/build_long_format.py` 顶部，把以下常量插入到 `STANDARD_COLUMNS` 和 `QUESTIONNAIRE_COLS` 位置：

```python
# === 95 columns matching 标准数据格式示例.csv ===

_REAL_COLS = [
    "姓名", "user_id", "school_id", "问卷_列1", "问卷_列5", "问卷_列6",
    "问卷_列7", "学龄段", "年级", "班级", "问卷_列11", "性别",
]

# 41 anonymous 5-point scale columns (问卷_列13..53)
_ANON_COLS = [f"问卷_列{i}" for i in range(13, 54)]

_META_COLS = [
    "序号", "提交答卷时间", "所用时间", "来源", "来源详情", "来自IP", "总分",
]

# 8 real questions (1=school, 2=name, 3=grade, 4-7 satisfaction, 8 open)
_QUESTION_COLS = [
    "1、你的学校：", "2、你的姓名：", "3、你的年级：",
    "4、AI帮你生成的文案或图片，符合你心里的想法吗？",
    "5、智能体推送的资源链接对你制作海报有帮助吗？",
    "6、请评价你对今天自己制作的海报的满意程度：",
    "7、相比传统的“老师讲、学生做”，你更喜欢这种“和AI一起做项目”的上课方式吗？",
    "8、在这次设计中，谁给你的帮助最大？",
]

_WORK_COLS = [
    "作品_作品ID", "作品_作品名称", "作品_作品发布时间", "作品_学生姓名",
    "作品_所在班级", "作品_所在学校", "作品_学校ID", "作品_所属教材",
    "作品_主题所属目录", "作品_主题名称", "作品_主题ID",
    "作品_作品被点赞数", "作品_作品被评论数",
    "作品_教师姓名", "作品_教师评分", "作品_教师评语",
    "点赞学生ID列表", "点赞学生学校ID列表", "点赞时间列表",
    "点赞总数", "点赞学生姓名列表",
    "评论内容列表", "埋点记录数", "埋点meta数据",
]

STANDARD_COLUMNS: list[str] = (
    _REAL_COLS + _ANON_COLS + _META_COLS + _QUESTION_COLS + _WORK_COLS
)
"""All 95 columns in the order matching 标准数据格式示例.csv."""

QUESTIONNAIRE_COLS: list[str] = (
    ["问卷_列1", "问卷_列5", "问卷_列6", "问卷_列7", "问卷_列11"]
    + _ANON_COLS
)
"""50 anonymous questionnaire column names."""


# === Mock dictionaries ===

SCHOOL_STAGE_BY_GRADE: dict[int, str] = {
    **{i: "小学" for i in range(1, 7)},
    **{i: "初中" for i in range(7, 10)},
    **{i: "高中" for i in range(10, 13)},
}

GENDER_OPTIONS: list[str] = ["男", "女"]
OPEN_QUESTION_8_OPTIONS: list[str] = ["教师", "AI", "同学", "家长", "自己"]

MOCK_TEACHER_NAMES: list[str] = ["陈环环", "李建华"]
MOCK_WORK_TITLES: list[str] = [
    "我的学校", "我的家乡", "我的偶像", "我最喜欢的书", "我的寒假生活",
    "向世界介绍我的学校", "我的家乡美食", "我的兴趣爱好",
    "我的梦想", "我的家庭",
]
MOCK_WORK_THEME: tuple[str, str, str] = (
    "2026年寒假活动", "向世界介绍我的学校", "2032699",
)
MOCK_TEACHER_COMMENTS: list[str] = [
    "完成度很好，继续保持！",
    "创意新颖，期待下一个作品。",
    "排版可以再优化一下。",
    "内容充实，结构清晰。",
    "非常用心的作品，给你点赞！",
]
SUBMIT_TIMESTAMP: str = "2026-01-13"
SOURCE_CHANNEL: tuple[str, str] = ("链接", "直接访问")
WORK_HIT_RATE: float = 0.80
DEFAULT_SEED: int = 42
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py -v
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add 95-column schema and mock dictionaries"
```

---

## Task 3: parse_grade 函数（TDD）

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`（加函数）
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`（加测试）

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestParseGrade:
    """Tests for parse_grade() — extract grade numbers from JSON array strings."""

    def test_single_value(self):
        from build_long_format import parse_grade
        assert parse_grade("[5]") == [5]

    def test_multiple_values(self):
        from build_long_format import parse_grade
        assert parse_grade("[1,2,3,4,5,6]") == [1, 2, 3, 4, 5, 6]

    def test_empty_string(self):
        from build_long_format import parse_grade
        assert parse_grade("") == []

    def test_undefined_returns_empty(self):
        from build_long_format import parse_grade
        assert parse_grade(None) == []
        assert parse_grade("[]") == []

    def test_invalid_json_returns_empty(self):
        from build_long_format import parse_grade
        assert parse_grade("not json") == []
        assert parse_grade("{broken") == []

    def test_filters_nan(self):
        from build_long_format import parse_grade
        # [1, "x", 2] should produce [1, 2] (filter out non-numbers)
        assert parse_grade('[1, "x", 2]') == [1, 2]
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestParseGrade -v
```

Expected: 6 tests FAIL with `ImportError: cannot import name 'parse_grade'`

- [ ] **Step 3: 实现 parse_grade**

在 `build_long_format.py` 的 `main()` 函数之前插入：

```python
def parse_grade(grade_str: str | None) -> list[int]:
    """Parse a JSON-array grade string into a list of integers.

    Returns [] for missing, empty, malformed, or non-array inputs.
    Non-numeric array elements are filtered out.
    """
    if not grade_str:
        return []
    try:
        parsed = json.loads(grade_str)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [int(x) for x in parsed if isinstance(x, (int, float)) and not (isinstance(x, float) and x != x)]
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestParseGrade -v
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add parse_grade() with defensive JSON parsing"
```

---

## Task 4: load_data 函数（TDD）

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试 + 准备 fixture 数据**

往 `test_build_long_format.py` 追加：

```python
import csv
import tempfile
import os


@pytest.fixture
def sample_datas_dir(tmp_path):
    """Create a temp dir with minimal ONLINE_COURSE CSVs for load_data tests."""
    base = tmp_path / "ONLINE_COURSE"
    base.mkdir()

    # users.csv with bom + varying role
    (base / "ONLINE_COURSE_users.csv").write_text(
        "﻿"  # BOM
        "id,user_id,disable,grade,role,school,classes,last_course_id,resource_permission\n"
        '"0","chenwei","0","[5]","1","cxxhsdsyxxsdxx","1","1","1"\n'
        '"1","123","0","[1,2,3]","2","cxxhsdsyxxsdxx",,"360","2"\n'
        '"2","junk","0","[5]","9","unknown",,,\n',
        encoding="utf-8-sig",
    )

    # empty stubs for the other 5 files (load_data must read them all)
    for name in [
        "ONLINE_COURSE_classes.csv",
        "ONLINE_COURSE_knowledges.csv",
        "ONLINE_COURSE_resources.csv",
        "ONLINE_COURSE_comments.csv",
        "ONLINE_COURSE_likes.csv",
    ]:
        (base / name).write_text("﻿id\n", encoding="utf-8-sig")

    return base


class TestLoadData:
    def test_reads_users_with_bom(self, sample_datas_dir):
        from build_long_format import load_data
        data = load_data(sample_datas_dir)
        assert "users" in data
        assert len(data["users"]) == 3
        # First user's user_id, accessed BY COLUMN NAME, should be "chenwei"
        assert data["users"][0]["user_id"] == "chenwei"

    def test_users_dict_access_by_column_name(self, sample_datas_dir):
        from build_long_format import load_data
        data = load_data(sample_datas_dir)
        # role=2 is a teacher in our convention
        assert data["users"][1]["role"] == "2"
        assert data["users"][1]["user_id"] == "123"

    def test_returns_all_six_keys(self, sample_datas_dir):
        from build_long_format import load_data
        data = load_data(sample_datas_dir)
        expected = {"users", "classes", "knowledges", "resources", "comments", "likes"}
        assert set(data.keys()) == expected

    def test_empty_files_return_empty_lists(self, sample_datas_dir):
        from build_long_format import load_data
        data = load_data(sample_datas_dir)
        assert data["classes"] == []
        assert data["knowledges"] == []
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestLoadData -v
```

Expected: 4 tests FAIL with `ImportError: cannot import name 'load_data'`

- [ ] **Step 3: 实现 load_data**

在 `parse_grade` 之后插入：

```python
CSV_FILES = {
    "users": "ONLINE_COURSE_users.csv",
    "classes": "ONLINE_COURSE_classes.csv",
    "knowledges": "ONLINE_COURSE_knowledges.csv",
    "resources": "ONLINE_COURSE_resources.csv",
    "comments": "ONLINE_COURSE_comments.csv",
    "likes": "ONLINE_COURSE_likes.csv",
}


def load_data(datas_dir: Path) -> dict[str, list[dict]]:
    """Load all 6 ONLINE_COURSE CSV files into a dict of row lists.

    Uses csv.DictReader with utf-8-sig encoding to handle BOM.
    Reads BY COLUMN NAME, not by position, to avoid field-offset bugs.
    """
    result: dict[str, list[dict]] = {}
    for key, filename in CSV_FILES.items():
        path = datas_dir / filename
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            result[key] = list(reader)
    return result
```

> 还需要 import `Path`：把文件顶部 import 段更新为：

```python
from __future__ import annotations

import csv
import json
from pathlib import Path
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestLoadData -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add load_data() reading 6 CSVs by column name"
```

---

## Task 5: filter_users 函数（TDD）

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestFilterUsers:
    """Tests for filter_users() — apply role + grade selection rules."""

    def _u(self, **kwargs):
        """Shorthand to build a user dict with sensible defaults."""
        defaults = {
            "id": "0", "user_id": "u", "role": "1", "school": "s",
            "grade": "[5]", "classes": "1",
        }
        defaults.update(kwargs)
        return defaults

    def test_keeps_student_with_single_grade(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users([self._u(id="1", role="1", grade="[5]")])
        assert len(kept) == 1
        assert dropped == 0
        assert kept[0]["id"] == "1"

    def test_keeps_teacher_with_multi_grade(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users(
            [self._u(id="2", role="2", grade="[1,2,3,4,5,6]", user_id="t1")]
        )
        assert len(kept) == 1
        assert dropped == 0
        # Teacher's first grade is recorded
        assert kept[0]["_primary_grade"] == 1
        # Warning logged for additional grades
        assert any("t1" in w for w in warnings)

    def test_keeps_student_with_multi_grade_uses_first(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users(
            [self._u(id="3", role="1", grade="[5,6]")]
        )
        assert len(kept) == 1
        assert kept[0]["_primary_grade"] == 5
        # Warning logged
        assert any("multi" in w.lower() or "多" in w for w in warnings)

    def test_drops_user_with_invalid_role(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users(
            [self._u(id="4", role="9"), self._u(id="5", role="1", grade="[5]")]
        )
        assert len(kept) == 1
        assert dropped == 1
        assert kept[0]["id"] == "5"

    def test_drops_user_with_invalid_grade(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users(
            [self._u(id="6", role="1", grade="not json")]
        )
        assert len(kept) == 0
        assert dropped == 1

    def test_drops_user_missing_id(self):
        from build_long_format import filter_users
        kept, dropped, warnings = filter_users(
            [self._u(id="", role="1", grade="[5]")]
        )
        assert len(kept) == 0
        assert dropped == 1
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestFilterUsers -v
```

Expected: 6 tests FAIL with `ImportError: cannot import name 'filter_users'`

- [ ] **Step 3: 实现 filter_users**

在 `load_data` 之后插入：

```python
def filter_users(
    users: list[dict],
) -> tuple[list[dict], int, list[str]]:
    """Filter and normalize user rows per spec rules.

    Returns (kept, dropped_count, warnings).
    Each kept row gets an injected `_primary_grade` field (int).
    """
    kept: list[dict] = []
    dropped = 0
    warnings: list[str] = []

    for user in users:
        user_id = (user.get("id") or "").strip()
        if not user_id:
            dropped += 1
            warnings.append(f"user missing id (role={user.get('role')!r})")
            continue

        role = (user.get("role") or "").strip()
        if role not in (ROLE_STUDENT, ROLE_TEACHER):
            dropped += 1
            warnings.append(f"user id={user_id} dropped: invalid role={role!r}")
            continue

        grades = parse_grade(user.get("grade"))
        if not grades:
            dropped += 1
            warnings.append(
                f"user id={user_id} (role={role}) dropped: empty/invalid grade"
            )
            continue

        primary = grades[0]
        if len(grades) > 1:
            who = "teacher" if role == ROLE_TEACHER else "student"
            warnings.append(
                f"{who} id={user_id} (user_id={user.get('user_id', '?')!r}) "
                f"has multi-value grade {grades}; using {primary}"
            )

        user["_primary_grade"] = primary
        kept.append(user)

    return kept, dropped, warnings
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestFilterUsers -v
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add filter_users() with role + grade rules"
```

---

## Task 6: stable_rng 工具函数（TDD）

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestStableRng:
    def test_same_seed_same_sequence(self):
        from build_long_format import stable_rng
        r1 = stable_rng("user1", "col_a")
        r2 = stable_rng("user1", "col_a")
        assert r1.randint(1, 100) == r2.randint(1, 100)

    def test_different_columns_different_sequences(self):
        from build_long_format import stable_rng
        r1 = stable_rng("user1", "col_a")
        r2 = stable_rng("user1", "col_b")
        # 100 draws: at least one should differ
        a = [r1.randint(1, 100) for _ in range(100)]
        b = [r2.randint(1, 100) for _ in range(100)]
        assert a != b

    def test_different_users_different_sequences(self):
        from build_long_format import stable_rng
        r1 = stable_rng("user1", "col_a")
        r2 = stable_rng("user2", "col_a")
        a = [r1.randint(1, 100) for _ in range(100)]
        b = [r2.randint(1, 100) for _ in range(100)]
        assert a != b
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestStableRng -v
```

Expected: 3 tests FAIL with `ImportError: cannot import name 'stable_rng'`

- [ ] **Step 3: 实现 stable_rng**

在 `filter_users` 之后插入：

```python
def stable_rng(user_external_id: str, column_name: str) -> random.Random:
    """Return a deterministic random.Random seeded from user_id + column_name.

    Same (user_id, column_name) → same sequence. Different columns/users
    are statistically uncorrelated.
    """
    seed_str = f"{user_external_id}:{column_name}"
    return random.Random(seed_str)
```

文件顶部 import 段追加：

```python
import random
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestStableRng -v
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add stable_rng() for per-column deterministic randomness"
```

---

## Task 7: LongFormatBuilder 类的 __init__ + 真实字段映射

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestBuilderRealFields:
    """Tests for the real-data fields (姓名/user_id/school_id/年级/班级 + 1-3 题)."""

    def _student(self):
        return {
            "id": "42", "user_id": "alice", "role": "1",
            "school": "测试小学", "grade": "[6]", "classes": "3",
            "_primary_grade": 6,
        }

    def test_constructor_stores_params(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("/tmp"), seed=42)
        assert b.datas_dir == Path("/tmp")
        assert b.seed == 42

    def test_real_fields_student(self):
        from build_long_format import LongFormatBuilder
        b = LongFormatBuilder(datas_dir=__import__("pathlib").Path("."))
        row = b._real_fields(self._student())
        # Direct mappings
        assert row["姓名"] == "alice"
        assert row["user_id"] == "42"
        assert row["school_id"] == "测试小学"
        assert row["年级"] == 6
        assert row["班级"] == "3"
        # 1/2/3 题 are duplicates
        assert row["1、你的学校："] == "测试小学"
        assert row["2、你的姓名："] == "alice"
        assert row["3、你的年级："] == 6

    def test_real_fields_teacher_with_multi_grade(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        teacher = {
            "id": "99", "user_id": "bob", "role": "2",
            "school": "测试小学", "grade": "[1,2,3]", "classes": "",
            "_primary_grade": 1,
        }
        row = b._real_fields(teacher)
        assert row["姓名"] == "bob"
        assert row["年级"] == 1  # primary_grade from filter_users
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderRealFields -v
```

Expected: 3 tests FAIL with `ImportError: cannot import name 'LongFormatBuilder'`

- [ ] **Step 3: 实现 LongFormatBuilder 类的骨架 + _real_fields**

在 `stable_rng` 之后插入：

```python
class LongFormatBuilder:
    """Builds the long-format CSV from raw ONLINE_COURSE rows."""

    def __init__(self, datas_dir: Path, seed: int = DEFAULT_SEED):
        self.datas_dir = datas_dir
        self.seed = seed
        self._row_counter = 0  # for 序号 (auto-increment)

    def _real_fields(self, user: dict) -> dict[str, object]:
        """Map real user fields to the 8 real columns (姓名/user_id/school_id/年级/班级 + 1/2/3 题)."""
        primary_grade: int = user["_primary_grade"]
        school = (user.get("school") or "").strip()
        user_id_str = (user.get("user_id") or "").strip()
        classes = (user.get("classes") or "").strip()

        return {
            "姓名": user_id_str,
            "user_id": (user.get("id") or "").strip(),
            "school_id": school,
            "年级": primary_grade,
            "班级": classes,
            "1、你的学校：": school,
            "2、你的姓名：": user_id_str,
            "3、你的年级：": primary_grade,
        }
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderRealFields -v
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add LongFormatBuilder with real-fields mapping"
```

---

## Task 8: mock_for_user — 非作品字段（问卷/性别/学龄段/元数据/满意度/第 8 题）

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestBuilderNonWorkMock:
    def _student(self):
        return {
            "id": "42", "user_id": "alice", "role": "1",
            "school": "测试小学", "grade": "[6]", "classes": "3",
            "_primary_grade": 6,
        }

    def test_questionnaire_values_in_range(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        row = b._mock_non_work(self._student(), b._real_fields(self._student()))
        for col in b.__class__.__init__.__globals__["QUESTIONNAIRE_COLS"]:
            v = row[col]
            assert isinstance(v, int), f"{col} not int: {v!r}"
            assert 1 <= v <= 5, f"{col} out of range: {v}"

    def test_school_stage_from_grade(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        for grade, expected in [(3, "小学"), (8, "初中"), (11, "高中")]:
            user = self._student()
            user["_primary_grade"] = grade
            row = b._mock_non_work(user, b._real_fields(user))
            assert row["学龄段"] == expected, f"grade {grade} → {row['学龄段']!r}"

    def test_gender_in_options(self):
        from build_long_format import LongFormatBuilder, GENDER_OPTIONS
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        row = b._mock_non_work(self._student(), b._real_fields(self._student()))
        assert row["性别"] in GENDER_OPTIONS

    def test_satisfaction_in_range(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        row = b._mock_non_work(self._student(), b._real_fields(self._student()))
        for q in [
            "4、AI帮你生成的文案或图片，符合你心里的想法吗？",
            "5、智能体推送的资源链接对你制作海报有帮助吗？",
            "6、请评价你对今天自己制作的海报的满意程度：",
            "7、相比传统的“老师讲、学生做”，你更喜欢这种“和AI一起做项目”的上课方式吗？",
        ]:
            v = row[q]
            assert isinstance(v, int)
            assert 1 <= v <= 5

    def test_satisfaction_skewed_positive(self):
        """Average satisfaction across many users should be > 3 (positive skew)."""
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        q = "4、AI帮你生成的文案或图片，符合你心里的想法吗？"
        samples = []
        for i in range(200):
            user = {
                "id": str(i), "user_id": f"u{i}", "role": "1",
                "school": "s", "grade": "[5]", "classes": "1",
                "_primary_grade": 5,
            }
            row = b._mock_non_work(user, b._real_fields(user))
            samples.append(row[q])
        avg = sum(samples) / len(samples)
        assert avg > 3.0, f"expected avg > 3.0, got {avg}"

    def test_open_question_8_in_options(self):
        from build_long_format import LongFormatBuilder, OPEN_QUESTION_8_OPTIONS
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        q8 = "8、在这次设计中，谁给你的帮助最大？"
        for i in range(50):
            user = {
                "id": str(i), "user_id": f"u{i}", "role": "1",
                "school": "s", "grade": "[5]", "classes": "1",
                "_primary_grade": 5,
            }
            row = b._mock_non_work(user, b._real_fields(user))
            assert row[q8] in OPEN_QUESTION_8_OPTIONS

    def test_metadata_fields(self):
        from build_long_format import LongFormatBuilder, SUBMIT_TIMESTAMP
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        row = b._mock_non_work(self._student(), b._real_fields(self._student()))
        assert row["提交答卷时间"] == SUBMIT_TIMESTAMP
        assert row["来源"] == "链接"
        assert row["来源详情"] == "直接访问"
        assert isinstance(row["序号"], int) and row["序号"] > 0
        assert isinstance(row["所用时间"], int) and 30 <= row["所用时间"] <= 300
        assert isinstance(row["总分"], int) and 16 <= row["总分"] <= 20
        assert isinstance(row["来自IP"], str) and "." in row["来自IP"]

    def test_auto_increment_serial(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        # First call
        user1 = self._student()
        row1 = b._mock_non_work(user1, b._real_fields(user1))
        # Second call with different user
        user2 = self._student()
        user2["id"] = "43"
        row2 = b._mock_non_work(user2, b._real_fields(user2))
        assert row2["序号"] > row1["序号"]
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderNonWorkMock -v
```

Expected: 8 tests FAIL with `AttributeError: 'LongFormatBuilder' object has no attribute '_mock_non_work'`

- [ ] **Step 3: 实现 _mock_non_work**

在 `LongFormatBuilder` 类的 `_real_fields` 之后插入：

```python
    def _mock_non_work(self, user: dict, real: dict[str, object]) -> dict[str, object]:
        """Generate all non-work mock fields for one user row.

        Returns a dict mapping column name → value. Only mock fields are set;
        caller is expected to merge with `real` and (later) work fields.
        """
        user_external_id = (user.get("id") or "").strip()
        out: dict[str, object] = {}

        # 50 anonymous questionnaire columns (1-5 scale, uniform)
        for col in QUESTIONNAIRE_COLS:
            rng = stable_rng(user_external_id, col)
            out[col] = rng.randint(1, 5)

        # 学龄段 derived from primary grade
        primary_grade = int(real["年级"])
        out["学龄段"] = SCHOOL_STAGE_BY_GRADE.get(primary_grade, "未知")

        # 性别
        gender_rng = stable_rng(user_external_id, "性别")
        out["性别"] = gender_rng.choice(GENDER_OPTIONS)

        # Auto-increment 序号
        self._row_counter += 1
        out["序号"] = self._row_counter

        # 答卷元数据
        ts_rng = stable_rng(user_external_id, "所用时间")
        out["提交答卷时间"] = SUBMIT_TIMESTAMP
        out["所用时间"] = ts_rng.randint(40, 300)
        out["来源"] = SOURCE_CHANNEL[0]
        out["来源详情"] = SOURCE_CHANNEL[1]

        ip_rng = stable_rng(user_external_id, "来自IP")
        out["来自IP"] = (
            f"{ip_rng.randint(1, 223)}.{ip_rng.randint(0, 255)}."
            f"{ip_rng.randint(0, 255)}.{ip_rng.randint(0, 255)}"
        )

        score_rng = stable_rng(user_external_id, "总分")
        out["总分"] = score_rng.randint(16, 20)

        # 4 satisfaction questions (1-5, skewed positive via weighted choice)
        for q in [
            "4、AI帮你生成的文案或图片，符合你心里的想法吗？",
            "5、智能体推送的资源链接对你制作海报有帮助吗？",
            "6、请评价你对今天自己制作的海报的满意程度：",
            "7、相比传统的“老师讲、学生做”，你更喜欢这种“和AI一起做项目”的上课方式吗？",
        ]:
            sat_rng = stable_rng(user_external_id, q)
            # Weights: 1=5%, 2=10%, 3=25%, 4=35%, 5=25% → average ~3.65
            out[q] = sat_rng.choices([1, 2, 3, 4, 5], weights=[5, 10, 25, 35, 25], k=1)[0]

        # Open question 8
        q8 = "8、在这次设计中，谁给你的帮助最大？"
        q8_rng = stable_rng(user_external_id, q8)
        out[q8] = q8_rng.choice(OPEN_QUESTION_8_OPTIONS)

        return out
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderNonWorkMock -v
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add non-work mock fields (questionnaire/metadata/satisfaction)"
```

---

## Task 9: mock_for_user — 作品字段

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestBuilderWorkMock:
    def _student(self, id="42", user_id="alice"):
        return {
            "id": id, "user_id": user_id, "role": "1",
            "school": "测试小学", "grade": "[6]", "classes": "3",
            "_primary_grade": 6,
        }

    def test_work_hit_rate_approximately_80_percent(self):
        """Across 500 users, ~80% should have a non-empty 作品_作品ID."""
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        hits = 0
        n = 500
        for i in range(n):
            user = self._student(id=str(i), user_id=f"u{i}")
            row = b._mock_work(user, b._real_fields(user))
            if row["作品_作品ID"] != "":
                hits += 1
        rate = hits / n
        assert 0.72 <= rate <= 0.88, f"hit rate {rate:.2%} outside expected 72-88%"

    def test_work_fields_populated_when_hit(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        # Find a user that has work (loop until hit)
        for i in range(100):
            user = self._student(id=str(i), user_id=f"u{i}")
            row = b._mock_work(user, b._real_fields(user))
            if row["作品_作品ID"] != "":
                # Verify all expected fields
                assert isinstance(row["作品_作品ID"], int)
                assert 4000000 <= row["作品_作品ID"] <= 4999999
                assert row["作品_作品名称"] in __import__("build_long_format").MOCK_WORK_TITLES
                assert row["作品_所在学校"] == "测试小学"
                assert row["作品_学生姓名"] == user["user_id"]
                assert row["作品_主题所属目录"] == "2026年寒假活动"
                assert row["作品_主题名称"] == "向世界介绍我的学校"
                assert row["作品_主题ID"] == "2032699"
                assert row["作品_教师姓名"] in __import__("build_long_format").MOCK_TEACHER_NAMES
                assert isinstance(row["作品_作品被点赞数"], int)
                assert 0 <= row["作品_作品被点赞数"] <= 15
                assert isinstance(row["作品_作品被评论数"], int)
                assert 0 <= row["作品_作品被评论数"] <= 5
                # Empty list-like fields are JSON arrays
                assert row["点赞学生ID列表"] == "[]"
                assert row["评论内容列表"] == "[]"
                # 埋点
                assert isinstance(row["埋点记录数"], int)
                assert 0 <= row["埋点记录数"] <= 30
                assert row["埋点meta数据"] == "[]"
                return
        pytest.fail("no hit in 100 users (extremely unlikely)")

    def test_work_fields_empty_when_miss(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        # Find a user that has NO work
        for i in range(100):
            user = self._student(id=str(i), user_id=f"u{i}")
            row = b._mock_work(user, b._real_fields(user))
            if row["作品_作品ID"] == "":
                # All work fields should be empty/0
                assert row["作品_作品名称"] == ""
                assert row["作品_所在班级"] == ""
                assert row["作品_学校ID"] == ""
                assert row["作品_主题名称"] == ""
                assert row["作品_教师姓名"] == ""
                assert row["作品_教师评分"] == ""
                assert row["作品_教师评语"] == ""
                assert row["作品_作品被点赞数"] == 0
                assert row["作品_作品被评论数"] == 0
                assert row["点赞总数"] == 0
                assert row["埋点记录数"] == 0
                return
        pytest.fail("no miss in 100 users (extremely unlikely)")

    def test_work_teacher_score_optional(self):
        from build_long_format import LongFormatBuilder
        from pathlib import Path
        b = LongFormatBuilder(Path("."))
        scores_seen = set()
        for i in range(200):
            user = self._student(id=str(i), user_id=f"u{i}")
            row = b._mock_work(user, b._real_fields(user))
            if row["作品_作品ID"] != "":
                scores_seen.add(row["作品_教师评分"])
        # Should see both "" (no score) and 4/5 (with score)
        assert "" in scores_seen
        assert any(s in (4, 5) for s in scores_seen)
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderWorkMock -v
```

Expected: 4 tests FAIL with `AttributeError: 'LongFormatBuilder' object has no attribute '_mock_work'`

- [ ] **Step 3: 实现 _mock_work**

在 `LongFormatBuilder` 类的 `_mock_non_work` 之后插入：

```python
    def _mock_work(self, user: dict, real: dict[str, object]) -> dict[str, object]:
        """Generate work-related mock fields. ~80% of users have a work; 20% don't."""
        user_external_id = (user.get("id") or "").strip()
        user_id_str = (user.get("user_id") or "").strip()
        school = (user.get("school") or "").strip()
        classes = (user.get("classes") or "").strip()

        # Determine hit/miss deterministically
        hit_rng = stable_rng(user_external_id, "work_hit")
        has_work = hit_rng.random() < WORK_HIT_RATE

        if not has_work:
            return {
                "作品_作品ID": "",
                "作品_作品名称": "",
                "作品_作品发布时间": "",
                "作品_学生姓名": "",
                "作品_所在班级": "",
                "作品_所在学校": "",
                "作品_学校ID": "",
                "作品_所属教材": "",
                "作品_主题所属目录": "",
                "作品_主题名称": "",
                "作品_主题ID": "",
                "作品_作品被点赞数": 0,
                "作品_作品被评论数": 0,
                "作品_教师姓名": "",
                "作品_教师评分": "",
                "作品_教师评语": "",
                "点赞学生ID列表": "[]",
                "点赞学生学校ID列表": "[]",
                "点赞时间列表": "[]",
                "点赞总数": 0,
                "点赞学生姓名列表": "[]",
                "评论内容列表": "[]",
                "埋点记录数": 0,
                "埋点meta数据": "[]",
            }

        # Hit: populate all fields
        id_rng = stable_rng(user_external_id, "work_id")
        title_rng = stable_rng(user_external_id, "work_title")
        time_rng = stable_rng(user_external_id, "work_time")
        teacher_rng = stable_rng(user_external_id, "work_teacher")
        likes_rng = stable_rng(user_external_id, "work_likes")
        comments_rng = stable_rng(user_external_id, "work_comments")
        score_rng = stable_rng(user_external_id, "work_score")
        comment_rng = stable_rng(user_external_id, "work_comment_text")
        tracking_rng = stable_rng(user_external_id, "work_tracking")

        work_id = id_rng.randint(4000000, 4999999)
        title = title_rng.choice(MOCK_WORK_TITLES)
        # Random date between 2026-01-13 and 2026-02-15
        days_offset = time_rng.randint(0, 33)
        from datetime import date, timedelta
        work_date = date(2026, 1, 13) + timedelta(days=days_offset)
        work_time = work_date.strftime("%Y-%m-%d")

        likes = likes_rng.randint(0, 15)
        comments_count = comments_rng.randint(0, 5)

        # 评分: 1/3 概率 None, 2/3 概率 4 或 5
        score_options = [None, 4, 5]
        score = score_rng.choice(score_options)
        score_str = "" if score is None else str(score)

        # 评语: 80% 空, 20% 从字典选
        comment_str = ""
        if comment_rng.random() < 0.20:
            comment_str = comment_rng.choice(MOCK_TEACHER_COMMENTS)

        return {
            "作品_作品ID": work_id,
            "作品_作品名称": title,
            "作品_作品发布时间": work_time,
            "作品_学生姓名": user_id_str,
            "作品_所在班级": classes,
            "作品_所在学校": school,
            "作品_学校ID": school,
            "作品_所属教材": "（待补充）",
            "作品_主题所属目录": MOCK_WORK_THEME[0],
            "作品_主题名称": MOCK_WORK_THEME[1],
            "作品_主题ID": MOCK_WORK_THEME[2],
            "作品_作品被点赞数": likes,
            "作品_作品被评论数": comments_count,
            "作品_教师姓名": teacher_rng.choice(MOCK_TEACHER_NAMES),
            "作品_教师评分": score_str,
            "作品_教师评语": comment_str,
            "点赞学生ID列表": "[]",
            "点赞学生学校ID列表": "[]",
            "点赞时间列表": "[]",
            "点赞总数": likes,
            "点赞学生姓名列表": "[]",
            "评论内容列表": "[]",
            "埋点记录数": tracking_rng.randint(0, 30),
            "埋点meta数据": "[]",
        }
```

文件顶部 import 段追加：

```python
import random
from datetime import date, timedelta
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuilderWorkMock -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add work mock fields with 80% hit rate"
```

---

## Task 10: build() 主流程 + mock_for_user 整合

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestBuildMethod:
    def test_build_returns_95_columns_per_row(self, sample_datas_dir):
        from build_long_format import LongFormatBuilder
        b = LongFormatBuilder(sample_datas_dir, seed=42)
        rows, report = b.build()
        assert len(rows) >= 1
        for row in rows:
            # Real + non-work + work fields → all 95 cols
            for col in __import__("build_long_format").STANDARD_COLUMNS:
                assert col in row, f"missing column: {col}"

    def test_build_filters_invalid_users(self, sample_datas_dir):
        from build_long_format import LongFormatBuilder
        b = LongFormatBuilder(sample_datas_dir, seed=42)
        rows, report = b.build()
        # sample has 3 users: role=1 ok, role=2 ok, role=9 dropped
        assert report["dropped_count"] == 1
        assert len(rows) == 2

    def test_build_serial_numbers_unique(self, sample_datas_dir):
        from build_long_format import LongFormatBuilder
        b = LongFormatBuilder(sample_datas_dir, seed=42)
        rows, _ = b.build()
        serials = [r["序号"] for r in rows]
        assert len(serials) == len(set(serials))

    def test_build_is_deterministic_same_seed(self, sample_datas_dir):
        from build_long_format import LongFormatBuilder
        rows1, _ = LongFormatBuilder(sample_datas_dir, seed=42).build()
        rows2, _ = LongFormatBuilder(sample_datas_dir, seed=42).build()
        # Drop 序号 (auto-incremented → differs) and compare the rest
        for r1, r2 in zip(rows1, rows2):
            r1c, r2c = dict(r1), dict(r2)
            r1c.pop("序号")
            r2c.pop("序号")
            assert r1c == r2c
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuildMethod -v
```

Expected: 4 tests FAIL with `AttributeError: 'LongFormatBuilder' object has no attribute 'build'`

- [ ] **Step 3: 实现 build() + mock_for_user 整合**

在 `LongFormatBuilder` 类内增加 `mock_for_user` 和 `build`：

```python
    def mock_for_user(self, user: dict) -> dict[str, object]:
        """Generate a complete 95-column row for one user."""
        real = self._real_fields(user)
        non_work = self._mock_non_work(user, real)
        work = self._mock_work(user, real)
        merged: dict[str, object] = {}
        merged.update(real)
        merged.update(non_work)
        merged.update(work)
        # Fill any missing STANDARD_COLUMNS with ""
        for col in STANDARD_COLUMNS:
            if col not in merged:
                merged[col] = ""
        return merged

    def build(self) -> tuple[list[dict], dict]:
        """End-to-end: load + filter + mock → rows + report.

        Returns (rows, report_dict). Report has keys:
        - source_counts: dict of input file row counts
        - kept_count, dropped_count, warnings (list[str])
        - work_hit_rate: actual rate of users with work
        - mock_satisfaction_avg: average across all rows of question 4
        """
        data = load_data(self.datas_dir)
        kept, dropped, warnings = filter_users(data["users"])

        # Reset row counter so 序号 starts at 1 for each build()
        self._row_counter = 0
        rows = [self.mock_for_user(u) for u in kept]

        # Compute aggregate stats for the report
        q4 = "4、AI帮你生成的文案或图片，符合你心里的想法吗？"
        if rows:
            q4_values = [r[q4] for r in rows if isinstance(r[q4], int)]
            satisfaction_avg = sum(q4_values) / len(q4_values) if q4_values else 0
            work_hits = sum(1 for r in rows if r["作品_作品ID"] != "")
            work_hit_rate = work_hits / len(rows)
        else:
            satisfaction_avg = 0
            work_hit_rate = 0

        report = {
            "source_counts": {k: len(v) for k, v in data.items()},
            "kept_count": len(kept),
            "dropped_count": dropped,
            "warnings": warnings,
            "work_hit_rate": work_hit_rate,
            "satisfaction_avg": satisfaction_avg,
        }
        return rows, report
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestBuildMethod -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add build() orchestrator with filtering and aggregate report"
```

---

## Task 11: write_outputs() + verify_output()

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 写失败测试**

往 `test_build_long_format.py` 追加：

```python
class TestWriteOutputs:
    def test_write_outputs_creates_csv(self, tmp_path):
        from build_long_format import LongFormatBuilder, write_outputs
        out_csv = tmp_path / "out.csv"
        out_report = tmp_path / "report.txt"
        b = LongFormatBuilder(__import__("pathlib").Path("."))
        rows = [
            {"姓名": "alice", "user_id": "1", "学龄段": "小学", "总分": 18}
            | {c: "" for c in __import__("build_long_format").STANDARD_COLUMNS}
        ]
        report = {"kept_count": 1, "dropped_count": 0, "warnings": []}
        write_outputs(rows, report, out_csv, out_report)
        assert out_csv.exists()
        assert out_report.exists()

    def test_csv_header_is_95_columns(self, tmp_path):
        from build_long_format import LongFormatBuilder, write_outputs, STANDARD_COLUMNS
        out_csv = tmp_path / "out.csv"
        out_report = tmp_path / "report.txt"
        b = LongFormatBuilder(__import__("pathlib").Path("."))
        rows = [
            {c: ("x" if i == 0 else "") for i, c in enumerate(STANDARD_COLUMNS)}
        ]
        write_outputs(rows, {"kept_count": 1, "dropped_count": 0, "warnings": []}, out_csv, out_report)
        with open(out_csv, "r", encoding="utf-8-sig") as f:
            reader = __import__("csv").DictReader(f)
            header = reader.fieldnames
        assert header is not None
        assert len(header) == 95

    def test_verify_output_passes_for_well_formed(self, tmp_path, sample_datas_dir):
        from build_long_format import LongFormatBuilder, write_outputs, verify_output
        out_csv = tmp_path / "out.csv"
        out_report = tmp_path / "report.txt"
        b = LongFormatBuilder(sample_datas_dir, seed=42)
        rows, report = b.build()
        write_outputs(rows, report, out_csv, out_report)
        # Should not raise
        verify_output(out_csv, report)

    def test_verify_output_fails_on_wrong_row_count(self, tmp_path):
        from build_long_format import verify_output
        fake_csv = tmp_path / "fake.csv"
        # Empty CSV
        with open(fake_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = __import__("csv").writer(f)
            w.writerow(__import__("build_long_format").STANDARD_COLUMNS)
        # Report says 5 rows kept, but file has 0
        with __import__("pytest").raises(AssertionError):
            verify_output(fake_csv, {"kept_count": 5, "dropped_count": 0, "warnings": []})
```

- [ ] **Step 2: 跑测试，确认 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestWriteOutputs -v
```

Expected: 4 tests FAIL with `ImportError: cannot import name 'write_outputs'`

- [ ] **Step 3: 实现 write_outputs + verify_output**

在 `LongFormatBuilder.build` 之后，作为模块级函数插入：

```python
def write_outputs(
    rows: list[dict],
    report: dict,
    output_csv: Path,
    output_report: Path,
) -> None:
    """Write the rows CSV and the report TXT to disk."""
    # 1. Write CSV
    with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=STANDARD_COLUMNS,
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    # 2. Write report
    lines: list[str] = []
    lines.append("ONLINE_COURSE 长表构建报告")
    lines.append("=" * 40)
    lines.append("")
    lines.append("=== 输入数据统计 ===")
    for key, count in report.get("source_counts", {}).items():
        lines.append(f"  {key}.csv: {count} 行")
    lines.append("")
    lines.append("=== 用户筛选 ===")
    lines.append(f"  保留: {report.get('kept_count', 0)}")
    lines.append(f"  丢弃: {report.get('dropped_count', 0)}")
    warnings = report.get("warnings", [])
    if warnings:
        lines.append(f"  警告/丢弃原因（前 20 条）:")
        for w in warnings[:20]:
            lines.append(f"    - {w}")
    lines.append("")
    lines.append("=== Mock 填充率 ===")
    lines.append(f"  满意度问题 4 均分: {report.get('satisfaction_avg', 0):.2f}")
    lines.append(f"  作品命中率: {report.get('work_hit_rate', 0):.2%}")
    lines.append("")
    lines.append("=== 输出 ===")
    lines.append(f"  {output_csv.name}: {len(rows)} 行 × {len(STANDARD_COLUMNS)} 列")

    with open(output_report, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(lines) + "\n")


def verify_output(csv_path: Path, report: dict) -> None:
    """Sanity-check the produced CSV against the report. Raises on failure."""
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        header = reader.fieldnames or []

    # Column count
    assert len(header) == len(STANDARD_COLUMNS), (
        f"header has {len(header)} columns, expected {len(STANDARD_COLUMNS)}"
    )

    # Row count matches report
    expected = report.get("kept_count", 0)
    assert len(rows) == expected, f"row count {len(rows)} != expected {expected}"

    if not rows:
        return  # nothing more to verify

    # 99% of 姓名 + user_id non-empty
    n = len(rows)
    name_filled = sum(1 for r in rows if r.get("姓名", "").strip())
    user_id_filled = sum(1 for r in rows if r.get("user_id", "").strip())
    assert name_filled / n >= 0.99, f"姓名 fill rate {name_filled / n:.2%} < 99%"
    assert user_id_filled / n >= 0.99, f"user_id fill rate {user_id_filled / n:.2%} < 99%"

    # 99% of 4 satisfaction fields non-empty
    q4 = "4、AI帮你生成的文案或图片，符合你心里的想法吗？"
    q5 = "5、智能体推送的资源链接对你制作海报有帮助吗？"
    q6 = "请评价你对今天自己制作的海报的满意程度："
    q7 = "7、相比传统的“老师讲、学生做”，你更喜欢这种“和AI一起做项目”的上课方式吗？"
    for q in [q4, q5, q6, q7]:
        filled = sum(1 for r in rows if r.get(q, "").strip())
        assert filled / n >= 0.99, f"{q!r} fill rate {filled / n:.2%} < 99%"

    # 75% ≤ work hit rate ≤ 85%
    work_filled = sum(1 for r in rows if r.get("作品_作品ID", "").strip())
    rate = work_filled / n
    assert 0.72 <= rate <= 0.88, f"work hit rate {rate:.2%} outside 72-88%"
```

- [ ] **Step 4: 跑测试，确认 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py::TestWriteOutputs -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): add write_outputs() and verify_output() with sanity checks"
```

---

## Task 12: CLI main() + argparse

**Files:**
- Modify: `backend/datas/ONLINE_COURSE/build_long_format.py`
- Modify: `backend/datas/ONLINE_COURSE/test_build_long_format.py`

- [ ] **Step 1: 替换原来的 failing test**

`test_build_long_format.py` 顶部找到 `test_main_not_implemented_yet`，**整段替换**为：

```python
def test_main_with_real_data_runs_end_to_end(capsys):
    """End-to-end smoke test: run main() with the real ONLINE_COURSE datas dir."""
    from build_long_format import main
    from pathlib import Path

    real_dir = Path(__file__).parent
    # Use a temp output to avoid clobbering real data
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        main([
            "--datas-dir", str(real_dir),
            "--output-csv", str(tmp / "out.csv"),
            "--report", str(tmp / "report.txt"),
        ])
    out = capsys.readouterr().out
    assert "OK" in out or "kept" in out or "行" in out


def test_main_rejects_missing_dir():
    from build_long_format import main
    import pytest
    with pytest.raises(SystemExit):
        main(["--datas-dir", "/nonexistent/path/that/does/not/exist"])
```

- [ ] **Step 2: 跑测试，确认第一个 fail、第二个 fail**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py -v
```

Expected: `test_main_with_real_data_runs_end_to_end` FAIL (NotImplementedError), `test_main_rejects_missing_dir` FAIL (NotImplementedError instead of SystemExit)

- [ ] **Step 3: 替换原 main() 占位 + 完整 CLI**

把 `build_long_format.py` 文件中原来的 `main()` 占位（`raise NotImplementedError(...)`）**整段替换**为：

```python
def main(argv: list[str] | None = None) -> None:
    """CLI entry point. Parses args, runs the pipeline, writes outputs."""
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Build ONLINE_COURSE long-format CSV from 6 source CSVs.",
    )
    default_dir = Path(__file__).parent
    parser.add_argument(
        "--datas-dir",
        type=Path,
        default=default_dir,
        help=f"Directory containing the 6 ONLINE_COURSE_*.csv files (default: {default_dir})",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        default=None,
        help="Output long-format CSV path (default: <datas-dir>/ONLINE_COURSE_long_format.csv)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Output report TXT path (default: <datas-dir>/build_report.txt)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help=f"Random seed for deterministic mock values (default: {DEFAULT_SEED})",
    )

    args = parser.parse_args(argv)

    output_csv = args.output_csv or (args.datas_dir / "ONLINE_COURSE_long_format.csv")
    output_report = args.report or (args.datas_dir / "build_report.txt")

    if not args.datas_dir.exists():
        print(f"ERROR: --datas-dir does not exist: {args.datas_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"=== ONLINE_COURSE 长表生成 ===")
    print(f"输入目录: {args.datas_dir}")
    print(f"输出 CSV: {output_csv}")
    print(f"报告: {output_report}")
    print(f"Seed: {args.seed}")
    print()

    builder = LongFormatBuilder(args.datas_dir, seed=args.seed)
    rows, report = builder.build()
    write_outputs(rows, report, output_csv, output_report)

    print(f"完成。{len(rows)} 行 × {len(STANDARD_COLUMNS)} 列 已写入 {output_csv.name}")
    print(f"报告: {output_report.name}")

    # Sanity check
    try:
        verify_output(output_csv, report)
        print("Sanity check: OK")
    except AssertionError as e:
        print(f"Sanity check: FAIL — {e}", file=sys.stderr)
        sys.exit(1)
```

- [ ] **Step 4: 跑全部测试，确认全部 pass**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
pytest backend/datas/ONLINE_COURSE/test_build_long_format.py -v
```

Expected: ALL tests PASS (~30 tests)

- [ ] **Step 5: Commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
git add backend/datas/ONLINE_COURSE/build_long_format.py backend/datas/ONLINE_COURSE/test_build_long_format.py
git commit -m "feat(online-course): replace main() placeholder with full CLI + end-to-end run"
```

---

## Task 13: 端到端运行 + 报告人工检查

**Files:**
- Read: `backend/datas/ONLINE_COURSE/build_report.txt`（脚本生成）
- Read: `backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv`（脚本生成）
- (可能) Create: ad-hoc Python 一次性脚本做手动验证

- [ ] **Step 1: 在真实数据上跑一次**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
python backend/datas/ONLINE_COURSE/build_long_format.py
```

Expected output（截取关键几行）：

```
=== ONLINE_COURSE 长表生成 ===
输入目录: .../ONLINE_COURSE
输出 CSV: .../ONLINE_COURSE_long_format.csv
报告: .../build_report.txt
Seed: 42

完成。7776 行 × 95 列 已写入 ONLINE_COURSE_long_format.csv
报告: build_report.txt
Sanity check: OK
```

- [ ] **Step 2: 读 build_report.txt 确认报告内容**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
cat backend/datas/ONLINE_COURSE/build_report.txt
```

Expected sections:
- 输入数据统计（6 个文件的行数）
- 用户筛选（保留数 / 丢弃数 / 警告前 20 条）
- Mock 填充率（满意度均分 + 作品命中率）
- 输出（行 × 列）

人工检查：
- 保留数 ≈ 7776（= 7759 学生 + 17 教师）
- 作品命中率应该在 75-85% 区间
- 满意度均分应该在 3.0-4.0 区间

- [ ] **Step 3: 抽样检查长表前 5 行**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
head -1 backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv  # header
sed -n '2,6p' backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv
```

人工检查：
- 95 列
- 姓名/user_id/学校/年级/班级 跟原 `ONLINE_COURSE_users.csv` 对应行一致
- 满意度/问卷列是 1-5 整数
- 作品 ID（如果有）是 4000000-4999999 之间的整数

- [ ] **Step 4: 同 seed 重跑 + diff 验证可复现**

Run:
```bash
cd "C:/Study/CodingPlatformNetwork"
cp backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv /tmp/run1.csv
python backend/datas/ONLINE_COURSE/build_long_format.py --output-csv /tmp/run2.csv --report /tmp/report2.txt
diff <(tail -n +2 /tmp/run1.csv) <(tail -n +2 /tmp/run2.csv) > /dev/null
echo "diff exit code: $?"
```

Expected: `diff exit code: 0`（除掉 header 行后内容完全一致）

- [ ] **Step 5: 抽样 3 个学生，对照原 CSV 确认 4 个真实列内容**

Run（一次性 Python 脚本）：
```bash
cd "C:/Study/CodingPlatformNetwork"
python -c "
import csv
with open('backend/datas/ONLINE_COURSE/ONLINE_COURSE_users.csv', encoding='utf-8-sig') as f:
    src = {r['id']: r for r in csv.DictReader(f)}
with open('backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv', encoding='utf-8-sig') as f:
    long = list(csv.DictReader(f))

for row in long[:3]:
    uid = row['user_id']
    if uid in src:
        s = src[uid]
        ok_name = row['姓名'] == s['user_id']
        ok_school = row['school_id'] == s['school']
        ok_grade = row['年级'] == s['grade'].strip('[]').split(',')[0]
        ok_class = row['班级'] == s['classes']
        print(f\"id={uid} name={ok_name} school={ok_school} grade={ok_grade} class={ok_class}\")
    else:
        print(f'id={uid} not found in source')
"
```

Expected: 3 行都显示 `name=True school=True grade=True class=True`（或者 id 在 long 表但源表里也对应存在）

- [ ] **Step 6: 清理临时文件 + 最终 commit**

```bash
cd "C:/Study/CodingPlatformNetwork"
rm -f /tmp/run1.csv /tmp/run2.csv /tmp/report2.txt
git add backend/datas/ONLINE_COURSE/ONLINE_COURSE_long_format.csv backend/datas/ONLINE_COURSE/build_report.txt
git status --short
# 看 git status 是不是只有 + 2 个新文件
git commit -m "feat(online-course): first end-to-end run output (7776 rows x 95 cols)"
```

Expected: `git status` 干净（除 .claude/settings.local.json / CLAUDE.md / backend/... 等用户已有改动外，只 +2 个新文件被 commit）

---

## 关键决策记录（与 spec 一致）

- 单一脚本 `build_long_format.py`，同级测试 `test_build_long_format.py`
- pytest 9.0 + 标准库（csv/json/random/argparse/pathlib/datetime）
- TDD：每个函数先写测试再实现
- 13 个 task，每个 task 5 step（test → fail → impl → pass → commit）
- 总计约 30 个 test cases
- 端到端运行生成 7776+ 行 × 95 列 CSV + 报告

## 风险与备注

1. **大数据量运行时间**：7759 学生 + 17 教师 = 7776 行 mock，每行 50 个问卷列 + 4 满意度 = 54 次 `randint` + 其他若干，预计 < 5 秒。如果慢可后续优化（向量化）。
2. **CSV 字段名引号**：源 CSV 用 `csv.DictReader` 会保留引号和原始大小写；mock 出来的 ID 是数字不需引号。
3. **本产物不入库**：本次只生成 CSV。后续如要让平台使用，需要走现有 `import-online-course.ts` ingest 路径（不在本次范围）。
4. **用户的现有未提交改动**（CLAUDE.md、backend/.env、schema.prisma 等）应保持原状不被本次 commit 触碰。
