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

### Premium login visual direction — approved by user

- [x] Replaced the split login/showcase layout with one centered glass-effect login card.
- [x] Applied a deep navy/indigo background with luminous blue/cyan flowing ribbon effects.
- [x] Kept the account brand, large Chinese welcome/title, phone and password fields, remember option, centered login action, and create-account action inside the same card.
- [x] Removed the lower product showcase section entirely from the login homepage.
- [x] Preserved the existing login API call, phone-number validation, password visibility toggle, and remembered-phone behavior.
- [x] Added responsive mobile sizing and safe-area spacing.
- [ ] Run latest CI and verify on the user's Android browser; visual/browser acceptance is still pending.

### Mobile background arc visibility adjustment

- [x] Repositioned the two decorative luminous arcs to fit within the mobile viewport rather than being cropped off-screen.
- [x] Simplified the mobile ribbon glow so it frames the login card without competing with the form.
- [x] Kept desktop aurora styling unchanged.
- [ ] Verify on the user's Android browser at common narrow viewport widths; visual acceptance is pending.

### Login and registration visual unification

- [x] Registration and `/login` now use the same aurora background, diagonal neon corner ribbons, glass card, brand lockup, typography, field styling, primary action, secondary account-switch action, and security footer as the homepage login.
- [x] Kept the Kenya `+254` country prefix visible in the phone field and retained the country selector.
- [x] Login and registration accept a complete international number typed into the phone field (for example `+25412345678`) and normalize the typed country prefix at submission without stripping it while the user is typing.
- [x] Fixed remembered phone restoration so the stored country prefix is correctly separated from the local number.
- [x] Added show/hide controls for both registration password fields.
- [x] Adjusted the upper-left and lower-right neon ribbons to use broad diagonal curved shapes inspired by the supplied reference.
- [ ] CI build and visual acceptance on actual Android browser remain pending.
- [ ] Password recovery remains a support-guidance notice, not a complete self-service reset flow.

### Follow-up: preserve typed country prefix while entering the number

- [x] The phone input no longer strips a leading `+` or country digits during typing.
- [x] Users can type the full international number directly, such as `+25412345678`, while the `+254` selector remains visible.
- [x] Submission detects an entered international prefix to avoid duplicating the selected country code.
- [ ] CI and browser testing are pending.

### Curved ribbon and phone placeholder correction

- [x] Replaced the diagonal gradient-bar approximation with SVG Bézier curves for the upper-left and lower-right flowing light ribbons on both login and registration screens.
- [x] Kept the selected country prefix control (Kenya `KE +254`) visible in the phone input.
- [x] Simplified the phone placeholder to exactly `区号 + 手机号码`; removed example phone numbers from the registration helper text too.
- [x] Homepage phone input now preserves a typed leading plus sign and uses the same international-number normalization as registration.
- [ ] Latest CI build and actual Android screenshot comparison remain pending.

### Reference comparison correction

- [x] Confirmed the supplied current mobile screenshot's ribbons did not match the reference: the prior output looked like parallel sine-wave bands.
- [x] Replaced both login and registration SVG ribbon paths with broad, asymmetrical Bézier corner sweeps: upper-left ribbon rises toward the top edge; lower-right ribbon curls in from the right and sweeps toward the bottom edge.
- [x] Kept the country selector control visible, including `KE +254`; it must not be removed.
- [x] Phone placeholder remains `区号 + 手机号码` without an example number.
- [ ] Need compare the refreshed Android screenshot against the supplied reference; CI and visual acceptance are pending.

### Mobile login visual refinement

- [x] Retained the country selector; `KE +254` stays visible and selectable in the phone input. It is not to be removed.
- [x] Reworked the decorative art into two restrained, opposite-corner aurora sweeps with limited dimensions instead of large diagonal waves.
- [x] Removed the oversized decorative ellipse outlines that competed with the card.
- [x] Kept the card, typography, input fields, remember checkbox, login action, and create-account action unchanged.
- [ ] Awaiting user Android screenshot review and CI completion.

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

### Login homepage — exact supplied mobile reference implementation

- [x] Reworked the single centered glass card to match the supplied 401 × 534 portrait reference proportions.
- [x] Matched the compact brand row, centered two-line Chinese heading, helper copy, phone/password field styling, remember row, primary CTA, secondary create-account CTA, and security note.
- [x] Added Kenya (+254) as the default calling code and an interactive country-code selector.
- [x] Added the forgot-password interaction notice; full password-reset workflow is not implemented yet.
- [x] Kept phone remembering in local storage; password is not stored as plaintext by the app and remains eligible for the browser's own password manager.
- [x] Adjusted the upper-left and lower-right luminous diagonal background arcs to frame the card.
- [ ] Run CI and verify at real Android viewport sizes; visual acceptance remains pending.
