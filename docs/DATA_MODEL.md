# Logical Data Model

## Identity and referrals

- User: id, email/phone identifier, password hash, status, createdAt
- UserProfile: userId, displayName, locale, timezone
- ReferralEdge: inviteeUserId (unique), inviterUserId, createdAt
- ReferralAncestor: descendantUserId, ancestorUserId, depth (1..3), unique(descendant, depth)

Referral edges are immutable after registration. Ancestor rows are written in the same transaction and protected against cycles.

## Tasks

- Task: id, title, description, category, status, rewardMinor, currency, capacity, claimedCount, startsAt, endsAt, policyVersion
- TaskClaim: id, taskId, userId, status, claimedAt, expiresAt, idempotencyKey
- TaskSubmission: id, claimId, evidenceObjectKey, note, submittedAt, status
- TaskReview: id, submissionId, reviewerAdminId, decision, reason, reviewedAt

## Wallet

- Wallet: id, userId, currency
- LedgerEntry: id, walletId, sourceType, sourceId, direction, amountMinor, currency, idempotencyKey, createdAt
- WithdrawalRequest: id, walletId, amountMinor, currency, status, reviewedBy, payoutReference

Ledger entries are append-only. Balances are derived or maintained as transactionally updated projections reconciled against the ledger.

## Administration and audit

- AdminUser, Role, Permission, AdminUserRole, RolePermission
- AuditEvent: actorType, actorId, action, targetType, targetId, metadata, createdAt

## Important constraints

- Use UUID identifiers.
- Store money as integer minor units and currency codes.
- Unique user identity and referral invitee.
- Unique claim idempotency key.
- Unique reward source/beneficiary pair.
- All timestamps in UTC.
- Add indexes for user status/createdAt, task status/start/end, claim user/status, submission status/submittedAt, ledger wallet/createdAt, referral ancestor/depth.
