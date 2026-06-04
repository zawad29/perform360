# Authentication Process

## Overview

The application has **two separate authentication systems**:

| System | For | Method |
|--------|-----|--------|
| **Dashboard Auth** | ADMIN/HR users | Magic link (NextAuth v5 EmailProvider) |
| **Evaluation Auth** | EMPLOYEE/EXTERNAL reviewers | OTP (6-digit code) |

---

## 1. Dashboard Auth (Magic Link)

### Flow

```
User enters email on /login
  → POST /api/auth/verify-and-signin
    → Rate limit check (5 requests / 15 min per IP)
    → Zod email validation
    → Pre-check: look up app User by email
      ├─ Not found       → 404 "No account found with this email."
      ├─ Archived        → 403 "This account has been deactivated."
      ├─ Not ADMIN/HR    → 403 "Access denied. Only admins and HR."
      └─ Valid           → proceed to send magic link
    → signIn("nodemailer", { email, redirect: false })
      → NextAuth generates token, stores in VerificationToken table
      → sendVerificationRequest fires:
        → getMagicLinkEmail(url) generates HTML email
        → sendEmail() sends via configured provider
    → Returns { success: true }

User redirected to /verify ("check your email")

User clicks magic link in email
  → GET /api/auth/callback/nodemailer?token=xxx&email=xxx
    → NextAuth verifies token against VerificationToken table
    → Token consumed / deleted
    → AuthUser.emailVerified set
    → Account created (if new)
    → Database Session created
    → signIn callback fires (redundant guard):
      → Looks up app User by email
      → Checks: exists, not archived, role in [ADMIN, HR]
      → If not found: AccessDenied
    → Session cookie set
    → Redirected to /overview
```

### Token Expiry

| Token | Expiry | Source |
|-------|--------|--------|
| Magic link | **5 minutes** | `src/lib/auth.ts:58` (`maxAge: 5 * 60`) |

### Role Restriction (`signIn` Callback)

Found in `src/lib/auth.ts`. The callback runs after NextAuth verifies the magic link token but before granting access. It queries the app `User` model:

```ts
signIn({ user, account }) {
  // Looks up User by email
  // Denies access if:
  //   - User not found
  //   - User.archivedAt is set
  //   - User.role is not ADMIN or HR
}
```

Only `ADMIN` and `HR` roles can log into the dashboard. `EMPLOYEE` and `EXTERNAL` users get `AccessDenied`.

### Pre-Send Guard (`verify-and-signin` Route)

Before sending the magic link email, the `POST /api/auth/verify-and-signin` route runs a database lookup to avoid sending emails that will fail. Three distinct cases:

| Condition | HTTP Status | Response |
|-----------|-------------|----------|
| No app `User` with this email | 404 | `"No account found with this email."` |
| User is archived (`archivedAt` set) | 403 | `"This account has been deactivated."` |
| User exists but role is not ADMIN or HR | 403 | `"Access denied. Only administrators and HR can access the dashboard."` |
| All checks pass | 200 | Magic link email sent |

The `signIn` callback in `auth.ts` retains the same role check as a redundant server-side guard.

### First-User Onboarding

On a fresh database (no `Company` record), visiting `/` redirects to `/onboarding`. The onboarding form creates:

1. The `Company` (with placeholder encryption values)
2. Default evaluation templates
3. An `AuthUser` record (for NextAuth)
4. An app `User` with `role: ADMIN`

After onboarding, the admin signs in via `/login`, then sets up encryption keys at `/setup-encryption` (passphrase + recovery codes).

---

## 2. Evaluation Reviewer Auth (OTP)

### Flow

```
Reviewer receives email with evaluation link (contains assignmentToken)
  → Opens evaluation page
  → Enters email to request OTP
  → POST request to OTP endpoint

Server side:
  → generateOTP() → 6-digit code from crypto.randomBytes
  → hashOTP(otp) → bcrypt with 10 rounds
  → Stores otpHash + expiry in OtpSession table
  → Sends OTP via email (getOTPEmail template)

Reviewer enters OTP
  → verifyOTP(otp, otpHash) → bcrypt.compare
  → If valid:
    → OtpSession.verifiedAt set
    → sessionToken generated
    → 4-hour session established
  → If invalid:
    → attempts incremented
    → After 3 failed attempts: 15-minute cooldown
```

### Configuration

| Setting | Value | Source |
|---------|-------|--------|
| OTP expiry | **10 minutes** | `src/lib/constants.ts` |
| Session duration (post-verify) | **4 hours** | `src/lib/constants.ts` |
| Summary session duration | **4 hours** | `src/lib/constants.ts` |
| Max attempts | **3** | `src/lib/constants.ts` |
| Cooldown after max attempts | **15 minutes** | `src/lib/constants.ts` |
| Rate limit per email | **5 requests / hour** | `src/lib/constants.ts` |

### Session Validation

`validateEvaluationSession()` in `src/lib/session-validation.ts` validates OTP sessions for subsequent requests. One OTP verification grants access to all assignments linked to that reviewer's email.

---

## 3. Two-User Model

### Models

| Model | Table | Key Field | Purpose |
|-------|-------|-----------|---------|
| `AuthUser` | `auth_users` | `email` (`@unique`) | NextAuth identity — accounts, sessions |
| `User` | `users` | `@@unique([email, companyId])` | App business logic — role, company, teams |

### Relationship

```
AuthUser (1) ──??── (0..1) User
```

`User.authUserId` is a foreign key referencing `AuthUser.id`. Not every `AuthUser` has a corresponding app `User`, and the join is done via email lookup in the `signIn` callback.

### PrismaAdapter Proxy

In `src/lib/auth.ts:24`, the `PrismaAdapter` is wrapped in a **JavaScript Proxy** that redirects `adapterPrisma.user` calls to `adapterPrisma.authUser`. This is necessary because NextAuth expects the `User` model to have a unique email field, but the app's `User` model uses a composite unique constraint (`[email, companyId]`). The `AuthUser` model satisfies NextAuth's expectations instead.

---

## 4. Token & Session Management

### Token Generation (`src/lib/tokens.ts`)

```ts
generateToken() → 64-char hex string (256 bits of entropy)
generateOTP(length = 6) → numeric OTP from crypto.randomBytes
```

### OTP Hashing (`src/lib/otp.ts`)

```ts
hashOTP(otp) → bcrypt.hash with 10 rounds
verifyOTP(otp, hash) → bcrypt.compare
```

### Session Types

| Session Type | Storage | Expiry | Purpose |
|-------------|---------|--------|---------|
| **NextAuth DB session** | `Session` table (Prisma) | Set by NextAuth defaults | Dashboard login |
| **OTP session** | `OtpSession` table | 4 hours post-verify | Evaluation access |
| **Encryption session** | `_enc_dk` cookie | 4 hours | Store data key for evaluation submission |

### Encryption Session (`src/lib/encryption-session.ts`)

A separate cookie-based session storing the company's data key encrypted with `NEXTAUTH_SECRET`. Used by the evaluation submission API to encrypt response data without requiring the user's passphrase.

---

## 5. Route Protection

There is **no Next.js Edge middleware**. Protection is applied at the API route handler level using higher-order functions.

### Auth Helpers (`src/lib/api-auth.ts`)

| Function | Behavior |
|----------|----------|
| `requireAuth()` | Returns 401 if unauthenticated |
| `requireRole(...roles)` | Returns 403 if wrong role |
| `requireAdminOrHR()` | Convenience for ADMIN/HR check |
| `isAuthError(result)` | Type guard for auth results |

### RBAC Wrappers (`src/lib/middleware/rbac.ts`)

```ts
withRBAC(handler, { requiredRoles })
withAdminOrHR(handler)
withAdmin(handler)
```

Usage:
```ts
export const GET = withAdminOrHR(async (request, { params, auth }) => {
  // auth.userId, auth.email, auth.role, auth.companyId available
});
```

### Company Scope (`src/lib/middleware/company-scope.ts`)

```ts
withCompanyScope(handler, { resourceModel, resourceParamKey })
```

Verifies the authenticated user's company owns the requested resource (evaluation cycle, team, template). Returns 404 if not found.

### Auth Layout

The `(auth)` layout group (`src/app/(auth)/layout.tsx`) uses server-side `auth()` to check for existing sessions and redirects to `/overview` if already authenticated.

---

## 6. Email System

### Architecture (`src/lib/email/`)

```
src/lib/email/
  index.ts       — Public API (sendEmail, sendEmailWithAttachments)
  types.ts       — SendEmailOptions, EmailProvider interface
  templates.ts   — HTML + text template builders
  factory.ts     — Provider factory (singleton, selected by EMAIL_PROVIDER env var)
  providers/
    console.ts   — Logs to console (development default)
    resend.ts    — Resend API
    brevo.ts     — Brevo (Sendinblue) API
    smtp.ts      — Nodemailer SMTP
```

### Provider Selection

`EMAIL_PROVIDER` env var: `console` | `resend` | `brevo` | `smtp`. Defaults to `console`.

### Key Observation: `sendVerificationRequest`

In `src/lib/auth.ts`, NextAuth's `EmailProvider` has placeholder `server` config (`host: ""`, `port: 0`). The real email sending happens in the custom `sendVerificationRequest` function, which calls the app's own `sendEmail()` abstraction rather than NextAuth's nodemailer transport.

### Email Templates (`src/lib/email/templates.ts`)

| Template | Use |
|----------|-----|
| `getMagicLinkEmail(url)` | Dashboard magic link sign-in |
| `getOTPEmail(otp, name)` | Evaluation OTP verification |
| `getEvaluationInviteEmail(...)` | Single evaluation invitation |
| `getEvaluationReminderEmail(...)` | Evaluation reminder |
| `getSummaryInviteEmail(...)` | Summary evaluation invite |
| `getSummaryReminderEmail(...)` | Summary evaluation reminder |
| `getDataExportEmail(...)` | Data export notification |
| `getUserInviteEmail(...)` | New user welcome |
| `getCycleCompletionEmail(...)` | Cycle 100% completion |
| `getReportsExportEmail(...)` | PDF reports export |
| `getReportsExportExcelEmail(...)` | Excel scores export |

### Background Queue

Email sending can be deferred via the PostgreSQL job queue (`src/lib/queue.ts`):
- Job type: `"email.send"` with `EmailSendPayload` (`to`, `subject`, `html`, `text`)
- Handler: `src/lib/jobs/email.ts`

---

## 7. Key Source Files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth config, callbacks, EmailProvider, PrismaAdapter Proxy |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth catch-all route handler |
| `src/app/api/auth/verify-and-signin/route.ts` | Custom login endpoint with rate limiting |
| `src/lib/tokens.ts` | Token/OTP generation utilities |
| `src/lib/otp.ts` | OTP hashing and verification |
| `src/lib/constants.ts` | OTP config (expiry, max attempts, cooldown) |
| `src/lib/api-auth.ts` | Auth helpers (requireAuth, requireRole) |
| `src/lib/middleware/rbac.ts` | Route RBAC wrappers |
| `src/lib/middleware/company-scope.ts` | Company scoping wrapper |
| `src/lib/session-validation.ts` | OTP session validation |
| `src/lib/encryption-session.ts` | Encryption cookie session management |
| `src/lib/rate-limit.ts` | In-memory rate limiter |
| `src/lib/email/` | Email abstraction layer |
| `src/lib/prisma.ts` | Prisma client singleton |
| `prisma/schema.prisma` | Database schema (AuthUser, User, Session, etc.) |
| `src/components/session-provider.tsx` | Client-side SessionProvider wrapper |
| `src/app/(auth)/layout.tsx` | Auth layout with session check |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/app/(auth)/verify/page.tsx` | "Check your email" page |
