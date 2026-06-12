
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'learning_scenarios_test')
BEGIN
CREATE TABLE [learning_scenarios_test] (
    [id] nvarchar(1000) NOT NULL,
    [code] nvarchar(1000) NOT NULL,
    [nameZh] nvarchar(1000) NOT NULL,
    [sortOrder] int NOT NULL DEFAULT ((0)),
    [isActive] bit NOT NULL DEFAULT ((1)),
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [updatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_learning_scenarios_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [learning_scenarios_test_code_key] UNIQUE ([code])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schools_test')
BEGIN
CREATE TABLE [schools_test] (
    [id] nvarchar(1000) NOT NULL,
    [name] nvarchar(1000) NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_schools_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [schools_test_name_key] UNIQUE ([name])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'grades_test')
BEGIN
CREATE TABLE [grades_test] (
    [id] nvarchar(1000) NOT NULL,
    [schoolId] nvarchar(1000) NOT NULL,
    [gradeName] int NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_grades_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [grades_test_schoolId_gradeName_key] UNIQUE ([schoolId], [gradeName])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'classes_test')
BEGIN
CREATE TABLE [classes_test] (
    [id] nvarchar(1000) NOT NULL,
    [gradeId] nvarchar(1000) NOT NULL,
    [className] nvarchar(1000) NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_classes_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [classes_test_gradeId_className_key] UNIQUE ([gradeId], [className])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'graph_nodes_test')
BEGIN
CREATE TABLE [graph_nodes_test] (
    [id] nvarchar(1000) NOT NULL,
    [nodeType] nvarchar(1000) NOT NULL,
    [displayName] nvarchar(1000) NOT NULL,
    [classId] nvarchar(1000) NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [updatedAt] datetime2 NOT NULL,
    [gradeId] nvarchar(1000) NULL,
    [scenarioId] nvarchar(1000) NOT NULL,
    [schoolId] nvarchar(1000) NULL,
    CONSTRAINT [PK_graph_nodes_test] PRIMARY KEY CLUSTERED ([id])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'student_profiles_test')
BEGIN
CREATE TABLE [student_profiles_test] (
    [nodeId] nvarchar(1000) NOT NULL,
    [externalUserId] nvarchar(1000) NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [updatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_student_profiles_test] PRIMARY KEY CLUSTERED ([nodeId])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'teacher_profiles_test')
BEGIN
CREATE TABLE [teacher_profiles_test] (
    [nodeId] nvarchar(1000) NOT NULL,
    [subject] nvarchar(1000) NULL,
    [teachingGrade] int NULL,
    [teachingClass] nvarchar(1000) NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [updatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_teacher_profiles_test] PRIMARY KEY CLUSTERED ([nodeId])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'knowledge_profiles_test')
BEGIN
CREATE TABLE [knowledge_profiles_test] (
    [nodeId] nvarchar(1000) NOT NULL,
    [externalUserId] nvarchar(1000) NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [updatedAt] datetime2 NOT NULL,
    CONSTRAINT [PK_knowledge_profiles_test] PRIMARY KEY CLUSTERED ([nodeId])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cognitive_dimension_defs_test')
BEGIN
CREATE TABLE [cognitive_dimension_defs_test] (
    [id] nvarchar(1000) NOT NULL,
    [dimensionCode] nvarchar(1000) NOT NULL,
    [dimensionNameZh] nvarchar(1000) NOT NULL,
    [minScore] decimal(5,2) NOT NULL,
    [maxScore] decimal(5,2) NOT NULL,
    [sortOrder] int NOT NULL DEFAULT ((0)),
    [isActive] bit NOT NULL DEFAULT ((1)),
    [category] nvarchar(1000) NOT NULL,
    CONSTRAINT [PK_cognitive_dimension_defs_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [cognitive_dimension_defs_test_dimensionCode_key] UNIQUE ([dimensionCode])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'interaction_sessions_test')
BEGIN
CREATE TABLE [interaction_sessions_test] (
    [id] nvarchar(1000) NOT NULL,
    [scenarioId] nvarchar(1000) NOT NULL,
    [sessionName] nvarchar(1000) NULL,
    [occurredAt] datetime2 NOT NULL,
    [classId] nvarchar(1000) NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    [gradeId] nvarchar(1000) NOT NULL,
    [schoolId] nvarchar(1000) NOT NULL,
    CONSTRAINT [PK_interaction_sessions_test] PRIMARY KEY CLUSTERED ([id])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'interactions_test')
BEGIN
CREATE TABLE [interactions_test] (
    [id] nvarchar(1000) NOT NULL,
    [sessionId] nvarchar(1000) NOT NULL,
    [sourceNodeId] nvarchar(1000) NOT NULL,
    [targetNodeId] nvarchar(1000) NOT NULL,
    [interactionType] nvarchar(1000) NOT NULL,
    [strength] decimal(10,4) NOT NULL,
    [actionType] nvarchar(1000) NULL,
    [durationSec] int NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_interactions_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [interactions_test_sessionId_sourceNodeId_targetNodeId_interactionType_actionType_key] UNIQUE ([sessionId], [sourceNodeId], [targetNodeId], [interactionType], [actionType])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'student_cognitive_profiles_test')
BEGIN
CREATE TABLE [student_cognitive_profiles_test] (
    [id] nvarchar(1000) NOT NULL,
    [studentNodeId] nvarchar(1000) NOT NULL,
    [profileVersion] nvarchar(1000) NOT NULL,
    [generatedAt] datetime2 NOT NULL,
    [totalScore] decimal(5,2) NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_student_cognitive_profiles_test] PRIMARY KEY CLUSTERED ([id])
);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'student_cognitive_dimension_scores_test')
BEGIN
CREATE TABLE [student_cognitive_dimension_scores_test] (
    [id] nvarchar(1000) NOT NULL,
    [profileId] nvarchar(1000) NOT NULL,
    [dimensionCode] nvarchar(1000) NOT NULL,
    [scoreValue] decimal(5,2) NOT NULL,
    [scoreLevel] nvarchar(1000) NOT NULL,
    [createdAt] datetime2 NOT NULL DEFAULT (getdate()),
    CONSTRAINT [PK_student_cognitive_dimension_scores_test] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [student_cognitive_dimension_scores_test_profileId_dimensionCode_key] UNIQUE ([profileId], [dimensionCode])
);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'learning_scenarios_test_code_key' AND object_id = OBJECT_ID('learning_scenarios_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [learning_scenarios_test_code_key] ON [learning_scenarios_test] ([code]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'schools_test_name_key' AND object_id = OBJECT_ID('schools_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [schools_test_name_key] ON [schools_test] ([name]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'grades_test_schoolId_gradeName_key' AND object_id = OBJECT_ID('grades_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [grades_test_schoolId_gradeName_key] ON [grades_test] ([schoolId], [gradeName]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'grades_test_schoolId_idx' AND object_id = OBJECT_ID('grades_test'))
BEGIN
CREATE NONCLUSTERED INDEX [grades_test_schoolId_idx] ON [grades_test] ([schoolId]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'classes_test_gradeId_className_key' AND object_id = OBJECT_ID('classes_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [classes_test_gradeId_className_key] ON [classes_test] ([gradeId], [className]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'classes_test_gradeId_idx' AND object_id = OBJECT_ID('classes_test'))
BEGIN
CREATE NONCLUSTERED INDEX [classes_test_gradeId_idx] ON [classes_test] ([gradeId]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'graph_nodes_test_nodeType_idx' AND object_id = OBJECT_ID('graph_nodes_test'))
BEGIN
CREATE NONCLUSTERED INDEX [graph_nodes_test_nodeType_idx] ON [graph_nodes_test] ([nodeType]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'graph_nodes_test_scenarioId_idx' AND object_id = OBJECT_ID('graph_nodes_test'))
BEGIN
CREATE NONCLUSTERED INDEX [graph_nodes_test_scenarioId_idx] ON [graph_nodes_test] ([scenarioId]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'graph_nodes_test_schoolId_gradeId_classId_idx' AND object_id = OBJECT_ID('graph_nodes_test'))
BEGIN
CREATE NONCLUSTERED INDEX [graph_nodes_test_schoolId_gradeId_classId_idx] ON [graph_nodes_test] ([schoolId], [gradeId], [classId]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'cognitive_dimension_defs_test_dimensionCode_key' AND object_id = OBJECT_ID('cognitive_dimension_defs_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [cognitive_dimension_defs_test_dimensionCode_key] ON [cognitive_dimension_defs_test] ([dimensionCode]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interaction_sessions_test_scenarioId_occurredAt_idx' AND object_id = OBJECT_ID('interaction_sessions_test'))
BEGIN
CREATE NONCLUSTERED INDEX [interaction_sessions_test_scenarioId_occurredAt_idx] ON [interaction_sessions_test] ([scenarioId], [occurredAt]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interaction_sessions_test_schoolId_gradeId_classId_occurredAt_idx' AND object_id = OBJECT_ID('interaction_sessions_test'))
BEGIN
CREATE NONCLUSTERED INDEX [interaction_sessions_test_schoolId_gradeId_classId_occurredAt_idx] ON [interaction_sessions_test] ([schoolId], [gradeId], [classId], [occurredAt]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interactions_test_interactionType_createdAt_idx' AND object_id = OBJECT_ID('interactions_test'))
BEGIN
CREATE NONCLUSTERED INDEX [interactions_test_interactionType_createdAt_idx] ON [interactions_test] ([interactionType], [createdAt]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interactions_test_sessionId_idx' AND object_id = OBJECT_ID('interactions_test'))
BEGIN
CREATE NONCLUSTERED INDEX [interactions_test_sessionId_idx] ON [interactions_test] ([sessionId]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interactions_test_sessionId_sourceNodeId_targetNodeId_interactionType_actionType_key' AND object_id = OBJECT_ID('interactions_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [interactions_test_sessionId_sourceNodeId_targetNodeId_interactionType_actionType_key] ON [interactions_test] ([sessionId], [sourceNodeId], [targetNodeId], [interactionType], [actionType]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'interactions_test_sourceNodeId_targetNodeId_idx' AND object_id = OBJECT_ID('interactions_test'))
BEGIN
CREATE NONCLUSTERED INDEX [interactions_test_sourceNodeId_targetNodeId_idx] ON [interactions_test] ([sourceNodeId], [targetNodeId]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'student_cognitive_profiles_test_studentNodeId_generatedAt_idx' AND object_id = OBJECT_ID('student_cognitive_profiles_test'))
BEGIN
CREATE NONCLUSTERED INDEX [student_cognitive_profiles_test_studentNodeId_generatedAt_idx] ON [student_cognitive_profiles_test] ([studentNodeId], [generatedAt] DESC);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'student_cognitive_dimension_scores_test_profileId_dimensionCode_key' AND object_id = OBJECT_ID('student_cognitive_dimension_scores_test'))
BEGIN
CREATE UNIQUE NONCLUSTERED INDEX [student_cognitive_dimension_scores_test_profileId_dimensionCode_key] ON [student_cognitive_dimension_scores_test] ([profileId], [dimensionCode]);
END


IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'student_cognitive_dimension_scores_test_profileId_idx' AND object_id = OBJECT_ID('student_cognitive_dimension_scores_test'))
BEGIN
CREATE NONCLUSTERED INDEX [student_cognitive_dimension_scores_test_profileId_idx] ON [student_cognitive_dimension_scores_test] ([profileId]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'grades_test_schoolId_fkey')
BEGIN
ALTER TABLE [grades_test] ADD CONSTRAINT [grades_test_schoolId_fkey] FOREIGN KEY ([schoolId]) REFERENCES [schools_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'classes_test_gradeId_fkey')
BEGIN
ALTER TABLE [classes_test] ADD CONSTRAINT [classes_test_gradeId_fkey] FOREIGN KEY ([gradeId]) REFERENCES [grades_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'graph_nodes_test_scenarioId_fkey')
BEGIN
ALTER TABLE [graph_nodes_test] ADD CONSTRAINT [graph_nodes_test_scenarioId_fkey] FOREIGN KEY ([scenarioId]) REFERENCES [learning_scenarios_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'student_profiles_test_nodeId_fkey')
BEGIN
ALTER TABLE [student_profiles_test] ADD CONSTRAINT [student_profiles_test_nodeId_fkey] FOREIGN KEY ([nodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'teacher_profiles_test_nodeId_fkey')
BEGIN
ALTER TABLE [teacher_profiles_test] ADD CONSTRAINT [teacher_profiles_test_nodeId_fkey] FOREIGN KEY ([nodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'knowledge_profiles_test_nodeId_fkey')
BEGIN
ALTER TABLE [knowledge_profiles_test] ADD CONSTRAINT [knowledge_profiles_test_nodeId_fkey] FOREIGN KEY ([nodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'interaction_sessions_test_scenarioId_fkey')
BEGIN
ALTER TABLE [interaction_sessions_test] ADD CONSTRAINT [interaction_sessions_test_scenarioId_fkey] FOREIGN KEY ([scenarioId]) REFERENCES [learning_scenarios_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'interactions_test_sourceNodeId_fkey')
BEGIN
ALTER TABLE [interactions_test] ADD CONSTRAINT [interactions_test_sourceNodeId_fkey] FOREIGN KEY ([sourceNodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'interactions_test_targetNodeId_fkey')
BEGIN
ALTER TABLE [interactions_test] ADD CONSTRAINT [interactions_test_targetNodeId_fkey] FOREIGN KEY ([targetNodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'interactions_test_sessionId_fkey')
BEGIN
ALTER TABLE [interactions_test] ADD CONSTRAINT [interactions_test_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [interaction_sessions_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'student_cognitive_profiles_test_studentNodeId_fkey')
BEGIN
ALTER TABLE [student_cognitive_profiles_test] ADD CONSTRAINT [student_cognitive_profiles_test_studentNodeId_fkey] FOREIGN KEY ([studentNodeId]) REFERENCES [graph_nodes_test] ([id]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'student_cognitive_dimension_scores_test_dimensionCode_fkey')
BEGIN
ALTER TABLE [student_cognitive_dimension_scores_test] ADD CONSTRAINT [student_cognitive_dimension_scores_test_dimensionCode_fkey] FOREIGN KEY ([dimensionCode]) REFERENCES [cognitive_dimension_defs_test] ([dimensionCode]);
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'student_cognitive_dimension_scores_test_profileId_fkey')
BEGIN
ALTER TABLE [student_cognitive_dimension_scores_test] ADD CONSTRAINT [student_cognitive_dimension_scores_test_profileId_fkey] FOREIGN KEY ([profileId]) REFERENCES [student_cognitive_profiles_test] ([id]);
END
