# Roamly email verification

Roamly verifies a new password account by sending a verification code to its email address. Email delivery and verification use Supabase in the hosted Cloudflare build and the local Node server in development. The two implementations have separate configuration and code lifecycles.

## Hosted Supabase email

For the hosted Supabase and Cloudflare build, set the **Confirm sign up** template subject to `Your Roamly verification code` and paste [`supabase/templates/confirm-signup.html`](../supabase/templates/confirm-signup.html) into the Supabase template source editor. The template uses `{{ .Token }}` so the app can verify the code instead of requiring a confirmation link. Supabase controls the email OTP length, and Roamly accepts its supported range of 6–10 digits, including eight-digit codes. The email and signup dialog deliberately say “verification code” so their instructions remain correct when that setting changes. Updating the template file in Git does not update Supabase; paste and save the updated HTML in its dashboard.

Keep email confirmation enabled. Supabase issues the authenticated session after the code is accepted and manages code expiry, resend limits, and verification attempts. Configure custom SMTP before a public beta; Supabase's default sender is limited to testing with authorized team addresses.

Set the **Reset password** template subject to `Reset your Roamly password` and paste [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) into its source editor. The recovery template uses `{{ .ConfirmationURL }}`. After the user follows that link, Roamly handles Supabase's `PASSWORD_RECOVERY` event, opens the new-password form, updates the password, and signs out the temporary recovery session.

Phone verification is deferred: a phone number is optional profile information and no SMS is sent.

## Local server email

The local Node server uses six-digit email codes. The browser receives a restricted verification cookie; the account does not receive an authenticated session until the code is accepted. Converting a guest account keeps its saved work but revokes the guest session while verification is pending. Its Google and Apple account support uses a provider-verified email claim when one is available. Email is also available as the second step after a primary sign-in; authenticator apps and recovery codes remain separate security options. These local server features do not configure the hosted Supabase authentication flow.

### Development

Without email provider credentials, a non-production server writes messages to `.data/mail-outbox/*.json`. Each JSON file includes its recipient, purpose, and code. This directory is ignored by Git. It is created with owner-only permissions, and each message is written with `0600` permissions. The browser clearly labels this mode as a development file; it never receives the code in an API response.

Read the newest message for the address you are testing and enter its `code` in Roamly. No real email is sent in this mode. Remove local outbox files when they are no longer needed.

### Send real email from the local server

1. Create a Resend account, add a sending domain, and complete its DNS verification. Use a domain you control, even if the application itself is hosted at a `workers.dev` address. See [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
2. Create a Resend API key with sending access.
3. Configure the server with `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, for example `Roamly <security@your-domain.example>`. Keep the key in server secrets, outside Git and the Vite client environment.
4. Configure `APP_ORIGIN` with the public HTTPS origin and `AUTH_ENCRYPTION_KEY` as described in the authentication setup. The encryption key must stay stable across restarts; it also protects stored email-code digests.

The server calls [Resend's Send Email API](https://resend.com/docs/api-reference/emails/send-email) with plain-text transactional messages. A server-generated idempotency key accompanies each send. Provider failures return a safe error and invalidate the undelivered code; the user can request another code after the resend cooldown. Provider responses and codes are never returned to the browser or logged.

Production disables the development outbox. If either email setting is missing, password signup is unavailable before an account is created, and email-code actions return `503`. `/api/auth/options` reports email delivery readiness so the UI can explain this state. Credentials being configured means sending is enabled; a successful API call does not prove inbox delivery.

The local backend uses Node/Express and SQLite. Cloudflare Pages runs the static frontend with Supabase instead; these local server settings do not configure hosted SMTP or deploy the backend.

### Local server code lifecycle

- Codes expire after ten minutes, can be used only once, and are bound to an account, purpose, and browser challenge. Codes from signup cannot be reused for two-step verification.
- The database stores a keyed HMAC of each code, never a plaintext code or a standalone six-digit hash. The key is held separately from the database.
- Each challenge allows five incorrect attempts. A persistent per-account/per-purpose counter allows ten incorrect attempts in fifteen minutes, including across resends. Resends require a one-minute wait and are limited to five per hour.
- Request bodies cannot select a different recipient during verification or resend. The server uses the account established by the primary sign-in proof.
- Changing or deleting an email delivery configuration does not silently bypass verification. Existing accounts with unverified emails must complete verification at their next primary sign-in.

Email codes protect against someone who has only the account password. A passkey or authenticator is a stronger option when the user's email account may also be compromised. Roamly never asks for a phone number to complete this email flow.
