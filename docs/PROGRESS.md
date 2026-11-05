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

### Phone field correction — country selector removed

- [x] Removed the country flag, country-code dropdown, and `KE +254` selector completely from both login and registration.
- [x] Phone number is now one full-width input field.
- [x] User must type the complete international phone number including country prefix (for example the digits for Kenya's +254 number); API receives normalized digits.
- [x] Placeholder now says `请输入含国家区号的手机号码`, without example-number text.
- [x] Remembered account field restores the full phone number as entered; obsolete saved country-code state is no longer used.
- [ ] CI and local Android browser verification remain pending.

### Phone split input and premium technology background

- [x] Replaced the single phone input with two editable fields: country calling code (default `+254`) and local phone number.
- [x] Login and registration submit the concatenated calling code + local number as digits to the existing auth API.
- [x] Login remembers country code and local number separately when remember-account is enabled.
- [x] Replaced the old decorative corner-ribbon background with layered navy gradients, diagonal neon beams, a dotted digital globe/network motif, and a perspective dot-grid floor.
- [x] Kept all form controls as real HTML inputs and buttons; generated concept artwork is not used as a flattened login screenshot.
- [x] Increased mobile card width and form typography for improved Android readability.
- [ ] CI and local Android visual/functional testing remain pending.

### Registration, same-origin API access, and initial workspace

- [x] Changed browser API calls to same-origin `/api/v1` paths and configured the Next.js server rewrite to proxy to the local Nest API at `127.0.0.1:3002`, avoiding direct browser CORS and localhost-address problems.
- [x] Successful registration uses the session cookie returned by the API and redirects directly to `/workspace`; successful login from both login entry points also redirects there.
- [x] Added a responsive authenticated workspace with account summary and editable display name, language, and timezone.
- [x] Extended profile validation and persistence for those editable fields.
- [x] Added `pnpm db:push` to initialize the PostgreSQL schema.
- [ ] Critical local prerequisite: PostgreSQL is not installed or started by the no-Docker startup script. Registration and profile persistence require a native PostgreSQL service, a database, a configured `.env` DATABASE_URL, and one `pnpm db:push` run.
- [ ] CI and end-to-end register/login/profile-save tests are pending.

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


### Module 2.1 — Mobile member home dashboard (implementation started)

- [x] Replaced the authenticated `/workspace` landing page with a mobile-first home dashboard based on the user's two supplied reference screenshots.
- [x] Added authenticated `GET /api/v1/users/dashboard` endpoint.
- [x] Dashboard summary reads wallet ledger entries and outstanding withdrawal requests to calculate withdrawable amounts; no hardcoded earned balance is used.
- [x] Dashboard summary reads approved task reviews for today's settlement count, pending task submissions for review count, today's task claims, and currently published tasks.
- [x] Today's date boundary uses the member's saved timezone, with UTC fallback.
- [x] Added top bar with withdrawable balance, configurable support link (via `NEXT_PUBLIC_SUPPORT_URL`), and Chinese/English/Japanese language selector persisted through the existing profile API.
- [x] Added announcement/safety reminder, referral-code copy action, device permission explanation, task preview, task guide modal, quick links, and five-item bottom navigation.
- [x] Kept the previous profile editor accessible at `/profile`; the new home page is at `/workspace`.
- [x] Where no wallet exists, the UI displays zero rather than inventing an account balance. Published task list is empty until tasks are actually created and published in the admin workflow.
- [x] No floating-window permission is falsely claimed: the browser page explains that web cannot enable Android overlay permission and that users select screenshots themselves.
- [ ] Pull latest changes and verify API compilation, frontend typecheck/lint/build, and dashboard response against the user's local PostgreSQL database.
- [ ] User visual acceptance on Android is pending.
- [ ] Customer support URL is not configured yet; set `NEXT_PUBLIC_SUPPORT_URL` when the official support destination is chosen.
- [ ] Referral reward percentages are intentionally not displayed as fixed values because no approved reward-rate configuration exists yet.


### Android native app — Phase 1 foundation (0.1.0)

- [x] Added a separate `android/` Gradle project using Kotlin 2.0.21, Jetpack Compose, Material 3, Android Gradle Plugin 8.7.3, compile/target SDK 35, and min SDK 26.
- [x] Added native launcher Activity and Android manifest.
- [x] Added green Material 3 theme aligned with the approved member web dashboard palette.
- [x] Added five-tab native navigation shell: Home, Tasks, Promote, Wallet, and Me.
- [x] Added honest placeholder screens for modules not yet integrated; no fabricated wallet/task data is shown.
- [x] Added Android setup instructions in `android/README.md`.
- [x] Added Gradle/Android generated files to `.gitignore`.
- [ ] Android Studio sync, Kotlin compilation, emulator/device launch, and APK build have not yet been run in this environment.
- [ ] Authentication/API connection is intentionally deferred to the next explicitly approved module.
- [ ] Overlay permission and MediaProjection capture are intentionally deferred to their own permission modules; no Android permission is requested in this foundation build.
- [ ] No Gradle wrapper binary is included yet; use Android Studio's Gradle project import/sync or install compatible Gradle locally. Add a verified wrapper in a later build-tooling step.


### Android native app — Phase 2 phone authentication (implementation started)

- [x] Added native phone login and registration UI with editable country calling code (default +1), local phone digits, password, confirmation, and optional referral code.
- [x] Added OkHttp client for the existing API endpoints: `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /api/v1/auth/me`, and `POST /api/v1/auth/logout`.
- [x] Uses the existing API's HttpOnly `wtp_session` cookie through an in-memory CookieJar; no second account store or alternate password system was created.
- [x] Added API base URL BuildConfig setting; Android emulator default is `http://10.0.2.2:3002/api/v1/`. Override with Gradle property `wtpApiBaseUrl` for another environment.
- [x] Added INTERNET permission; cleartext HTTP is enabled only in the debug manifest for local emulator development.
- [x] Added an authenticated app gate and account screen with logout; network calls run off the main thread.
- [ ] Android Gradle sync, Kotlin compilation, emulator UI, and live API integration have not yet been verified after these changes.
- [ ] The current cookie jar is process-memory only. A secure encrypted persistence implementation is still needed before expecting the app to restore sessions after Android kills the process.
- [ ] Local API and PostgreSQL must be running for real login/registration. The emulator reaches the host computer's API through `10.0.2.2:3002`; do not use `localhost` inside the emulator.
- [ ] Phone ownership SMS verification is not implemented in the existing API; this module reuses the current phone/password API without claiming phone verification.
