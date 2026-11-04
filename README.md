# WhatsApp Task Platform

A responsive task marketplace with a user portal, administration console, task review workflow, and a capped three-level referral program.

## Monorepo layout

- `apps/web` — user-facing responsive web application (port 3000)
- `apps/admin` — administration console (port 3001)
- `apps/api` — NestJS API (port 3002, API prefix `/api/v1`)
- `packages/database` — Prisma schema and database tooling
- `packages/shared` — shared DTOs and types
- `docs/` — product, architecture, security, and operations documentation

## Planned stack

- Next.js + React + TypeScript for both web applications
- NestJS for the API
- PostgreSQL as the source of truth
- Prisma ORM
- Redis + BullMQ for asynchronous jobs
- S3-compatible object storage for evidence files
- Docker Compose for local infrastructure

## Product principles

1. Tasks must represent legitimate, authorized work. No unsolicited bulk messaging, spam, contact scraping, or bypassing WhatsApp safeguards.
2. Referral depth is capped at three levels. Rewards are configurable and based on verified eligible activity, not recruitment fees or deposits.
3. Wallet changes are recorded in an auditable, append-only ledger.
4. Task claims, review decisions, and reward issuance must be transactional and idempotent.
5. Production deployment requires secrets management, backups, monitoring, rate limits, and security review.

## Status

Repository bootstrap and product/architecture specifications. Application implementation follows in staged commits.
