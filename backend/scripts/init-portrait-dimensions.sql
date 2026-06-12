-- ============================================================
-- 学情画像 - 认知维度定义初始化脚本
-- 执行前请确认数据库连接正确
-- ============================================================

-- 清除已有数据（谨慎执行）
-- DELETE FROM cognitive_dimension_defs_test WHERE dimensionCode LIKE 'PORTRAIT_%';

INSERT INTO cognitive_dimension_defs_test 
  (id, dimensionCode, dimensionNameZh, category, minScore, maxScore, sortOrder, isActive)
VALUES
  -- 认知基础 - 人文基础 (1-2)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_READING', '阅读理解', '认知基础|人文基础', 0.00, 10.00, 1, true),
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_LANGUAGE', '语言表达', '认知基础|人文基础', 0.00, 10.00, 2, true),
  
  -- 认知基础 - 科学基础 (3-4)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_SCIENCE_KNOWLEDGE', '科学知识', '认知基础|科学基础', 0.00, 10.00, 3, true),
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_SCIENCE_INQUIRY', '科学探究', '认知基础|科学基础', 0.00, 10.00, 4, true),
  
  -- 认知基础 - 技术应用 (5-6)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_COMPUTATIONAL', '计算思维', '认知基础|技术应用', 0.00, 10.00, 5, true),
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'COG_TECH_LITERACY', '技术素养', '认知基础|技术应用', 0.00, 10.00, 6, true),
  
  -- 心理特质 - 心理健康 (7-8)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PSY_ANXIETY', '焦虑倾向', '心理特质|心理健康', 0.00, 10.00, 7, true),
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PSY_DEPRESSION', '抑郁倾向', '心理特质|心理健康', 0.00, 10.00, 8, true),
  
  -- 心理特质 - 坚韧豁达 (9)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PSY_RESILIENCE', '兴趣稳定性', '心理特质|坚韧豁达', 0.00, 10.00, 9, true),
  
  -- 心理特质 - 生活态度 (10)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PSY_PRESSURE', '学业压力', '心理特质|生活态度', 0.00, 10.00, 10, true),
  
  -- 实践创新 - 创新能力 (11)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PRAC_INNOVATION', '创新能力', '实践创新|创新能力', 0.00, 10.00, 11, true),
  
  -- 实践创新 - 问题解决能力 (12)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PRAC_PROBLEM_SOLVING', '问题解决能力', '实践创新|问题解决能力', 0.00, 10.00, 12, true),
  
  -- 实践创新 - 协作能力 (13)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PRAC_COLLABORATION', '协作能力', '实践创新|协作能力', 0.00, 10.00, 13, true),
  
  -- 实践创新 - 实践能力 (14)
  (CONCAT('dim_', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)), 'PRAC_PRACTICE', '实践能力', '实践创新|实践能力', 0.00, 10.00, 14, true)
ON DUPLICATE KEY UPDATE
  dimensionNameZh = VALUES(dimensionNameZh),
  category = VALUES(category),
  minScore = VALUES(minScore),
  maxScore = VALUES(maxScore),
  sortOrder = VALUES(sortOrder),
  isActive = VALUES(isActive);

-- 验证插入结果
SELECT dimensionCode, dimensionNameZh, category, minScore, maxScore, sortOrder
FROM cognitive_dimension_defs_test
WHERE dimensionCode LIKE 'COG_%' OR dimensionCode LIKE 'PSY_%' OR dimensionCode LIKE 'PRAC_%'
ORDER BY sortOrder;
