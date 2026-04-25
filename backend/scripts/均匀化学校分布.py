#!/usr/bin/env python3

import csv
import random
from collections import Counter, defaultdict

INPUT_FILE = "backend/datas/script_filterd/社团课等非正式学习学生_完整.csv"
OUTPUT_FILE = "backend/datas/script_filterd/社团课等非正式学习学生_均匀化.csv"

random.seed(42)


def main():
    print("读取数据...")
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        all_rows = []
        school_rows = defaultdict(list)
        empty_school_rows = []
        
        for idx, row in enumerate(reader):
            all_rows.append(row)
            if len(row) > 6 and row[6].strip():
                school = row[6].strip()
                school_rows[school].append(idx)
            else:
                empty_school_rows.append(idx)
    
    school_counts = {s: len(rows) for s, rows in school_rows.items()}
    total_with_school = sum(school_counts.values())
    total_empty = len(empty_school_rows)
    
    print(f"总数据: {len(all_rows)}")
    print(f"有学校: {total_with_school}, 无学校: {total_empty}")
    print(f"原学校数: {len(school_counts)}")
    
    TARGET_MIN_SIZE = 50
    MAX_LIMIT = 450
    MIN_LIMIT = 120
    
    target_schools = [s for s, c in school_counts.items() if c >= TARGET_MIN_SIZE]
    target_schools.sort(key=lambda s: school_counts[s], reverse=True)
    
    print(f"\n保留学校数(人数>={TARGET_MIN_SIZE}): {len(target_schools)}")
    
    other_schools = [s for s, c in school_counts.items() if c < TARGET_MIN_SIZE]
    
    students_to_move = []
    for school in other_schools:
        students_to_move.extend(school_rows[school])
    students_to_move.extend(empty_school_rows)
    random.shuffle(students_to_move)
    
    print(f"待分配学生: {len(students_to_move)}")
    
    for school in target_schools:
        if school_counts[school] > MAX_LIMIT:
            excess = school_counts[school] - MAX_LIMIT
            moved = 0
            for idx in school_rows[school][:]:
                if moved >= excess:
                    break
                students_to_move.append(idx)
                moved += 1
            school_counts[school] = MAX_LIMIT
    
    random.shuffle(students_to_move)
    print(f"总待分配(含大校溢出): {len(students_to_move)}")
    
    targets = {}
    for school in target_schools:
        t = int(random.gauss(320, 100))
        t = max(MIN_LIMIT, min(MAX_LIMIT, t))
        targets[school] = t
    
    capacities = {}
    for school in target_schools:
        current = school_counts[school]
        cap = max(0, targets[school] - current)
        capacities[school] = cap
    
    assigned = 0
    for row_idx in students_to_move:
        available = []
        weights = []
        
        for school in target_schools:
            current = school_counts[school]
            cap = capacities[school]
            if current < MAX_LIMIT and cap > 0:
                available.append(school)
                remaining = MAX_LIMIT - current
                noise = random.uniform(0.3, 1.7)
                weights.append(max(remaining * noise, 1))
        
        if not available:
            for school in target_schools:
                current = school_counts[school]
                if current < MAX_LIMIT:
                    available.append(school)
                    weights.append(max(MAX_LIMIT - current, 1))
        
        if not available:
            chosen = min(target_schools, key=lambda s: school_counts[s])
        else:
            chosen = random.choices(available, weights=weights)[0]
        
        row = all_rows[row_idx]
        if len(row) <= 6:
            while len(row) <= 6:
                row.append("")
        row[6] = chosen
        
        if len(row) > 73:
            row[73] = chosen
        if len(row) > 79:
            row[79] = f"向世界介绍我的学校——{chosen}"
        
        school_counts[chosen] += 1
        capacities[chosen] = max(0, capacities[chosen] - 1)
        assigned += 1
    
    print(f"\n分配完成: {assigned} 人")
    
    final_counts = Counter()
    for school in target_schools:
        final_counts[school] = school_counts[school]
    
    print(f"\n最终统计:")
    print(f"学校数: {len(target_schools)}")
    print(f"学生数: {sum(final_counts.values())}")
    
    bins = [(0, 100), (100, 150), (150, 200), (200, 250), 
            (250, 300), (300, 350), (350, 400), (400, 450), (450, 9999)]
    
    print(f"\n规模分布:")
    for low, high in bins:
        count = sum(1 for c in final_counts.values() if low <= c < high)
        students = sum(c for c in final_counts.values() if low <= c < high)
        if count > 0:
            print(f"  {low}-{high-1}人: {count}所, 共{students}人")
    
    print(f"\n写入文件...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for row in all_rows:
            writer.writerow(row)
    
    print(f"完成: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
