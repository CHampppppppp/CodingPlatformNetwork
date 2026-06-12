-- Add scenario ownership to schools and split the shared org tree into
-- scenario-scoped school/grade/class records without deleting existing data.

ALTER TABLE `schools_test`
  ADD COLUMN `scenarioId` VARCHAR(191) NULL;

CREATE TEMPORARY TABLE `_org_school_map` (
  `oldSchoolId` VARCHAR(191) NOT NULL,
  `scenarioId` VARCHAR(191) NOT NULL,
  `reuseOriginal` TINYINT(1) NOT NULL DEFAULT 0,
  `newSchoolId` VARCHAR(191) NULL,
  PRIMARY KEY (`oldSchoolId`, `scenarioId`)
);

INSERT IGNORE INTO `_org_school_map` (`oldSchoolId`, `scenarioId`)
SELECT DISTINCT gn.`schoolId`, gn.`scenarioId`
FROM `graph_nodes_test` gn
JOIN `schools_test` s ON s.`id` = gn.`schoolId`
WHERE gn.`scenarioId` IS NOT NULL
  AND gn.`schoolId` IS NOT NULL;

INSERT IGNORE INTO `_org_school_map` (`oldSchoolId`, `scenarioId`)
SELECT DISTINCT sess.`schoolId`, sess.`scenarioId`
FROM `interaction_sessions_test` sess
JOIN `schools_test` s ON s.`id` = sess.`schoolId`
WHERE sess.`scenarioId` IS NOT NULL
  AND sess.`schoolId` IS NOT NULL;

INSERT IGNORE INTO `_org_school_map` (`oldSchoolId`, `scenarioId`)
SELECT DISTINCT tp.`schoolId`, gn.`scenarioId`
FROM `teacher_profiles_test` tp
JOIN `graph_nodes_test` gn ON gn.`id` = tp.`nodeId`
JOIN `schools_test` s ON s.`id` = tp.`schoolId`
WHERE gn.`scenarioId` IS NOT NULL
  AND tp.`schoolId` IS NOT NULL;

CREATE TEMPORARY TABLE `_org_school_first` AS
SELECT `oldSchoolId`, MIN(`scenarioId`) AS `firstScenarioId`
FROM `_org_school_map`
GROUP BY `oldSchoolId`;

UPDATE `_org_school_map` sm
JOIN `_org_school_first` sf
  ON sf.`oldSchoolId` = sm.`oldSchoolId`
 AND sf.`firstScenarioId` = sm.`scenarioId`
SET sm.`reuseOriginal` = 1,
    sm.`newSchoolId` = sm.`oldSchoolId`;

UPDATE `_org_school_map`
SET `newSchoolId` = CONCAT('school_', REPLACE(UUID(), '-', ''))
WHERE `newSchoolId` IS NULL;

UPDATE `schools_test` s
JOIN `_org_school_map` sm
  ON sm.`oldSchoolId` = s.`id`
 AND sm.`reuseOriginal` = 1
SET s.`scenarioId` = sm.`scenarioId`;

SET @school_name_unique_index := (
  SELECT s.`INDEX_NAME`
  FROM `information_schema`.`STATISTICS` s
  WHERE s.`TABLE_SCHEMA` = DATABASE()
    AND s.`TABLE_NAME` = 'schools_test'
    AND s.`NON_UNIQUE` = 0
    AND s.`INDEX_NAME` <> 'PRIMARY'
  GROUP BY s.`INDEX_NAME`
  HAVING COUNT(*) = 1
     AND MAX(s.`COLUMN_NAME` = 'name') = 1
  LIMIT 1
);

SET @drop_school_name_unique_sql := IF(
  @school_name_unique_index IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `schools_test` DROP INDEX `', @school_name_unique_index, '`')
);
PREPARE drop_school_name_unique_stmt FROM @drop_school_name_unique_sql;
EXECUTE drop_school_name_unique_stmt;
DEALLOCATE PREPARE drop_school_name_unique_stmt;

INSERT INTO `schools_test` (`id`, `scenarioId`, `name`, `createdAt`)
SELECT sm.`newSchoolId`, sm.`scenarioId`, s.`name`, s.`createdAt`
FROM `_org_school_map` sm
JOIN `schools_test` s ON s.`id` = sm.`oldSchoolId`
WHERE sm.`reuseOriginal` = 0;

CREATE TEMPORARY TABLE `_org_grade_map` (
  `oldGradeId` VARCHAR(191) NOT NULL,
  `scenarioId` VARCHAR(191) NOT NULL,
  `oldSchoolId` VARCHAR(191) NOT NULL,
  `newSchoolId` VARCHAR(191) NOT NULL,
  `reuseOriginal` TINYINT(1) NOT NULL DEFAULT 0,
  `newGradeId` VARCHAR(191) NULL,
  PRIMARY KEY (`oldGradeId`, `scenarioId`, `newSchoolId`)
);

INSERT IGNORE INTO `_org_grade_map` (
  `oldGradeId`,
  `scenarioId`,
  `oldSchoolId`,
  `newSchoolId`,
  `reuseOriginal`
)
SELECT DISTINCT g.`id`, sm.`scenarioId`, sm.`oldSchoolId`, sm.`newSchoolId`, sm.`reuseOriginal`
FROM `_org_school_map` sm
JOIN `grades_test` g ON g.`schoolId` = sm.`oldSchoolId`
JOIN (
  SELECT `scenarioId`, `schoolId`, `gradeId`
  FROM `graph_nodes_test`
  WHERE `scenarioId` IS NOT NULL
    AND `schoolId` IS NOT NULL
    AND `gradeId` IS NOT NULL
  UNION
  SELECT `scenarioId`, `schoolId`, `gradeId`
  FROM `interaction_sessions_test`
  WHERE `scenarioId` IS NOT NULL
    AND `schoolId` IS NOT NULL
    AND `gradeId` IS NOT NULL
  UNION
  SELECT gn.`scenarioId`, tp.`schoolId`, tp.`gradeId`
  FROM `teacher_profiles_test` tp
  JOIN `graph_nodes_test` gn ON gn.`id` = tp.`nodeId`
  WHERE gn.`scenarioId` IS NOT NULL
    AND tp.`schoolId` IS NOT NULL
    AND tp.`gradeId` IS NOT NULL
) refs
  ON refs.`scenarioId` = sm.`scenarioId`
 AND refs.`schoolId` = sm.`oldSchoolId`
 AND refs.`gradeId` = g.`id`;

UPDATE `_org_grade_map`
SET `newGradeId` = `oldGradeId`
WHERE `reuseOriginal` = 1;

UPDATE `_org_grade_map`
SET `newGradeId` = CONCAT('grade_', REPLACE(UUID(), '-', ''))
WHERE `newGradeId` IS NULL;

INSERT INTO `grades_test` (`id`, `schoolId`, `gradeName`, `createdAt`)
SELECT gm.`newGradeId`, gm.`newSchoolId`, g.`gradeName`, g.`createdAt`
FROM `_org_grade_map` gm
JOIN `grades_test` g ON g.`id` = gm.`oldGradeId`
WHERE gm.`reuseOriginal` = 0;

CREATE TEMPORARY TABLE `_org_class_map` (
  `oldClassId` VARCHAR(191) NOT NULL,
  `scenarioId` VARCHAR(191) NOT NULL,
  `oldGradeId` VARCHAR(191) NOT NULL,
  `newGradeId` VARCHAR(191) NOT NULL,
  `reuseOriginal` TINYINT(1) NOT NULL DEFAULT 0,
  `newClassId` VARCHAR(191) NULL,
  PRIMARY KEY (`oldClassId`, `scenarioId`, `newGradeId`)
);

INSERT IGNORE INTO `_org_class_map` (
  `oldClassId`,
  `scenarioId`,
  `oldGradeId`,
  `newGradeId`,
  `reuseOriginal`
)
SELECT DISTINCT c.`id`, gm.`scenarioId`, gm.`oldGradeId`, gm.`newGradeId`, gm.`reuseOriginal`
FROM `_org_grade_map` gm
JOIN `classes_test` c ON c.`gradeId` = gm.`oldGradeId`
JOIN (
  SELECT `scenarioId`, `gradeId`, `classId`
  FROM `graph_nodes_test`
  WHERE `scenarioId` IS NOT NULL
    AND `gradeId` IS NOT NULL
    AND `classId` IS NOT NULL
  UNION
  SELECT `scenarioId`, `gradeId`, `classId`
  FROM `interaction_sessions_test`
  WHERE `scenarioId` IS NOT NULL
    AND `gradeId` IS NOT NULL
    AND `classId` IS NOT NULL
  UNION
  SELECT gn.`scenarioId`, tp.`gradeId`, tp.`classId`
  FROM `teacher_profiles_test` tp
  JOIN `graph_nodes_test` gn ON gn.`id` = tp.`nodeId`
  WHERE gn.`scenarioId` IS NOT NULL
    AND tp.`gradeId` IS NOT NULL
    AND tp.`classId` IS NOT NULL
) refs
  ON refs.`scenarioId` = gm.`scenarioId`
 AND refs.`gradeId` = gm.`oldGradeId`
 AND refs.`classId` = c.`id`;

UPDATE `_org_class_map`
SET `newClassId` = `oldClassId`
WHERE `reuseOriginal` = 1;

UPDATE `_org_class_map`
SET `newClassId` = CONCAT('class_', REPLACE(UUID(), '-', ''))
WHERE `newClassId` IS NULL;

INSERT INTO `classes_test` (`id`, `gradeId`, `className`, `teacherId`, `createdAt`)
SELECT cm.`newClassId`, cm.`newGradeId`, c.`className`, NULL, c.`createdAt`
FROM `_org_class_map` cm
JOIN `classes_test` c ON c.`id` = cm.`oldClassId`
WHERE cm.`reuseOriginal` = 0;

UPDATE `graph_nodes_test` gn
JOIN `_org_school_map` sm
  ON sm.`scenarioId` = gn.`scenarioId`
 AND sm.`oldSchoolId` = gn.`schoolId`
LEFT JOIN `_org_grade_map` gm
  ON gm.`scenarioId` = gn.`scenarioId`
 AND gm.`oldGradeId` = gn.`gradeId`
LEFT JOIN `_org_class_map` cm
  ON cm.`scenarioId` = gn.`scenarioId`
 AND cm.`oldClassId` = gn.`classId`
SET gn.`schoolId` = sm.`newSchoolId`,
    gn.`gradeId` = COALESCE(gm.`newGradeId`, gn.`gradeId`),
    gn.`classId` = COALESCE(cm.`newClassId`, gn.`classId`)
WHERE gn.`schoolId` IS NOT NULL;

UPDATE `interaction_sessions_test` sess
JOIN `_org_school_map` sm
  ON sm.`scenarioId` = sess.`scenarioId`
 AND sm.`oldSchoolId` = sess.`schoolId`
LEFT JOIN `_org_grade_map` gm
  ON gm.`scenarioId` = sess.`scenarioId`
 AND gm.`oldGradeId` = sess.`gradeId`
LEFT JOIN `_org_class_map` cm
  ON cm.`scenarioId` = sess.`scenarioId`
 AND cm.`oldClassId` = sess.`classId`
SET sess.`schoolId` = sm.`newSchoolId`,
    sess.`gradeId` = COALESCE(gm.`newGradeId`, sess.`gradeId`),
    sess.`classId` = COALESCE(cm.`newClassId`, sess.`classId`)
WHERE sess.`schoolId` IS NOT NULL;

UPDATE `teacher_profiles_test` tp
JOIN `graph_nodes_test` gn ON gn.`id` = tp.`nodeId`
JOIN `_org_school_map` sm
  ON sm.`scenarioId` = gn.`scenarioId`
 AND sm.`oldSchoolId` = tp.`schoolId`
LEFT JOIN `_org_grade_map` gm
  ON gm.`scenarioId` = gn.`scenarioId`
 AND gm.`oldGradeId` = tp.`gradeId`
LEFT JOIN `_org_class_map` cm
  ON cm.`scenarioId` = gn.`scenarioId`
 AND cm.`oldClassId` = tp.`classId`
SET tp.`schoolId` = sm.`newSchoolId`,
    tp.`gradeId` = COALESCE(gm.`newGradeId`, tp.`gradeId`),
    tp.`classId` = COALESCE(cm.`newClassId`, tp.`classId`)
WHERE tp.`schoolId` IS NOT NULL;

UPDATE `classes_test` c
JOIN `teacher_profiles_test` tp ON tp.`classId` = c.`id`
SET c.`teacherId` = tp.`nodeId`
WHERE c.`teacherId` IS NULL;

UPDATE `schools_test`
SET `scenarioId` = (
  SELECT ls.`id`
  FROM `learning_scenarios_test` ls
  ORDER BY ls.`isActive` DESC, ls.`sortOrder` ASC, ls.`createdAt` ASC
  LIMIT 1
)
WHERE `scenarioId` IS NULL;

ALTER TABLE `schools_test`
  MODIFY `scenarioId` VARCHAR(191) NOT NULL;

CREATE INDEX `schools_test_scenarioId_idx`
  ON `schools_test`(`scenarioId`);

CREATE UNIQUE INDEX `schools_test_scenarioId_name_key`
  ON `schools_test`(`scenarioId`, `name`);

ALTER TABLE `schools_test`
  ADD CONSTRAINT `schools_test_scenarioId_fkey`
  FOREIGN KEY (`scenarioId`)
  REFERENCES `learning_scenarios_test`(`id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
