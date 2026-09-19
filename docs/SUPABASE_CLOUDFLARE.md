# Supabase + Cloudflare Pages

Roamly uses Supabase for hosted user accounts and application data. Cloudflare Pages serves the React/Vite frontend; it does not run the local Express and SQLite server. With both public Supabase environment variables present, the frontend uses the hosted adapter instead of `/api` routes.

## 1. Create the Supabase project

1. Create a Supabase project in a region appropriate for your users.
2. In the SQL Editor, run the migrations in order:
   - [`202609190001_roamly.sql`](../supabase/migrations/202609190001_roamly.sql): profiles, entity storage, and owner-only policies.
   - [`202609190002_account_delete_rpc.sql`](../supabase/migrations/202609190002_account_delete_rpc.sql): self-service account deletion.
   - [`202609190003_atomic_account_data.sql`](../supabase/migrations/202609190003_atomic_account_data.sql): atomic fuel recording, related-record deletion, saved-place toggles, and hardened account deletion. Apply this before deploying the hosted data adapter.
3. In **Authentication → URL Configuration**, add your local address and the Cloudflare Pages production and preview URLs as redirect URLs.
4. In **Authentication → Providers**, enable Email and keep email confirmation enabled. Google, Apple, and passkeys are optional future integrations; the current signup dialog uses email and password.

### Use a six-digit signup code

In **Authentication → Emails → Templates → Confirm sign up**:

1. Set the subject to `Your Roamly verification code`.
2. Switch to the template source editor and paste the contents of [`supabase/templates/confirm-signup.html`](../supabase/templates/confirm-signup.html).
3. Save the template and keep **Confirm email** enabled.

The `{{ .Token }}` variable in that template is required. It replaces the confirmation link with the six-digit code that Roamly verifies in the signup dialog. For public beta delivery, configure custom SMTP; Supabase's default sender is intended only for testing and restricts recipients and send volume.

In **Authentication → Emails → Templates → Reset password**, set the subject to `Reset your Roamly password` and paste the contents of [`supabase/templates/recovery.html`](../supabase/templates/recovery.html). The template must keep `{{ .ConfirmationURL }}` so the link creates the temporary recovery session used by the new-password screen.

Supabase's built-in sender is limited to two authentication emails per hour across signup, resend, and password recovery. A rate-limit or generic recovery-email failure therefore requires waiting for the quota to refill or configuring custom SMTP under **Authentication → Emails → SMTP Settings**.

Email confirmation verifies ownership of the signup address; it is not a second authentication factor. Supabase also supports optional authenticator-app (TOTP) MFA.

Roamly can store an optional mobile number as private profile information. It does not send a verification message, so the Supabase Phone provider and an external SMS provider are not required.

## 2. Configure Cloudflare Pages

Create a Pages project from `reverantwashere/roamly` and use:

| Setting | Value |
| --- | --- |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | `main` |

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in **Settings → Environment variables** for both Production and Preview. These values are intentionally public client configuration. Never put `service_role`, email-provider, Google, or Apple secrets in Cloudflare Pages variables beginning with `VITE_`.

Cloudflare Pages will deploy preview builds for pull requests and production builds for `main`. GitHub Pages can serve the same static `dist` folder, but Pages is preferred because its preview URLs make OAuth redirect testing and passkey-origin configuration much easier.

## 3. Before making the beta public

- Set the production HTTPS origin as the Supabase Site URL and allow the intended production and preview redirects.
- Test signup email OTP, login, password reset, onboarding, and sign-out on the deployed preview URL.
- Save a trip, vehicle, expense, fuel record, and place; reload and confirm persistence. Test edits and deletions with disposable records.
- Check that a second account cannot read or change the first account's data. `npm test` also runs the database migrations in an isolated PostgreSQL engine to cover owner isolation and rollback behavior.
- Keep Row Level Security enabled. The migration creates owner-only policies for every Roamly record.

## Existing project upgrade

For an existing project, apply only the missing migrations in order. The third migration replaces functions without deleting existing user records. Its functions use the signed-in user's identity; never expose a service-role key in the browser. A successful Pages build does not apply SQL migrations automatically.
