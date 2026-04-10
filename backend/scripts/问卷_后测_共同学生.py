#!/usr/bin/env python3
import csv
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

FILE1 = BASE_DIR / "datas/filterd/副本调研问卷数据01.22.csv"
FILE2 = BASE_DIR / "datas/filterd/副本后测-智能体使用体验调研_183_182(1).csv"
OUTPUT = BASE_DIR / "datas/script_filterd/问卷_后测_共同学生列表.csv"


def load_students_file1(
    filepath: Path, keep_first_only: bool = True
) -> dict[str, list[str]]:
    students: dict[str, list[str]] = {}
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 3:
                continue
            name = row[2].strip()
            if name:
                if keep_first_only:
                    # 只保留第一个出现的记录（去重）
                    if name not in students:
                        students[name] = [row]
                else:
                    students.setdefault(name, []).append(row)
    return students


def load_students_file2(
    filepath: Path, keep_first_only: bool = True
) -> dict[str, list[str]]:
    students: dict[str, list[str]] = {}
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) < 9:
                continue
            name = row[8].strip()
            if name:
                if keep_first_only:
                    # 只保留第一个出现的记录（去重）
                    if name not in students:
                        students[name] = [row]
                else:
                    students.setdefault(name, []).append(row)
    return students


def main():
    # 默认启用去重（每个文件只保留每个学生的第一条记录，避免笛卡尔积）
    KEEP_FIRST_ONLY = True

    print(f"读取文件1: {FILE1}")
    file1_students = load_students_file1(FILE1, keep_first_only=KEEP_FIRST_ONLY)
    print(
        f"  → {len(file1_students)} 个唯一学生, {sum(len(v) for v in file1_students.values())} 条记录"
    )
    if KEEP_FIRST_ONLY:
        print(f"  → [去重模式] 每个学生只保留第一条记录")

    print(f"读取文件2: {FILE2}")
    file2_students = load_students_file2(FILE2, keep_first_only=KEEP_FIRST_ONLY)
    print(
        f"  → {len(file2_students)} 个唯一学生, {sum(len(v) for v in file2_students.values())} 条记录"
    )
    if KEEP_FIRST_ONLY:
        print(f"  → [去重模式] 每个学生只保留第一条记录")

    common_names = set(file1_students.keys()) & set(file2_students.keys())
    print(f"\n共同学生: {len(common_names)} 人")

    if not common_names:
        print("没有找到共同学生。")
        return

    with open(FILE2, "r", encoding="utf-8-sig") as f:
        file2_header = next(csv.reader(f))

    file1_cols = [
        f"问卷_列{i + 1}"
        for i in range(max(len(v[0]) for v in file1_students.values()))
    ]

    with open(OUTPUT, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["姓名"] + file1_cols + file2_header)

        for name in sorted(common_names):
            file1_rows = file1_students[name]
            file2_rows = file2_students[name]
            for r1 in file1_rows:
                for r2 in file2_rows:
                    writer.writerow([name] + r1 + r2)

    print(f"\n结果已写入: {OUTPUT}")

    print(f"\n前20个共同学生:")
    for i, name in enumerate(sorted(common_names)[:20]):
        print(f"  {i + 1}. {name}")
    if len(common_names) > 20:
        print(f"  ... 共 {len(common_names)} 人")


if __name__ == "__main__":
    main()
