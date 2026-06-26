-- AlterTable
ALTER TABLE `student_profiles_test` ADD COLUMN `inDegree` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `outDegree` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `totalDegree` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `student_profiles_test_totalDegree_idx` ON `student_profiles_test`(`totalDegree`);
