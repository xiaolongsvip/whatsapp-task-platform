# Local Development (Windows)

The project is designed to run locally with live reload for all three applications.

## Local addresses

- User web: http://localhost:3000
- Admin web: http://localhost:3001
- API health: http://localhost:3002/api/v1/health

## Prerequisites

- Windows 10/11 64-bit
- Node.js 22
- pnpm 10.34.9 via Corepack
- Git for Windows or GitHub Desktop
- Docker Desktop with the WSL 2 backend enabled

PostgreSQL and Redis run in Docker Compose. The web applications and API run directly on Windows so file watching and browser debugging remain straightforward.

## First-time setup

1. Install the prerequisites listed above.
2. Clone this private repository to the local computer (GitHub Desktop can do this without command-line Git).
3. Start Docker Desktop and wait until its engine is ready.
4. Double-click `start-local.cmd` in the repository root.

The startup helper creates `.env` from `.env.example` if needed, installs dependencies on first launch, verifies Docker is running, starts PostgreSQL and Redis, and launches the three development servers. It does not overwrite an existing `.env`.

Alternatively, run `pnpm dev:local` from the repository root after the first-time setup.

Stop the development servers with Ctrl+C. Stop the database containers separately with `pnpm infra:down`.

## Database initialization

After dependencies and Docker services are ready:

- `pnpm db:generate` generates Prisma Client.
- `pnpm db:validate` validates the Prisma schema.
- `pnpm db:migrate` creates/applies local development migrations.

Do not use the sample credentials or local compose configuration as production credentials.

## Live development

Next.js development servers refresh the relevant browser page when frontend source changes. NestJS runs in watch mode and restarts the API when backend source changes.

## Notes

- The first dependency installation requires internet access and may take several minutes.
- Ports 3000, 3001, 3002, 5432, and 6379 must be available.
- This local workflow is for development and manual acceptance, not production deployment.
