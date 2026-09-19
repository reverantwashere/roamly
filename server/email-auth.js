import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COOKIE = 'roamly_email_verification';
const TEN_MINUTES = 10 * 60 * 1000;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const defaultFail = (message, status = 400) => Object.assign(new Error(message), { status });
const invalidCode = 'This code is incorrect or has expired. Request a new code and try again.';

export function emailHint(address) {
  const [local, domain] = address.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}`;
}

// This module never accepts an email destination from a code-verification request.
// The destination is loaded from the account selected by a primary sign-in proof.
export function installEmailAuth(app, ctx) {
  const { db, production, completePrimaryAuth, revokeSession } = ctx;
  const options = ctx.options ?? {};
  const fail = ctx.fail ?? defaultFail;
  const now = options.emailNow ?? Date.now;
  const apiKey = options.resendApiKey ?? process.env.RESEND_API_KEY;
  const from = options.authEmailFrom ?? process.env.AUTH_EMAIL_FROM;
  const emailFetch = options.emailFetch ?? fetch;
  const delivery = apiKey && from ? 'email' : !production && options.devEmail !== false ? 'development-file' : 'unavailable';
  const hmacKey = ctx.emailHmacKey;
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32) throw new Error('Email authentication requires a server-side key of at least 32 bytes.');
  const digest = (userId, purpose, binding, code) => createHmac('sha256', hmacKey).update(JSON.stringify([userId, purpose, binding, code])).digest('hex');
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' };

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_auth_pending (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_auth_codes (
      binding TEXT NOT NULL, purpose TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (binding, purpose)
    );
    CREATE TABLE IF NOT EXISTS email_auth_limits (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL,
      last_sent_at INTEGER NOT NULL DEFAULT 0, send_window_at INTEGER NOT NULL DEFAULT 0,
      send_count INTEGER NOT NULL DEFAULT 0, attempt_window_at INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, purpose)
    );
  `);

  function assertAvailable() {
    if (delivery === 'unavailable') throw fail('Email delivery is not configured yet. Please try again once Roamly email is available.', 503);
  }

  async function deliverMessage({ to, subject, text, code, purpose, idempotencyKey = randomUUID() }) {
    assertAvailable();
    if (delivery === 'development-file') {
      const emailDir = options.emailDir ?? resolve('.data/mail-outbox');
      mkdirSync(emailDir, { recursive: true, mode: 0o700 });
      writeFileSync(resolve(emailDir, `${randomUUID()}.json`), JSON.stringify({ to, subject, text, ...(code ? { code } : {}), purpose, createdAt: new Date(now()).toISOString(), expiresInMinutes: 10 }, null, 2), { mode: 0o600, flag: 'wx' });
      return { delivery };
    }
    try {
      const response = await emailFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(10000),
      });
      // Never expose provider response bodies, API credentials, or the code to clients or logs.
      if (!response.ok) throw new Error('Email provider rejected delivery.');
      return { delivery };
    } catch {
      throw fail('We could not send your email. Please wait a minute, then request a new code.', 503);
    }
  }

  function getUser(userId) {
    const user = db.prepare('SELECT id,email,is_guest,email_verified_at FROM users WHERE id=?').get(userId);
    if (!user || user.is_guest || !user.email) throw fail('Sign in again to request an email code.', 401);
    return user;
  }

  function reserveSend(userId, purpose) {
    const currentTime = now();
    db.prepare('INSERT OR IGNORE INTO email_auth_limits (user_id,purpose) VALUES (?,?)').run(userId, purpose);
    const row = db.prepare('SELECT * FROM email_auth_limits WHERE user_id=? AND purpose=?').get(userId, purpose);
    if (row.last_sent_at && currentTime - row.last_sent_at < 60000) throw fail('Please wait a minute before requesting another email code.', 429);
    const freshWindow = currentTime - row.send_window_at >= 60 * 60 * 1000;
    const count = freshWindow ? 0 : row.send_count;
    if (count >= 5) throw fail('Too many email requests. Please try again in an hour.', 429);
    db.prepare('UPDATE email_auth_limits SET last_sent_at=?,send_window_at=?,send_count=? WHERE user_id=? AND purpose=?')
      .run(currentTime, freshWindow ? currentTime : row.send_window_at, count + 1, userId, purpose);
  }

  async function sendCode({ userId, purpose, binding }) {
    assertAvailable();
    const user = getUser(userId);
    if (!purpose || !binding) throw new Error('An email challenge needs a purpose and binding.');
    reserveSend(userId, purpose);
    db.prepare('DELETE FROM email_auth_codes WHERE expires_at<=?').run(now());
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = digest(userId, purpose, binding, code);
    // Updating the row invalidates any previously delivered code for this browser challenge.
    db.prepare('INSERT INTO email_auth_codes (binding,purpose,user_id,code_hash,expires_at,attempts) VALUES (?,?,?,?,?,0) ON CONFLICT(binding,purpose) DO UPDATE SET user_id=excluded.user_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0')
      .run(binding, purpose, userId, codeHash, now() + TEN_MINUTES);
    try {
      const verification = purpose === 'verify-email';
      await deliverMessage({
        to: user.email, subject: verification ? 'Verify your Roamly email' : 'Your Roamly security code', code, purpose,
        text: `${verification ? 'Verify your email address' : 'Confirm your Roamly sign-in or security change'} with this code: ${code}\n\nThis code expires in 10 minutes and can only be used once. Do not share it with anyone. If you did not request it, ignore this email.`,
      });
    } catch (error) {
      db.prepare('DELETE FROM email_auth_codes WHERE binding=? AND purpose=? AND code_hash=?').run(binding, purpose, codeHash);
      throw error;
    }
    return { emailHint: emailHint(user.email), delivery };
  }

  function verifyCode({ userId, purpose, binding, code }) {
    const currentTime = now();
    const row = db.prepare('SELECT * FROM email_auth_codes WHERE binding=? AND purpose=? AND user_id=?').get(binding, purpose, userId);
    if (!row || row.expires_at <= currentTime) throw fail(invalidCode);
    const limit = db.prepare('SELECT * FROM email_auth_limits WHERE user_id=? AND purpose=?').get(userId, purpose);
    const freshWindow = !limit || currentTime - limit.attempt_window_at >= 15 * 60 * 1000;
    const count = freshWindow ? 0 : limit.attempt_count;
    if (row.attempts >= 5 || count >= 10) throw fail('Too many incorrect codes. Wait 15 minutes, then request a new code.', 429);
    const supplied = typeof code === 'string' && /^\d{6}$/.test(code) ? code : '';
    const actual = Buffer.from(digest(userId, purpose, binding, supplied), 'hex');
    const expected = Buffer.from(row.code_hash, 'hex');
    if (!supplied || !timingSafeEqual(actual, expected)) {
      db.prepare('UPDATE email_auth_codes SET attempts=attempts+1 WHERE binding=? AND purpose=?').run(binding, purpose);
      db.prepare('UPDATE email_auth_limits SET attempt_count=?,attempt_window_at=? WHERE user_id=? AND purpose=?')
        .run(count + 1, freshWindow ? currentTime : limit.attempt_window_at, userId, purpose);
      throw fail(invalidCode);
    }
    const consumed = db.prepare('DELETE FROM email_auth_codes WHERE binding=? AND purpose=? AND code_hash=?').run(binding, purpose, row.code_hash);
    if (!consumed.changes) throw fail(invalidCode);
    return true;
  }

  function pending(req) {
    const entry = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
    const token = entry?.slice(COOKIE.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const binding = sha(token);
    const row = db.prepare('SELECT * FROM email_auth_pending WHERE token_hash=? AND expires_at>?').get(binding, now());
    return row ? { ...row, binding } : null;
  }

  async function beginEmailVerification(req, res, userId) {
    assertAvailable();
    getUser(userId);
    // An upgraded guest must lose every full session before verification can begin.
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    revokeSession(req, res);
    db.prepare('DELETE FROM email_auth_pending WHERE expires_at<=?').run(now());
    const existing = pending(req);
    if (existing?.user_id === userId) {
      const code = db.prepare('SELECT expires_at FROM email_auth_codes WHERE binding=? AND purpose=?').get(existing.binding, 'verify-email');
      if (code?.expires_at > now()) return { requiresEmailVerification: true, emailHint: emailHint(getUser(userId).email), delivery };
    }
    const token = randomBytes(32).toString('base64url');
    const binding = sha(token);
    db.prepare('INSERT INTO email_auth_pending (token_hash,user_id,expires_at) VALUES (?,?,?)').run(binding, userId, now() + TEN_MINUTES);
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: TEN_MINUTES });
    const result = await sendCode({ userId, purpose: 'verify-email', binding });
    return { requiresEmailVerification: true, ...result };
  }

  app.post('/api/auth/email/verify', async (req, res) => {
    const current = pending(req);
    if (!current) throw fail('Your email verification session has expired. Sign in again.', 401);
    verifyCode({ userId: current.user_id, purpose: 'verify-email', binding: current.binding, code: req.body.code });
    db.prepare('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?').run(new Date(now()).toISOString(), current.user_id);
    db.prepare('DELETE FROM email_auth_pending WHERE user_id=?').run(current.user_id);
    db.prepare("DELETE FROM email_auth_codes WHERE user_id=? AND purpose='verify-email'").run(current.user_id);
    res.clearCookie(COOKIE, cookieOptions);
    res.json(await completePrimaryAuth(req, res, current.user_id, 'email-verification'));
  });

  app.post('/api/auth/email/resend', async (req, res) => {
    const current = pending(req);
    if (!current) return res.json({ ok: true, message: 'If an email verification is pending, a new code will be sent.' });
    const result = await sendCode({ userId: current.user_id, purpose: 'verify-email', binding: current.binding });
    db.prepare('UPDATE email_auth_pending SET expires_at=? WHERE token_hash=?').run(now() + TEN_MINUTES, current.binding);
    // Keep the browser cookie expiry aligned with the newly issued code.
    const token = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: TEN_MINUTES });
    res.json({ ok: true, requiresEmailVerification: true, ...result });
  });

  app.post('/api/auth/email/start', async (req, res) => {
    if (!req.userId) throw fail('Sign in again to verify your email.', 401);
    const user = getUser(req.userId);
    if (user.email_verified_at) return res.json({ ok: true, emailVerified: true });
    res.json(await beginEmailVerification(req, res, user.id));
  });

  return { beginEmailVerification, assertAvailable, sendCode, verifyCode, deliverMessage, options: () => ({ enabled: delivery !== 'unavailable', delivery }) };
}
