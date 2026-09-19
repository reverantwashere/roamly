# Roamly email verification

Roamly verifies a new password account by sending a six-digit code to its email address. The browser receives a restricted verification cookie; the account does not receive an authenticated session until the code is accepted. Converting a guest account keeps its saved work but revokes the guest session while verification is pending. Google and Apple accounts use a provider-verified email claim when one is available.

Email is also available as the second step after a primary sign-in. Authenticator apps and recovery codes remain separate security options. Phone verification is deferred: a phone number is not required for signup and no SMS is sent.

## Development

Without email provider credentials, a non-production server writes messages to `.data/mail-outbox/*.json`. Each JSON file includes its recipient, purpose, and code. This directory is ignored by Git. It is created with owner-only permissions, and each message is written with `0600` permissions. The browser clearly labels this mode as a development file; it never receives the code in an API response.

Read the newest message for the address you are testing and enter its `code` in Roamly. No real email is sent in this mode. Remove local outbox files when they are no longer needed.

## Send real email

1. Create a Resend account, add a sending domain, and complete its DNS verification. Use a domain you control, even if the application itself is hosted at a `workers.dev` address. See [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
2. Create a Resend API key with sending access.
3. Configure the server with `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, for example `Roamly <security@your-domain.example>`. Keep the key in server secrets, outside Git and the Vite client environment.
4. Configure `APP_ORIGIN` with the public HTTPS origin and `AUTH_ENCRYPTION_KEY` as described in the authentication setup. The encryption key must stay stable across restarts; it also protects stored email-code digests.

The server calls [Resend's Send Email API](https://resend.com/docs/api-reference/emails/send-email) with plain-text transactional messages. A server-generated idempotency key accompanies each send. Provider failures return a safe error and invalidate the undelivered code; the user can request another code after the resend cooldown. Provider responses and codes are never returned to the browser or logged.

Production disables the development outbox. If either email setting is missing, password signup is unavailable before an account is created, and email-code actions return `503`. `/api/auth/options` reports email delivery readiness so the UI can explain this state. Credentials being configured means sending is enabled; a successful API call does not prove inbox delivery.

This repository still uses a Node/Express server and local SQLite. A Workers deployment needs the separately planned runtime and D1 migration; these settings alone do not deploy the backend.

## Code lifecycle

- Codes expire after ten minutes, can be used only once, and are bound to an account, purpose, and browser challenge. Codes from signup cannot be reused for two-step verification.
- The database stores a keyed HMAC of each code, never a plaintext code or a standalone six-digit hash. The key is held separately from the database.
- Each challenge allows five incorrect attempts. A persistent per-account/per-purpose counter allows ten incorrect attempts in fifteen minutes, including across resends. Resends require a one-minute wait and are limited to five per hour.
- Request bodies cannot select a different recipient during verification or resend. The server uses the account established by the primary sign-in proof.
- Changing or deleting an email delivery configuration does not silently bypass verification. Existing accounts with unverified emails must complete verification at their next primary sign-in.

Email codes protect against someone who has only the account password. A passkey or authenticator is a stronger option when the user's email account may also be compromised. Roamly never asks for a phone number to complete this email flow.
