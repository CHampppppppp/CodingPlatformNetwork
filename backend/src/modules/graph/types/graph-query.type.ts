export type GraphQuery = {
  scenarioCode?: string;
  schoolId?: string;
  gradeId?: string;
  classId?: string;
  from?: string;
  to?: string;
};

export type ScenarioStatsQuery = Omit<GraphQuery, "scenarioCode">;
