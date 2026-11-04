# Development Plan and Acceptance Gates

## Phase 0 — Repository foundation
- Monorepo and package conventions
- CI checks and environment templates
- Architecture and product specification

Acceptance: clean install, lint, typecheck, build, and local infrastructure health checks.

## Phase 1 — Identity and referral foundation
- Registration/login/logout/refresh
- Secure password hashing and session rotation
- User profile and account status
- Immutable inviter link, three-level ancestor materialization
- Admin identity, roles, and permissions

Acceptance: registration/login flows work; referral tree is correct at depths 1, 2, and 3; cycle/self-referral/imposter inviter changes rejected; admin endpoints enforce permissions.

## Phase 2 — Task lifecycle
- Admin task CRUD and publication
- User task listing and eligibility
- Atomic capacity-safe claim
- Submission metadata and private evidence upload
- Review queue and decision history

Acceptance: concurrent claim test never exceeds capacity; all lifecycle transitions audited; evidence access is authorized.

## Phase 3 — Wallet and rewards
- Append-only ledger
- Atomic task reward posting
- Configurable referral reward rules, max depth 3
- Withdrawal reservation, review, payout tracking, reversal

Acceptance: idempotent processing; no duplicate credits; ledger reconciliation; concurrent withdrawal protection.

## Phase 4 — Operations and risk
- Dashboards, reports, notifications
- Rate limits, duplicate evidence signals, abuse review
- Backup/restore runbook and monitoring

Acceptance: operational audit trail, alerting, documented restore drill.

## Phase 5 — Release readiness
- Responsive UI and accessibility review
- Security review and dependency scan
- Load tests at agreed concurrency profile
- Production configuration and staged deployment

Acceptance: do not claim support for 100,000 active concurrent users without measured load-test evidence.
