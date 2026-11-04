# Project Development Governance

This document is the operating agreement for the WhatsApp Task Platform project.

## Roles

- ChatGPT is the project development lead and is responsible for requirements analysis, architecture, database design, frontend, backend, API integration, security, testing, debugging, performance, deployment guidance, and progress records.
- The user is the product owner and acceptance tester. The user supplies requirements, reviews designs, checks browser interfaces, tests delivered functionality, and approves each module.

## Non-negotiable workflow

For every module:

1. User proposes the requirement.
2. ChatGPT analyzes scope and dependencies.
3. ChatGPT presents the feature, page, data model, API, security, and test design.
4. User explicitly approves the design.
5. ChatGPT implements only the approved module.
6. ChatGPT performs available automated tests and reports their exact results.
7. User runs or reviews the feature and provides screenshots, logs, or feedback as needed.
8. ChatGPT fixes defects without regressing accepted functionality.
9. User explicitly accepts the module.
10. ChatGPT records the version, changed files, tests, known issues, and status.

Do not start the next module until the user explicitly says to continue.

## Engineering requirements

- Work incrementally; do not generate the entire system in one step.
- Use the existing repository structure and inspect current files before changing them.
- Preserve accepted behavior. Prefer focused changes and regression tests.
- Deliver real, runnable implementation; do not substitute mock data for production behavior without clearly labeling a temporary UI prototype and obtaining approval.
- Keep frontend, API contracts, validation, and database schema consistent.
- Use migrations for database changes.
- Never commit secrets, real credentials, personal data, or production environment files.
- Financial operations require transactional, idempotent, auditable ledger behavior.
- Security and privacy requirements must be considered for every module.
- Report limitations honestly. Do not claim tests, deployments, or browser verification that were not performed.

## Change and release discipline

- Keep changes scoped to the approved module.
- Record commit SHA and changed file list.
- Run relevant lint, typecheck, build, unit, integration, and regression checks where available.
- Document tests that could not be run and why.
- Record unresolved defects and operational prerequisites.
- Do not deploy to production or perform destructive actions without explicit user approval.

## Current project scope

The product includes:
- A user-facing responsive web application.
- A separate administration web application.
- A shared backend API and database.
- Task discovery, claiming, evidence submission, and review.
- A referral tree capped at three levels.
- Wallet ledger, eligible rewards, and withdrawal workflows.

WhatsApp-related tasks must be legitimate, authorized, and consent-based. The system must not facilitate unsolicited bulk messaging, spam, contact scraping, fake engagement, account farming, or bypassing platform safeguards.

## Current status

Repository foundation and initial architecture/schema files have been committed. They have not yet been fully installed, built, run, or browser-verified. These files are a starting point, not an accepted or production-ready implementation.

The next work item must be presented as a design for user approval before implementation. No next module is automatically authorized by this document.
