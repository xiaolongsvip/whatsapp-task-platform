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
- Git (Git for Windows or GitHub Desktop)
- Docker Desktop with the WSL 2 backend enabled

PostgreSQL and Redis run in Docker Compose. The web applications and API run directly on Windows so file watching and browser debugging remain straightforward.

## First-time setup

1. Clone this private repository to the local computer.
2. Open a terminal in the repository root.
3. Copy `.env.example` to `.env`. The example values are for local development only.
4. Install dependencies with `pnpm install`.
5. Start Docker Desktop and wait until it reports that the engine is running.
6. Start the full stack with `pnpm dev:local`.

The command starts PostgreSQL and Redis, then launches the user web, admin web, and API in parallel. Stop all development processes with Ctrl+C. Stop the database containers separately with `pnpm infra:down`.

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
