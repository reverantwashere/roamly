# Supabase + Cloudflare Pages

Roamly will use Supabase for both user accounts and application data. Cloudflare Pages serves the React/Vite frontend at the edge; it does not run the current local Express and SQLite server. This keeps the beta simple and works well for a Kerala-first web launch.

## 1. Create the Supabase project

1. Create a Supabase project in a region appropriate for your users.
2. In the SQL Editor, run [`supabase/migrations/202609190001_roamly.sql`](../supabase/migrations/202609190001_roamly.sql).
3. In **Authentication → URL Configuration**, add your local address and the Cloudflare Pages production and preview URLs as redirect URLs.
4. In **Authentication → Providers**, enable Email, Google, and Apple. Email confirmation should stay enabled. Configure Google and Apple in their provider consoles with Supabase's callback URL.
5. In **Authentication → Passkeys**, enable passkeys and set the relying-party ID and allowed origins for the final Pages domain. Do not change the relying-party ID after people have enrolled a passkey.

### Use a six-digit signup code

In **Authentication → Emails → Templates → Confirm sign up**:

1. Set the subject to `Your Roamly verification code`.
2. Switch to the template source editor and paste the contents of [`supabase/templates/confirm-signup.html`](../supabase/templates/confirm-signup.html).
3. Save the template and keep **Confirm email** enabled.

The `{{ .Token }}` variable in that template is required. It replaces the confirmation link with the six-digit code that Roamly verifies in the signup dialog. For public beta delivery, configure custom SMTP; Supabase's default sender is intended only for testing and restricts recipients and send volume.

For the beta, the default second factor should be email confirmation. Supabase also supports optional authenticator-app (TOTP) MFA.

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

- Replace the temporary `pages.dev` address with the final beta hostname before people register passkeys.
- Add that exact HTTPS origin to Supabase's redirect and passkey settings.
- Test signup email OTP, Google, Apple, password reset, and TOTP on the deployed preview URL.
- Keep Row Level Security enabled. The migration creates owner-only policies for every Roamly record.
