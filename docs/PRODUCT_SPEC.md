# Product Specification

## Product

A task marketplace focused initially on authorized WhatsApp-related operational tasks, with a responsive browser user portal and a separate administration console. The platform target is 100,000 registered users; this is a capacity objective, not a claim of tested capacity.

## User portal

- Account registration, sign-in, sign-out, and account recovery
- Profile and account status
- Available task catalog with category, instructions, reward, capacity, and deadline
- Claim task with eligibility checks and capacity-safe concurrency control
- Task workspace and authorized execution instructions
- Evidence submission (images/files where appropriate)
- Submission history and review status
- Wallet balance and transaction history
- Withdrawal request and status
- Referral link, direct invitees, second-level and third-level overview
- Notifications and support

## Task lifecycle

Draft -> Published -> Paused/Closed

Claim lifecycle:
Claimed -> In Progress -> Submitted -> Under Review -> Approved or Rejected

A rejected task may be resubmitted only when the task policy explicitly permits it. Claims expire according to configured deadlines. All transitions are audited.

## Referral model

- A user may have one immutable direct inviter, assigned at registration.
- Referral depth is exactly capped at three levels for reporting/reward eligibility.
- The system records the referral edge and derived ancestors transactionally.
- No self-referrals, cycles, inviter changes, or duplicate reward issuance.
- Rewards are optional, configurable, and calculated only from verified eligible task activity.
- No rewards for deposits, paid enrollment, or recruitment alone.
- Admin changes to reward rules are versioned and audited.

## Wallet and withdrawals

- Integer minor units only; never use floating-point for money.
- Append-only ledger entries with unique idempotency keys.
- Separate available, pending, and held amounts.
- Task reward posting is atomic with task approval.
- Withdrawal request reserves funds atomically; payout completion is recorded separately.
- Reversals use compensating entries, never silent mutation or deletion.

## Administration

- Overview and operational metrics
- User search, profile, account status, referral tree
- Task creation, editing, publication, pause, capacity limits
- Task claim and submission review queue
- Review decision with reason and audit record
- Reward policy configuration and versioning
- Wallet ledger inspection and withdrawal processing
- Risk flags, duplicate evidence checks, admin audit log
- Role-based access control and permission checks

## Safety and platform policy

Only legitimate and consent-based WhatsApp-related work is in scope, such as handling opted-in customer inquiries, authorized customer support, or merchant-approved content review. Do not implement unsolicited bulk messaging, contact scraping, spam automation, evasion of platform controls, fake engagement, or account farming. Integrations must use approved interfaces and respect applicable WhatsApp terms and privacy laws.
