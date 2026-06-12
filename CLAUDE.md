# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

教育交互网络可视化系统 — an education interaction network visualization system based on a ternary interaction model (Student-Teacher-Knowledge). It visualizes learning interactions and cognitive profiles using network graphs.

- **Backend**: NestJS (TypeScript) with Prisma ORM
- **Frontend**: React + TypeScript + Vite + D3.js
- **Database**: Dual-support — MySQL (local dev) and SQL Server (Aliyun RDS production)

## Common Commands

### Backend (`backend/`)

```bash
# Development server (runs on port 3334)
pnpm start:dev

# Build for production
pnpm build

# Lint (uses oxlint)
pnpm lint

# Run unit tests (jest, tests in `src/**/*.spec.ts`)
pnpm test

# Run single test file
pnpm test -- student.service.spec.ts

# Run e2e tests
pnpm test:e2e

# Database operations
pnpm db:generate     # Generate Prisma client
pnpm db:push         # Push schema to database (dev only)
pnpm db:seed         # Run seed script
```

### Frontend (`frontend/`)

```bash
# Development server (runs on port 3000)
pnpm dev

# Production build
pnpm build

# Preview production build
pnpm start

# Lint (uses eslint)
pnpm lint

# Run tests (jest, jsdom environment)
pnpm test
```

## Architecture

### Backend (NestJS)

- **Entry point**: `src/main.ts` — bootstraps NestJS app on port 3334 with CORS enabled
- **App module**: `src/app.module.ts` — imports all feature modules and global ConfigModule
- **Feature modules** under `src/modules/`:
  - `graph/` — core graph data queries and statistics (ternary network data)
  - `interaction/` — interaction relationship CRUD and analysis
  - `interaction-session/` — session management
  - `node/` — graph node management
  - `org/` — school/grade/class organization hierarchy
  - `scenario/` — learning scenario management
  - `student/` — student data and profiles
  - `resource/` — learning resources
  - `student-knowledge-relation/` — student-knowledge point associations
  - `classroom-analysis/` — classroom-level analytics
- **Shared layer** under `src/shared/`:
  - `utils/prisma.service.ts` — PrismaClient wrapper with auto database adapter selection
  - `types/` — shared TypeScript types

**Dual Database Support**: `PrismaService` automatically selects `@prisma/adapter-mssql` for `sqlserver://` URLs and `@prisma/adapter-mariadb` for `mysql://` URLs. Run `pnpm db:generate` after switching `.env` files.

**API conventions**:
- Base path: `/api/v1/{resource}`
- Response envelope: `{ data, meta, error }`
- Validation: zod schemas in DTOs, parsed with `.parse()` in Controllers
- Controllers handle parameter parsing only; business logic lives in Services
- Prisma transactions (`$transaction`) used for atomic operations
- Decimal type used for floating-point database values

### Frontend (React + Vite)

- **Entry point**: `index.tsx` → `App.tsx`
- **Build tool**: Vite (`vite.config.ts`), dev server on port 3000
- **Components** (`components/`):
  - `NetworkGraph.tsx` — D3.js force-directed graph visualization
  - `AnalysisPanel.tsx` — analysis results panel
  - `ClassroomAnalysisView.tsx` — classroom-level analysis view
- **Services** (`services/`):
  - `apiService.ts` — direct API calls
  - `dataService.ts` — business logic and data orchestration
  - `dataParser.ts` — data transformation
  - `strategies.ts` — cognitive strategy mappings
  - `dataValidator.ts` — input validation
  - `performanceUtils.ts` — optimization helpers
- **Tests**: Jest with jsdom, configured in `jest.config.js`

### Data Model (Prisma)

Core entities (see `backend/prisma/schema.prisma`):
- `GraphNode` — unified node table ( Student | Teacher | Knowledge | Class | School | Grade ); all network nodes stored here
- `StudentProfile` / `TeacherProfile` / `KnowledgeProfile` — 1:1 extensions of `GraphNode`
- `Interaction` — edges between nodes (source → target)
- `InteractionSession` — groups interactions by learning scenario
- `School` → `Grade` → `SchoolClass` — organizational hierarchy
- `StudentWork` / `Resource` / `StudentKnowledgeRelation` — learning content and associations

### Naming Conventions

| Layer | Convention | Example |
|-------|------------|---------|
| Backend files | kebab-case | `student-controller.ts` |
| Classes / interfaces | PascalCase | `StudentService` |
| Methods / variables | camelCase | `findAllStudents` |
| Database tables | snake_case, plural | `graph_nodes_test` |
| API paths | snake_case | `/api/v1/graph-data` |
| Request params | camelCase | `scenarioCode` |

## Development Notes

- Backend watch mode uses `fixedPollingInterval` for file watching (`tsconfig.json` `watchOptions`)
- Frontend path alias `@/` maps to the `frontend/` root
- Backend path alias `@/` maps to the `src/` root
- D3 graph node shape: `{ val: number, group: number, type: string }` for radius, grouping, and node type
- Generated data/scripts output should go to `backend/datas/script_filterd/`; one-off scripts go to `backend/scripts/`
- The `.env` file at `backend/.env` controls database target; `.env.production` contains Aliyun SQL Server credentials
