const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  const tables = [
    'graph_nodes_test',
    'student_profiles_test',
    'teacher_profiles_test',
    'knowledge_profiles_test',
    'interaction_sessions_test',
    'interactions_test',
    'schools_test',
    'grades_test',
    'classes_test',
    'student_survey_responses_test',
    'learning_scenarios_test',
    'student_cognitive_profiles_test',
    'student_cognitive_dimension_scores_test',
    'resources_test',
    'resource_knowledge_relations_test',
    'cognitive_dimension_defs_test'
  ];
  
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`${table}: ${result[0].count}`);
    } catch (e) {
      console.log(`${table}: ERROR`);
    }
  }
  
  await prisma.$disconnect();
}
check();
