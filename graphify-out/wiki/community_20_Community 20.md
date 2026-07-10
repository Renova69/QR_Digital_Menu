# Community 20

**Community 20** — 10 nodes

## Nodes

### Docker build cache staleness Р Р†Р вЂљРІР‚Сњ Docker's cached layers prevented new endpoints from deploying, anonymous volumes masked /dist directory

- **ID:** `DockerCacheBug`
- **Type:** document
- **Degree:** 3
- **Source:** `Optimizing Development Workflow Architecture .md`
- **Outbound:**
  - → `Backend package.json missing dev script Р Р†Р вЂљРІР‚Сњ npm run dev from root failed because backend had no 'dev' script` [_`related_to`_ | INFERRED | score: 0.6]

### Migration from Docker Compose (4 services: app, frontend, test-app, db/Postgres15) to native-first Turborepo with Neon cloud DB

- **ID:** `DockerToNativeMigration`
- **Type:** document
- **Degree:** 3
- **Source:** `architecture_proposal.md`
- **Outbound:**
  - → `docker-compose.yml Р Р†Р вЂљРІР‚Сњ 4 services: app (backend), frontend (React), test-app, db (PostgreSQL 15) with volume mounts for uploads and pg_data` [_`replaced`_ | EXTRACTED | score: 1.0]
  - → `Architecture migration transcript Р Р†Р вЂљРІР‚Сњ directory restructure (monorepo layout), Neon DB integration replacing Docker Postgres, Turborepo setup with npm workspaces, prisma.config.js deletion, backend dev script fix` [_`documented_in`_ | EXTRACTED | score: 1.0]
  - → `Docker build cache staleness Р Р†Р вЂљРІР‚Сњ Docker's cached layers prevented new endpoints from deploying, anonymous volumes masked /dist directory` [_`motivated`_ | EXTRACTED | score: 1.0]

### Architecture migration transcript Р Р†Р вЂљРІР‚Сњ directory restructure (monorepo layout), Neon DB integration replacing Docker Postgres, Turborepo setup with npm workspaces, prisma.config.js deletion, backend dev script fix

- **ID:** `ArchitectureMigrationTranscript`
- **Type:** document
- **Degree:** 1
- **Source:** `Optimizing Development Workflow Architecture .md`

### Backend package.json missing dev script Р Р†Р вЂљРІР‚Сњ npm run dev from root failed because backend had no 'dev' script

- **ID:** `BackendDevScriptMissing`
- **Type:** code
- **Degree:** 1
- **Source:** `Optimizing Development Workflow Architecture .md`

### docker-compose.yml Р Р†Р вЂљРІР‚Сњ 4 services: app (backend), frontend (React), test-app, db (PostgreSQL 15) with volume mounts for uploads and pg_data

- **ID:** `DockerComposeConfig`
- **Type:** code
- **Degree:** 1
- **Source:** `docker-compose.yml`

### Database reset losing all data Р Р†Р вЂљРІР‚Сњ docker compose down -v cleared PostgreSQL volume, immediate reseed with demo data (demo@codespaces.com / codespaces2026)

- **ID:** `dBresetDataLoss`
- **Type:** document
- **Degree:** 1
- **Source:** `30.04.26_cursor_markdown_file_issue_outline.md`
- **Outbound:**
  - → `Docker build cache staleness Р Р†Р вЂљРІР‚Сњ Docker's cached layers prevented new endpoints from deploying, anonymous volumes masked /dist directory` [_`caused_by`_ | INFERRED | score: 0.75]
