# Local Development (Windows, no Docker)

The current local workflow runs the user web app, admin web app, and API directly on Windows. Docker Desktop is not required.

## Local addresses

- User web: http://localhost:3000
- Admin web: http://localhost:3001
- API health: http://localhost:3002/api/v1/health

## Prerequisites

- Windows 10/11 64-bit
- Node.js 22
- pnpm 10.34.9 via Corepack
- Git for Windows or GitHub Desktop

## First-time setup

1. Install the prerequisites listed above.
2. Clone this private repository to the local computer (GitHub Desktop can do this without command-line Git).
3. Double-click `start-local.cmd` in the repository root.

The startup helper creates `.env` from `.env.example` if needed, checks and installs workspace dependencies, generates Prisma Client from the current schema, and starts the user web app, admin web app, and API in separate processes. It does not install, check, or start Docker Desktop, and it does not overwrite an existing `.env`.

Alternatively, run `pnpm dev:local` from the repository root after the first-time setup.

Stop all development servers with Ctrl+C in the startup window.

## Important: database availability

This no-Docker workflow currently starts the frontend applications and the API health endpoint only. PostgreSQL and Redis are not started by this script. Database-dependent features, Prisma migrations, queues, and persistent data operations will not work until PostgreSQL and Redis are installed and configured as native Windows services or another separately managed local service.

The sample `DATABASE_URL` and `REDIS_URL` in `.env.example` are placeholders for local development. Do not treat them as running services or production credentials.

## Live development

Next.js development servers refresh the relevant browser page when frontend source changes. NestJS runs in watch mode and restarts the API when backend source changes.

## Notes

- The first dependency installation requires internet access and may take several minutes.
- Ports 3000, 3001, and 3002 must be available for the three applications.
- This local workflow is for development and manual acceptance, not production deployment.
