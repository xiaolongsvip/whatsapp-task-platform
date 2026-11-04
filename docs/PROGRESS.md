# Project Progress Register

Last updated: 2026-11-04

## Governance

- [x] User's project development and acceptance rules recorded in `docs/PROJECT_RULES.md`.
- [x] Private GitHub repository confirmed: `xiaolongsvip/whatsapp-task-platform`.
- [x] Changes are developed module by module; user remains the acceptance tester.

## Module 0 — Foundation and local startup

- [x] Monorepo foundation and initial Next.js/NestJS apps committed.
- [x] Windows startup helper runs web, admin, and API without requiring Docker Desktop.
- [x] User confirmed the three development processes reached Ready / successful startup in the local CMD window.
- [ ] Latest lockfile and generated Next.js type-file CI validation still needs final confirmation.
- [ ] PostgreSQL/Redis and database integration are not configured in the user's no-Docker local environment.

## Module 1.1 — Phone registration and login

**Status: implementation started; automated validation and user acceptance pending.**

### Confirmed requirements

- Phone number is the only user login/registration identifier; email login is not included.
- International phone number input, example: `25412345678`; API normalizes separators and stores digits.
- Password accepts letters and numbers (no numeric-only restriction), minimum 6 and maximum 128 characters.
- Registration includes password confirmation and optional referral code.
- Login uses phone number and password.
- User pages must be mobile-first and responsive from the first implementation.

### Implemented files

- `apps/web/src/app/globals.css` — mobile-first responsive auth styling.
- `apps/web/src/components/auth-form.tsx` — registration/login form, validation and API requests.
- `apps/web/src/app/register/page.tsx` — registration route.
- `apps/web/src/app/login/page.tsx` — login route.
- `apps/web/src/app/page.tsx` — login/register entry.
- `apps/web/src/app/layout.tsx` — global styles and mobile viewport.
- `packages/database/prisma/schema.prisma` — phone-only user identity, referral code, auth session model.
- `packages/database/src/index.ts` — shared Prisma client export.
- `packages/database/package.json` — workspace package entry.
- `apps/api/package.json` — Argon2, database workspace and throttler dependencies.
- `apps/api/src/auth/auth.dto.ts` — registration/login validation.
- `apps/api/src/auth/auth.service.ts` — registration, login, referral ancestor creation, hashed refresh-session storage, session rotation, logout, profile update.
- `apps/api/src/auth/auth.controller.ts` and `auth.module.ts` — auth endpoints and HttpOnly session cookie.
- `apps/api/src/users/*` — authenticated current-user and profile update endpoints.
- `apps/api/src/app.module.ts` — auth/users modules and request throttling.

### Latest user-facing entry-screen revision

- [x] Root route `/` now opens the account entry screen directly.
- [x] Desktop layout places phone/password login on the left and new-account registration on the right.
- [x] Registration includes phone, password, confirmation, and optional referral code.
- [x] Both forms call the existing API endpoints and display inline success/error feedback.
- [x] Mobile layout stacks login first and registration second; form controls and typography remain touch-friendly and readable.
- [ ] Latest CI build and browser/device visual acceptance pending.
- [ ] The authenticated user dashboard is not implemented yet; successful login currently displays an explicit in-progress notice rather than navigating to a nonexistent dashboard.

### Latest homepage login-card redesign

- [x] Root homepage is a single rounded card, not two separate cards.
- [x] Left side contains phone/password login, remember-account option, login button, and create-account link directly below it.
- [x] Right side contains a custom CSS phone/task illustration and three platform feature highlights.
- [x] Desktop uses a two-column card; mobile stacks the login form first and feature panel second.
- [x] Password input uses browser `autocomplete="current-password"`; the app stores only the remembered phone number and never stores a plaintext password.
- [ ] Latest CI build and desktop/mobile browser visual acceptance pending.
- [ ] User dashboard is not yet implemented; successful login currently shows an explicit in-progress notice.

### Login action alignment refinement

- [x] Centered the primary login action and reduced its width instead of stretching it edge-to-edge.
- [x] Added a second matching create-account action below it, using a lighter contrasting blue treatment and the exact prompt “还没有账户？创建新账户”.
- [x] Kept the create-account action linked to the existing `/register` route.
- [x] Added mobile horizontal-overflow containment for the login page.
- [ ] CI and refreshed browser screenshots still need verification.

### API routes implemented

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`

### Security and known limitations

- Passwords are hashed with Argon2id.
- Session tokens are random opaque values; only SHA-256 hashes are stored.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Registration and login have endpoint throttling; the current in-process throttler is not yet backed by Redis for multi-instance production.
- Phone ownership is not SMS-verified yet. Production launch requires selecting and integrating an SMS verification provider before treating phone numbers as verified.
- PostgreSQL is required for actual registration/login persistence. It is not currently running in the user's Docker-free local setup.
- Database migration, frontend/API integration, build, lint, and browser/mobile tests have not yet been confirmed.

## Local development target

- User web: `http://localhost:3000`
- Admin web: `http://localhost:3001`
- API health: `http://localhost:3002/api/v1/health`
- Start by double-clicking `start-local.cmd`; Docker Desktop is not required for frontend/API process startup.

## Next acceptance steps

1. Wait for latest GitHub Actions validation and fix any errors.
2. Pull the updated repository and install changed workspace dependencies.
3. Configure a native/local PostgreSQL service without requiring Docker.
4. Run Prisma migration and generate the client.
5. Test registration, duplicate phone rejection, login, refresh rotation, logout, referral code, and profile endpoints.
6. User reviews registration/login pages on mobile browser and desktop browser.
7. User explicitly accepts Module 1.1 before moving to the next module.
