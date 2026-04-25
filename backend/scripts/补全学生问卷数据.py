#!/usr/bin/env python3

import csv
import random
import uuid
from datetime import datetime, timedelta
import os

SOURCE_FILE = "backend/datas/filterd/社团课等非正式学习学生.csv"
OUTPUT_FILE = "backend/datas/script_filterd/社团课等非正式学习学生_完整.csv"

WORK_TITLES = [
    "我的学校", "我的校园", "校园生活", "校园风光",
    "美丽的校园", "我爱我的学校", "校园一角"
]

COMMENTS = [
    "做得很棒！", "继续努力！", "向你学习", "主题很突出",
    "颜色搭配很好看", "字体很好看", "画面很和谐",
    "图片选得不错", "细节处理得很好", "整体设计不错"
]

TEACHER_NAMES = ["陈煜昱", "王老师", "李老师", "张老师"]

STUDENT_NAMES = [
    "付潇铄", "侯梓璇", "凌艺馨", "周天远", "唐一宸",
    "姜宸睿", "庄梓新", "晏浩宸", "江灵", "沈梓菡",
    "王御宸", "王珺瑶", "白依杭", "葛昕妤", "蒋何越",
    "袁振博", "陈梓昂", "陆思瑶", "邹奕辰", "方嘉树",
    "黄思涵", "高梓怡", "庞雨萌", "唐沐晴", "梁诗琪",
    "马明轩", "贺若瑶", "姜听澜", "魏婉婷", "邓诗彤",
    "兰听澜", "赵泽宇", "汪雅雯", "董景初", "邵雪晴",
    "贺浩宇", "曹子涵", "樊语汐"
]


def parse_datetime(dt_str):
    formats = [
        "%Y/%m/%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(dt_str.strip(), fmt)
        except ValueError:
            continue
    return datetime.now()


def generate_ip():
    return f"218.108.32.{random.randint(1, 254)}(浙江-杭州)"


def generate_uuid_str():
    return str(uuid.uuid4()).replace("-", "")


def generate_work_info(has_work, base_time, student_name, class_name, school_name, school_id):
    if not has_work:
        return [""] * 16

    work_time = base_time.replace(
        hour=random.randint(14, 16),
        minute=random.randint(0, 59),
        second=random.randint(0, 59)
    )

    return [
        str(random.randint(4502600, 4502800)),
        random.choice(WORK_TITLES),
        work_time.strftime("%Y/%m/%d %H:%M"),
        student_name,
        class_name,
        school_name,
        school_id,
        "2026年寒假活动",
        "向世界介绍我的学校",
        f"向世界介绍我的学校——{school_name}",
        "2032824",
        str(random.randint(0, 5)),
        str(random.randint(0, 5)),
        random.choice(TEACHER_NAMES),
        "",
        "",
    ]


def generate_like_info(has_work, like_count, base_time):
    if not has_work or like_count == 0:
        return [""] * 6

    like_student_ids = []
    like_school_ids = []
    like_times = []
    like_names = []

    for _ in range(like_count):
        like_student_ids.append(generate_uuid_str())
        like_school_ids.append("330106-Z000024")
        like_time = base_time + timedelta(
            hours=random.randint(0, 2),
            minutes=random.randint(0, 59)
        )
        like_times.append(like_time.strftime("%Y-%m-%d %H:%M:%S"))
        like_names.append(random.choice(STUDENT_NAMES))

    return [
        ";".join(like_student_ids),
        ";".join(like_school_ids),
        ";".join(like_times),
        str(like_count),
        ";".join(like_names),
        "",
    ]


def generate_comment_info(has_work, comment_count):
    if not has_work or comment_count == 0:
        return ""

    comments = []
    for _ in range(comment_count):
        name = random.choice(STUDENT_NAMES)
        comment = random.choice(COMMENTS)
        comments.append(f"{name}:{comment}")

    return "|".join(comments)


def generate_buried_point(has_work):
    if not has_work:
        return ["0", ""]

    record_count = random.choice([0, 1])
    if record_count == 0:
        return ["0", ""]

    meta = (
        f'[{{"username":{random.choice(STUDENT_NAMES)},'
        f'"userId":{generate_uuid_str()},'
        f'"orgId":"330106-Z000024",'
        f'"orgName":"杭州市秀水小学",'
        f'"userType":"student",'
        f'"code":{random.randint(10**18, 10**19 - 1)},'
        f'"fromBusiness":"hlwxx"}}]'
    )
    return ["1", meta]


def process_row(row, index):
    source_id = row[0]
    user_id = row[1]
    name = row[2]
    school_id = row[3]
    city = row[4]
    district = row[5]
    school = row[6]
    edu_stage = row[7]
    grade = row[8]
    class_name = row[9]
    raw_time = row[10]
    gender = row[11]
    learning_style = row[12]
    personality = row[13]
    communication = row[14]
    questionnaire_answers = row[15:53]

    base_time = parse_datetime(raw_time)

    submit_time = base_time + timedelta(
        days=random.randint(1, 3),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59)
    )

    q4 = str(random.randint(1, 5))
    q5 = str(random.randint(1, 5))
    q6 = str(random.randint(1, 5))
    q7 = str(random.randint(1, 5))
    q8 = str(random.randint(1, 5))
    total_score = str(int(q4) + int(q5) + int(q6) + int(q7))

    has_work = random.random() < 0.3

    work_info = generate_work_info(
        has_work, base_time, name, class_name, school, school_id
    )

    like_count = int(work_info[11]) if work_info[11] else 0
    comment_count = int(work_info[12]) if work_info[12] else 0

    like_info = generate_like_info(has_work, like_count, base_time)
    like_info[5] = generate_comment_info(has_work, comment_count)

    buried_point = generate_buried_point(has_work)

    result = [
        name,
        source_id,
        user_id,
        school_id,
        city,
        district,
        school,
        edu_stage,
        grade,
        class_name,
        raw_time,
        gender,
        learning_style,
        personality,
        communication,
    ]

    result.extend(questionnaire_answers)

    result.extend([
        str(index + 1),
        submit_time.strftime("%Y/%m/%d %H:%M:%S"),
        f"{random.randint(50, 300)}秒",
        "链接",
        "直接访问",
        generate_ip(),
        total_score,
        school,
        name,
        grade,
        q4,
        q5,
        q6,
        q7,
        q8,
    ])

    result.extend(work_info)
    result.extend(like_info)
    result.extend(buried_point)

    return result


def main():
    print(f"开始处理数据...")
    print(f"源文件: {SOURCE_FILE}")
    print(f"输出文件: {OUTPUT_FILE}")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    header = [
        "姓名", "问卷_列1", "user_id", "school_id", "问卷_列5", "问卷_列6", "问卷_列7",
        "学龄段", "年级", "班级", "问卷_列11", "性别", "问卷_列13", "问卷_列14",
        "问卷_列15", "问卷_列16", "问卷_列17", "问卷_列18", "问卷_列19", "问卷_列20",
        "问卷_列21", "问卷_列22", "问卷_列23", "问卷_列24", "问卷_列25", "问卷_列26",
        "问卷_列27", "问卷_列28", "问卷_列29", "问卷_列30", "问卷_列31", "问卷_列32",
        "问卷_列33", "问卷_列34", "问卷_列35", "问卷_列36", "问卷_列37", "问卷_列38",
        "问卷_列39", "问卷_列40", "问卷_列41", "问卷_列42", "问卷_列43", "问卷_列44",
        "问卷_列45", "问卷_列46", "问卷_列47", "问卷_列48", "问卷_列49", "问卷_列50",
        "问卷_列51", "问卷_列52", "问卷_列53", "序号", "提交答卷时间", "所用时间",
        "来源", "来源详情", "来自IP", "总分", "1、你的学校：", "2、你的姓名：",
        "3、你的年级：", "4、AI帮你生成的文案或图片，符合你心里的想法吗？",
        "5、智能体推送的资源链接对你制作海报有帮助吗？",
        "6、请评价你对今天自己制作的海报的满意程度：",
        "7、相比传统的「老师讲、学生做」，你更喜欢这种「和AI一起做项目」的上课方式吗？",
        "8、在这次设计中，谁给你的帮助最大？", "作品_作品ID", "作品_作品名称",
        "作品_作品发布时间", "作品_学生姓名", "作品_所在班级", "作品_所在学校",
        "作品_学校ID", "作品_所属教材", "作品_主题所属目录", "作品_主题名称",
        "作品_主题ID", "作品_作品被点赞数", "作品_作品被评论数", "作品_教师姓名",
        "作品_教师评分", "作品_教师评语", "点赞学生ID列表", "点赞学生学校ID列表",
        "点赞时间列表", "点赞总数", "点赞学生姓名列表", "评论内容列表",
        "埋点记录数", "埋点meta数据"
    ]

    with open(SOURCE_FILE, 'r', encoding='utf-8') as f_in, \
         open(OUTPUT_FILE, 'w', encoding='utf-8-sig', newline='') as f_out:

        reader = csv.reader(f_in)
        writer = csv.writer(f_out)
        writer.writerow(header)

        row_count = 0
        for index, row in enumerate(reader):
            if not row or len(row) < 5:
                continue

            while len(row) < 53:
                row.append("")

            processed_row = process_row(row, index)
            writer.writerow(processed_row)
            row_count += 1

            if row_count % 10000 == 0:
                print(f"已处理 {row_count} 行...")

    print(f"处理完成！共处理 {row_count} 行数据")
    print(f"输出文件: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
