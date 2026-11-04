# Architecture

## Initial deployment shape

Start as a modular monolith with clear domain boundaries. This keeps the initial build and operations manageable while allowing high-load modules to be extracted later.

- Web: Next.js user application on port 3000
- Admin: Next.js administration application on port 3001
- API: NestJS application on port 3002 with global prefix /api/v1
- Database: PostgreSQL
- Cache and queues: Redis + BullMQ
- Evidence storage: private S3-compatible object storage with short-lived signed URLs

## Backend modules

1. Identity: users, sessions, credentials, verification
2. Access: admin users, roles, permissions
3. Profiles: user data and status
4. Referrals: immutable inviter relation and up to three ancestor levels
5. Tasks: templates, publication, capacity, eligibility
6. Claims: atomic claim/reservation and expiry
7. Submissions: evidence metadata and storage references
8. Reviews: review queue, decision, reason, audit
9. Wallet: balances and append-only ledger
10. Rewards: task and referral reward calculation
11. Withdrawals: reservation, approval, payout tracking
12. Notifications: in-app and email/SMS adapters as later integrations
13. Risk: rate limits, abuse flags, duplicate submission signals
14. Audit: append-only administrative and financial audit events

## Consistency requirements

- PostgreSQL is the source of truth.
- Use database transactions for claim capacity, approval + ledger posting, referral reward posting, and withdrawal reservation.
- Enforce uniqueness in the database for idempotency keys and one reward per eligible source event and beneficiary.
- Use row-level locking or conditional atomic updates for limited task capacity.
- Queue messages are delivered at least once; consumers must be idempotent.
- Do not rely on Redis for authoritative balances or task capacity.

## Scale and reliability

100,000 registered users is a design target. Validate real concurrency with load tests before production claims. Use pagination, indexed query paths, connection pooling, queue back-pressure, observability, database backups, restore drills, and horizontal stateless API scaling.

## Security

- Hash passwords with Argon2id.
- Short-lived access tokens and rotating refresh sessions.
- Secure, HttpOnly, SameSite cookies for browser sessions.
- CSRF protection where cookie-authenticated state changes require it.
- Strict DTO validation, output encoding, rate limiting, and security headers.
- Private evidence objects; authorize every read and use expiring signed URLs.
- Secrets never enter Git.
- Separate admin authentication and granular permissions.
