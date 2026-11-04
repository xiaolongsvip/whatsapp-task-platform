# Project Progress Register

Last updated: 2026-11-04

## Governance

- [x] User's project development and acceptance rules recorded in `docs/PROJECT_RULES.md`.
- [x] GitHub private repository confirmed: `xiaolongsvip/whatsapp-task-platform`.
- [x] GitHub integration has repository read/write permission.

## Repository foundation

- [x] Initial README and product principles committed.
- [x] Initial architecture, logical data model, and development plan committed.
- [x] pnpm workspace manifest and root package manifest committed.
- [x] Docker Compose template retained for a future optional database setup; it is not required by the current local startup path.
- [x] Initial Next.js/NestJS application package manifests and selected source/config files committed.
- [x] Initial Prisma schema committed.
- [x] Initial API health endpoint source committed.
- [x] User and admin Next.js App Router entry pages added.
- [x] Shared package entry point added.
- [x] Root scripts added for one-command local web/admin/API development without Docker.
- [x] Windows double-click startup helper added as `start-local.cmd`; it no longer checks or requires Docker Desktop.
- [x] Windows no-Docker local development workflow documented in `docs/LOCAL_DEVELOPMENT.md`.
- [x] CI upgraded to install dependencies, generate Prisma Client, validate Prisma, typecheck, lint, and build.
- [x] NestJS ESLint flat configuration and required lint dependencies added.
- [ ] Dependency installation verified on the latest CI revision.
- [ ] TypeScript checks verified.
- [ ] Lint and production builds verified.
- [ ] Database schema validation and migration verified.
- [ ] User and admin interfaces run and browser-verified on the user's PC.
- [ ] End-to-end API/database integration verified.

## Local development target

- User web: `http://localhost:3000`
- Admin web: `http://localhost:3001`
- API health: `http://localhost:3002/api/v1/health`
- One-click Windows startup: double-click `start-local.cmd`.
- Alternative startup: `pnpm dev:local`.
- Current startup runs Next.js user web, Next.js admin web, and NestJS API directly on Windows.
- Docker Desktop is not required.
- PostgreSQL and Redis are not started in this mode; database-backed features remain unavailable until those services are configured separately.

## Current milestone

**Status: Docker-free local web/API startup workflow committed; not yet accepted as a working local application.**

The user wants to inspect both frontend applications locally during development. The startup helper and instructions now support running the three application processes directly on Windows without Docker Desktop. Local dependency installation, process startup, browser checks, and database service setup have not yet been verified.

## Known prerequisites / risks

- Node.js 22 and pnpm 10.34.9 were previously confirmed on the user's PC.
- Git was not found in an earlier Windows environment check; GitHub Desktop can be used to clone the private repository without command-line Git.
- No local dependency installation or browser verification has been reported.
- The current no-Docker startup path is for frontend and API development only; PostgreSQL, Redis, Prisma migrations, queues, and persistent database operations need separately installed/configured services.
- GitHub repository files were changed through GitHub integration; no claim is made that a local checkout or runtime has been started.
- Do not commit secrets or use placeholder credentials in production.
