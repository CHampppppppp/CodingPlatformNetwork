#!/usr/bin/env python3

import csv
import random
from collections import defaultdict

INPUT_FILE = "backend/datas/script_filterd/社团课等非正式学习学生_均匀化.csv"
OUTPUT_FILE = "backend/datas/script_filterd/社团课等非正式学习学生_班均匀化.csv"

MIN_CLASS_SIZE = 30
MAX_CLASS_SIZE = 50
MERGED_SCHOOL_NAME = "社团联合中心"
MERGED_GRADE_NAME = "综合"

random.seed(42)


def main():
    print("读取数据...")
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        all_rows = []
        school_grade_rows = defaultdict(list)
        
        for idx, row in enumerate(reader):
            all_rows.append(row)
            if len(row) > 8 and row[6].strip() and row[8].strip():
                school = row[6].strip()
                grade = row[8].strip()
                key = f"{school}::{grade}"
                school_grade_rows[key].append(idx)
    
    print(f"总数据: {len(all_rows)}")
    print(f"学校-年级组合数: {len(school_grade_rows)}")
    
    large_groups = {}
    small_group_rows = []
    
    for key, row_indices in school_grade_rows.items():
        if len(row_indices) >= MIN_CLASS_SIZE:
            large_groups[key] = row_indices
        else:
            small_group_rows.extend(row_indices)
    
    print(f"大组合(>={MIN_CLASS_SIZE}人): {len(large_groups)} 个")
    print(f"零散组合(<{MIN_CLASS_SIZE}人): {len(school_grade_rows) - len(large_groups)} 个, 共 {len(small_group_rows)} 人")
    
    total_changes = 0
    
    for key, row_indices in large_groups.items():
        total = len(row_indices)
        
        import math
        num_classes = max(1, math.ceil(total / MAX_CLASS_SIZE))
        while num_classes > 1 and total / num_classes < MIN_CLASS_SIZE:
            num_classes -= 1
        
        random.shuffle(row_indices)
        base = total // num_classes
        extra = total % num_classes
        
        pos = 0
        for cls_num in range(1, num_classes + 1):
            cls_size = base + (1 if cls_num <= extra else 0)
            for i in range(cls_size):
                if pos < len(row_indices):
                    idx = row_indices[pos]
                    all_rows[idx][9] = f"{cls_num}班"
                    total_changes += 1
                    pos += 1
    
    if small_group_rows:
        print(f"\n合并零散学生到 {MERGED_SCHOOL_NAME}...")
        random.shuffle(small_group_rows)
        
        total_small = len(small_group_rows)
        import math
        num_merged_classes = max(1, math.ceil(total_small / MAX_CLASS_SIZE))
        while num_merged_classes > 1 and total_small / num_merged_classes < MIN_CLASS_SIZE:
            num_merged_classes -= 1
        
        base = total_small // num_merged_classes
        extra = total_small % num_merged_classes
        
        pos = 0
        for cls_num in range(1, num_merged_classes + 1):
            cls_size = base + (1 if cls_num <= extra else 0)
            for i in range(cls_size):
                if pos < len(small_group_rows):
                    idx = small_group_rows[pos]
                    all_rows[idx][6] = MERGED_SCHOOL_NAME
                    all_rows[idx][8] = MERGED_GRADE_NAME
                    all_rows[idx][9] = f"{cls_num}班"
                    total_changes += 1
                    pos += 1
        
        print(f"  零散学生分成 {num_merged_classes} 个班, 平均每班 {total_small / num_merged_classes:.1f} 人")
    
    print(f"\n修改: {total_changes} 人次")
    
    print(f"\n写入文件...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for row in all_rows:
            writer.writerow(row)
    
    print(f"完成: {OUTPUT_FILE}")
    
    print(f"\n验证...")
    sg_class_counts = defaultdict(lambda: defaultdict(int))
    
    for row in all_rows:
        if len(row) > 9 and row[6].strip() and row[8].strip() and row[9].strip():
            school = row[6].strip()
            grade = row[8].strip()
            cls = row[9].strip()
            key = f"{school}::{grade}"
            sg_class_counts[key][cls] += 1
    
    all_sizes = []
    for key, classes in sg_class_counts.items():
        for cls, count in classes.items():
            all_sizes.append(count)
    
    lt30 = sum(1 for s in all_sizes if s < MIN_CLASS_SIZE)
    gt40 = sum(1 for s in all_sizes if s > MAX_CLASS_SIZE)
    ok = sum(1 for s in all_sizes if MIN_CLASS_SIZE <= s <= MAX_CLASS_SIZE)
    
    print(f"总班级数: {len(all_sizes)}")
    print(f"{MIN_CLASS_SIZE}-{MAX_CLASS_SIZE}人: {ok}班 ({ok/len(all_sizes)*100:.1f}%)")
    print(f"<{MIN_CLASS_SIZE}人: {lt30}班 ({lt30/len(all_sizes)*100:.1f}%)")
    print(f">{MAX_CLASS_SIZE}人: {gt40}班 ({gt40/len(all_sizes)*100:.1f}%)")
    
    merged_key = f"{MERGED_SCHOOL_NAME}::{MERGED_GRADE_NAME}"
    merged_classes = sg_class_counts.get(merged_key, {})
    print(f"\n  {MERGED_SCHOOL_NAME} {MERGED_GRADE_NAME}: {len(merged_classes)} 个班, {sum(merged_classes.values())} 人")


if __name__ == "__main__":
    main()
