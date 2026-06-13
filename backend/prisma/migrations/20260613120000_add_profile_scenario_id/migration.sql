-- Add scenarioId to knowledge_profiles_test (synced from associated GraphNode.scenarioId)
-- Step 1: add nullable column first to avoid NOT NULL failure on existing rows
ALTER TABLE `knowledge_profiles_test` ADD COLUMN `scenarioId` VARCHAR(191) NULL;

-- Step 2: backfill scenarioId for 172 existing profiles from their GraphNode
UPDATE `knowledge_profiles_test` kp
JOIN `graph_nodes_test` gn ON gn.id = kp.nodeId
SET kp.`scenarioId` = gn.`scenarioId`;

-- Step 3: create profile rows for 60 Knowledge nodes that don't have a profile yet
INSERT INTO `knowledge_profiles_test` (`nodeId`, `scenarioId`, `createdAt`, `updatedAt`)
SELECT gn.id, gn.`scenarioId`, NOW(), NOW()
FROM `graph_nodes_test` gn
LEFT JOIN `knowledge_profiles_test` kp ON kp.nodeId = gn.id
WHERE gn.`nodeType` = 'Knowledge' AND kp.nodeId IS NULL;

-- Step 4: tighten to NOT NULL after all 232 profiles have scenarioId
ALTER TABLE `knowledge_profiles_test` MODIFY COLUMN `scenarioId` VARCHAR(191) NOT NULL;

-- Step 5: index for query performance
CREATE INDEX `knowledge_profiles_test_scenarioId_idx` ON `knowledge_profiles_test`(`scenarioId`);

-- Step 6: foreign key to learning_scenarios_test
ALTER TABLE `knowledge_profiles_test` ADD CONSTRAINT `knowledge_profiles_test_scenarioId_fkey` FOREIGN KEY (`scenarioId`) REFERENCES `learning_scenarios_test`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;