import { randomBytes, createHash, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as OTPAuth from 'otpauth';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const FIVE_MINUTES = 5 * 60 * 1000;
const PENDING_COOKIE = 'roamly_2fa';
const CHALLENGE_COOKIE = 'roamly_webauthn';
const cookie = (req, name) => (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);

function encryptionKey(options, production, dbPath) {
  const encoded = options.authEncryptionKey ?? process.env.AUTH_ENCRYPTION_KEY;
  if (encoded) {
    const key = Buffer.isBuffer(encoded) ? encoded : Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY must contain a base64-encoded 32-byte key.');
    return key;
  }
  if (production) throw new Error('Set AUTH_ENCRYPTION_KEY to a persistent base64-encoded 32-byte key before starting production.');
  if (dbPath === ':memory:') return randomBytes(32);
  const path = resolve(dirname(dbPath), 'auth-encryption-key');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error('The stored authentication encryption key is invalid.');
  return key;
}

export function installSecurity(app, ctx) {
  const { db, production, appOrigin, options, dbPath, fail, rateLimit, payload, setSession, revokeSession, checkPassword, getEmailAuth } = ctx;
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_method TEXT NOT NULL DEFAULT 'email',
      encrypted_totp TEXT, last_totp_counter INTEGER NOT NULL DEFAULT -1,
      pending_totp TEXT, pending_method TEXT, pending_expires_at INTEGER, pending_session_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL,
      name TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT,
      device_type TEXT, backed_up INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
    CREATE TABLE IF NOT EXISTS auth_challenges (
      token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, challenge TEXT NOT NULL, data TEXT NOT NULL,
      session_hash TEXT, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_pending (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL
    );
  `);
  const key = encryptionKey(options, production, dbPath);
  let origin;
  try { origin = new URL(appOrigin); } catch { throw new Error('APP_ORIGIN must be an absolute URL.'); }
  const originValid = origin.origin === appOrigin && (origin.protocol === 'https:' || (!production && ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.protocol === 'http:'));
  const rpID = origin.hostname;
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, path: '/api/auth', maxAge: FIVE_MINUTES };
  function encrypt(value, userId) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(userId));
    const result = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), result]).toString('base64');
  }
  function decrypt(value, userId) {
    const bytes = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(userId));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
  }
  const settings = (userId) => db.prepare('SELECT * FROM security_settings WHERE user_id=?').get(userId);
  const account = (req) => {
    const user = req.userId && db.prepare('SELECT * FROM users WHERE id=? AND is_guest=0').get(req.userId);
    if (!user) throw fail('Sign in to manage your account security.', 401);
    if (!user.email_verified_at && options.emailVerificationRequired !== false) throw fail('Verify your email before managing account security.', 403);
    return user;
  };
  function requireAccount(req, res, next) {
    try { account(req); next(); } catch (error) { next(error); }
  }
  async function requireRecentAuth(req) {
    const user = account(req);
    const session = req.sessionToken && db.prepare('SELECT * FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?').get(sha(req.sessionToken), user.id, Date.now());
    if (!session) throw fail('Sign in again to continue.', 401);
    if (session.authenticated_at > Date.now() - FIVE_MINUTES) return user;
    rateLimit(req, `reauth:${user.id}`, 8);
    if (!user.password_hash || typeof req.body.password !== 'string' || req.body.password.length > 128 || !await checkPassword(req.body.password, user.password_hash)) {
      throw fail('Sign in again, or enter your current password, before changing security settings.', 401);
    }
    // Only an already complete session can be refreshed here; a pending second factor never has a session.
    db.prepare('UPDATE sessions SET authenticated_at=? WHERE token_hash=? AND user_id=?').run(Date.now(), sha(req.sessionToken), user.id);
    return user;
  }
  function clearPending(req, res) {
    const token = cookie(req, PENDING_COOKIE);
    if (!token) return;
    db.prepare('DELETE FROM auth_pending WHERE token_hash=?').run(sha(token));
    res.clearCookie(PENDING_COOKIE, { ...cookieOptions, maxAge: undefined });
  }
  async function completePrimaryAuth(req, res, userId, method = 'password') {
    const user = db.prepare('SELECT * FROM users WHERE id=? AND is_guest=0').get(userId);
    if (!user) throw fail('This account is unavailable.', 401);
    clearPending(req, res);
    if (!user.email_verified_at && options.emailVerificationRequired !== false) {
      revokeSession(req, res);
      return getEmailAuth().beginEmailVerification(req, res, userId);
    }
    const state = settings(userId);
    if (state?.two_factor_enabled) {
      revokeSession(req, res);
      db.prepare('DELETE FROM auth_pending WHERE expires_at<=?').run(Date.now());
      const token = randomBytes(32).toString('base64url');
      const tokenHash = sha(token);
      db.prepare('INSERT INTO auth_pending (token_hash,user_id,method,expires_at) VALUES (?,?,?,?)').run(tokenHash, userId, method, Date.now() + FIVE_MINUTES);
      let delivery = {};
      try {
        if (state.two_factor_method === 'email') delivery = await getEmailAuth().sendCode({ userId, purpose: 'two-factor-login', binding: tokenHash });
      } catch (error) { db.prepare('DELETE FROM auth_pending WHERE token_hash=?').run(tokenHash); throw error; }
      res.cookie(PENDING_COOKIE, token, cookieOptions);
      return { requiresTwoFactor: true, method: state.two_factor_method, ...delivery };
    }
    setSession(res, userId, req.sessionToken, method);
    return payload(userId);
  }
  function metadata(userId) {
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId);
    const state = settings(userId);
    const providers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_accounts'").get()
      ? db.prepare('SELECT provider,email FROM oauth_accounts WHERE user_id=? ORDER BY provider').all(userId) : [];
    return {
      twoFactorEnabled: Boolean(state?.two_factor_enabled), twoFactorMethod: state?.two_factor_method ?? 'email',
      passkeys: db.prepare('SELECT id,name,created_at AS createdAt,last_used_at AS lastUsedAt FROM passkeys WHERE user_id=? ORDER BY created_at').all(userId),
      providers, hasPassword: Boolean(user?.password_hash),
      recoveryCodesRemaining: db.prepare('SELECT count(*) AS count FROM recovery_codes WHERE user_id=?').get(userId).count,
    };
  }
  function pending(req) {
    const token = cookie(req, PENDING_COOKIE);
    const record = token && db.prepare('SELECT * FROM auth_pending WHERE token_hash=? AND expires_at>? AND attempts<8').get(sha(token), Date.now());
    if (!record) throw fail('This verification has expired. Sign in again.', 401);
    return record;
  }
  function totp(secret, user) {
    return new OTPAuth.TOTP({ issuer: 'Roamly', label: user.email, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
  }
  function totpCounter(secret, user, code) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
    const generator = totp(secret, user);
    const timestamp = Date.now();
    const delta = generator.validate({ token: code.trim(), window: 1, timestamp });
    return delta === null ? null : Math.floor(timestamp / 30000) + delta;
  }
  function generateRecoveryCodes(userId) {
    db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(userId);
    const codes = Array.from({ length: 10 }, () => randomBytes(12).toString('hex').toUpperCase().match(/.{1,4}/g).join('-'));
    for (const code of codes) db.prepare('INSERT INTO recovery_codes VALUES (?,?,?)').run(sha(`${userId}:${code.replaceAll('-', '')}`), userId, new Date().toISOString());
    return codes;
  }
  async function verifyFactor(userId, code, purpose, binding) {
    if (typeof code !== 'string' || code.length > 100) throw fail('Enter a valid verification or recovery code.', 400);
    const normalized = code.replaceAll('-', '').replaceAll(' ', '').toUpperCase();
    if (/^[A-F0-9]{24}$/.test(normalized)) {
      const used = db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=?').run(userId, sha(`${userId}:${normalized}`));
      if (used.changes) return;
      throw fail('That recovery code is invalid or has already been used.', 400);
    }
    const state = settings(userId);
    if (!state?.two_factor_enabled) throw fail('Two-step verification is not enabled.', 400);
    if (state.two_factor_method === 'email') {
      const valid = await getEmailAuth().verifyCode({ userId, purpose, binding, code });
      if (valid === false) throw fail('That verification code is invalid or expired.', 400);
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    const counter = totpCounter(decrypt(state.encrypted_totp, userId), user, code);
    if (counter === null || counter <= state.last_totp_counter) throw fail('That authenticator code is invalid or already used. Wait for a new code.', 400);
    if (!db.prepare('UPDATE security_settings SET last_totp_counter=? WHERE user_id=? AND last_totp_counter<?').run(counter, userId, counter).changes) throw fail('That authenticator code has already been used.', 400);
  }
  async function requireDestructiveAuth(req) {
    const user = await requireRecentAuth(req);
    if (settings(user.id)?.two_factor_enabled) {
      rateLimit(req, `factor-action:${user.id}`, 10);
      await verifyFactor(user.id, req.body.code, 'two-factor-action', sha(req.sessionToken));
    }
    return user;
  }
  function rotateAfterSecurityChange(req, res, userId) {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM auth_pending WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(userId);
    setSession(res, userId, undefined, 'security-change');
    clearPending(req, res);
  }
  function createChallenge(req, res, kind, challenge, userId, data = {}) {
    const old = cookie(req, CHALLENGE_COOKIE);
    if (old) db.prepare('DELETE FROM auth_challenges WHERE token_hash=?').run(sha(old));
    db.prepare('DELETE FROM auth_challenges WHERE expires_at<=?').run(Date.now());
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO auth_challenges VALUES (?,?,?,?,?,?,?)').run(sha(token), userId ?? null, kind, challenge, JSON.stringify(data), userId ? sha(req.sessionToken) : null, Date.now() + FIVE_MINUTES);
    res.cookie(CHALLENGE_COOKIE, token, cookieOptions);
  }
  function consumeChallenge(req, res, kind) {
    const token = cookie(req, CHALLENGE_COOKIE);
    const challenge = token && db.prepare('DELETE FROM auth_challenges WHERE token_hash=? RETURNING *').get(sha(token));
    res.clearCookie(CHALLENGE_COOKIE, { ...cookieOptions, maxAge: undefined });
    if (!challenge || challenge.expires_at <= Date.now() || challenge.kind !== kind || (challenge.user_id && (challenge.user_id !== req.userId || challenge.session_hash !== sha(req.sessionToken ?? '')))) throw fail('This passkey request has expired or already been used. Try again.', 400);
    return challenge;
  }
  function requirePasskeys() {
    if (!originValid) throw fail('Passkeys require a configured HTTPS APP_ORIGIN (or localhost for development).', 503);
  }
  function passkeyName(value) {
    if (value === undefined || value === '') return 'My passkey';
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw fail('Passkey name must be between 1 and 80 characters.');
    return value.trim();
  }

  app.get('/api/auth/security', requireAccount, (req, res) => {
    const session = db.prepare('SELECT authenticated_at FROM sessions WHERE token_hash=?').get(sha(req.sessionToken));
    res.json({ ...metadata(req.userId), recentlyAuthenticated: session.authenticated_at > Date.now() - FIVE_MINUTES });
  });
  app.get('/api/auth/2fa/pending', (req, res) => {
    try { const record = pending(req); res.json({ pending: true, method: settings(record.user_id).two_factor_method }); }
    catch { res.json({ pending: false }); }
  });
  app.post('/api/auth/2fa/verify', async (req, res) => {
    const record = pending(req);
    rateLimit(req, `factor-login:${record.user_id}`, 12);
    db.prepare('UPDATE auth_pending SET attempts=attempts+1 WHERE token_hash=?').run(record.token_hash);
    try { await verifyFactor(record.user_id, req.body.code, 'two-factor-login', record.token_hash); }
    catch (error) {
      if (record.attempts + 1 >= 8) clearPending(req, res);
      throw error;
    }
    if (!db.prepare('DELETE FROM auth_pending WHERE token_hash=? AND expires_at>?').run(record.token_hash, Date.now()).changes) throw fail('This verification has already been used or expired.', 400);
    clearPending(req, res);
    setSession(res, record.user_id, req.sessionToken, `${record.method}+${settings(record.user_id).two_factor_method}`);
    res.json(payload(record.user_id));
  });
  app.post('/api/auth/2fa/resend', async (req, res) => {
    const record = pending(req);
    rateLimit(req, `factor-resend:${record.user_id}`, 5);
    if (settings(record.user_id).two_factor_method !== 'email') throw fail('Use your authenticator app or a recovery code.');
    res.json(await getEmailAuth().sendCode({ userId: record.user_id, purpose: 'two-factor-login', binding: record.token_hash }));
  });
  app.post('/api/auth/2fa/setup', requireAccount, async (req, res) => {
    const user = await requireRecentAuth(req);
    rateLimit(req, `factor-setup:${user.id}`, 10);
    if (settings(user.id)?.two_factor_enabled) throw fail('Turn off two-step verification before changing its method.', 409);
    const method = req.body.method ?? 'email';
    if (!['email', 'totp'].includes(method)) throw fail('Choose email or authenticator app verification.');
    let secret = null;
    let response;
    if (method === 'totp') {
      secret = new OTPAuth.Secret({ size: 20 }).base32;
      response = { method, secret, otpauthUrl: totp(secret, user).toString() };
    } else response = { method, ...await getEmailAuth().sendCode({ userId: user.id, purpose: 'two-factor-setup', binding: sha(req.sessionToken) }) };
    db.prepare(`INSERT INTO security_settings (user_id,pending_totp,pending_method,pending_expires_at,pending_session_hash) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET pending_totp=excluded.pending_totp,pending_method=excluded.pending_method,pending_expires_at=excluded.pending_expires_at,pending_session_hash=excluded.pending_session_hash`)
      .run(user.id, secret ? encrypt(secret, user.id) : null, method, Date.now() + FIVE_MINUTES, sha(req.sessionToken));
    res.json(response);
  });
  app.post('/api/auth/2fa/enable', requireAccount, async (req, res) => {
    const user = await requireRecentAuth(req);
    rateLimit(req, `factor-enable:${user.id}`, 8);
    const state = settings(user.id);
    if (!state?.pending_method || state.pending_expires_at <= Date.now() || state.pending_session_hash !== sha(req.sessionToken)) throw fail('Start two-step verification setup again.');
    if (state.two_factor_enabled) throw fail('Two-step verification is already enabled.', 409);
    let counter = -1;
    if (state.pending_method === 'totp') {
      counter = totpCounter(decrypt(state.pending_totp, user.id), user, req.body.code);
      if (counter === null) throw fail('That authenticator code is invalid.');
    } else {
      const valid = await getEmailAuth().verifyCode({ userId: user.id, purpose: 'two-factor-setup', binding: sha(req.sessionToken), code: req.body.code });
      if (valid === false) throw fail('That email verification code is invalid.');
    }
    db.exec('BEGIN');
    try {
      const enabled = db.prepare(`UPDATE security_settings SET two_factor_enabled=1,two_factor_method=pending_method,encrypted_totp=pending_totp,last_totp_counter=?,pending_totp=NULL,pending_method=NULL,pending_expires_at=NULL,pending_session_hash=NULL WHERE user_id=? AND two_factor_enabled=0 AND pending_session_hash=?`).run(counter, user.id, sha(req.sessionToken));
      if (!enabled.changes) throw fail('This setup has already been completed.');
      const recoveryCodes = generateRecoveryCodes(user.id);
      rotateAfterSecurityChange(req, res, user.id);
      db.exec('COMMIT');
      res.json({ ok: true, recoveryCodes });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.post('/api/auth/2fa/action-code', requireAccount, async (req, res) => {
    const user = await requireRecentAuth(req);
    rateLimit(req, `factor-action-send:${user.id}`, 5);
    const state = settings(user.id);
    if (!state?.two_factor_enabled || state.two_factor_method !== 'email') throw fail('Use your authenticator app or a recovery code.');
    res.json(await getEmailAuth().sendCode({ userId: user.id, purpose: 'two-factor-action', binding: sha(req.sessionToken) }));
  });
  app.post('/api/auth/2fa/disable', requireAccount, async (req, res) => {
    const user = await requireDestructiveAuth(req);
    if (!settings(user.id)?.two_factor_enabled) throw fail('Two-step verification is not enabled.');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM security_settings WHERE user_id=?').run(user.id);
      db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(user.id);
      rotateAfterSecurityChange(req, res, user.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ ok: true });
  });
  app.post('/api/auth/2fa/recovery-codes', requireAccount, async (req, res) => {
    const user = await requireDestructiveAuth(req);
    if (!settings(user.id)?.two_factor_enabled) throw fail('Enable two-step verification first.');
    db.exec('BEGIN');
    try { const recoveryCodes = generateRecoveryCodes(user.id); db.exec('COMMIT'); res.json({ recoveryCodes }); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.post('/api/auth/passkeys/register/options', requireAccount, async (req, res) => {
    requirePasskeys();
    const user = await requireRecentAuth(req);
    rateLimit(req, `passkey-register:${user.id}`, 12);
    const credentials = db.prepare('SELECT id,transports FROM passkeys WHERE user_id=?').all(user.id);
    if (credentials.length >= 20) throw fail('You can keep up to 20 passkeys. Remove an unused one first.');
    const generated = await generateRegistrationOptions({ rpName: 'Roamly', rpID, userID: new TextEncoder().encode(user.id), userName: user.email, userDisplayName: user.name,
      attestationType: 'none', excludeCredentials: credentials.map((item) => ({ id: item.id, transports: JSON.parse(item.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
    createChallenge(req, res, 'register', generated.challenge, user.id, { name: passkeyName(req.body.name) });
    res.json(generated);
  });
  app.post('/api/auth/passkeys/register/verify', requireAccount, async (req, res) => {
    requirePasskeys();
    const challenge = consumeChallenge(req, res, 'register');
    await requireRecentAuth(req);
    rateLimit(req, `passkey-verify:${req.userId}`, 12);
    let verification;
    try { verification = await verifyRegistrationResponse({ response: req.body.response, expectedChallenge: challenge.challenge, expectedOrigin: appOrigin, expectedRPID: rpID, requireUserVerification: true }); }
    catch { throw fail('The passkey could not be verified. Try registering it again.'); }
    if (!verification.verified || !verification.registrationInfo) throw fail('The passkey could not be verified.');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    if (db.prepare('SELECT id FROM passkeys WHERE id=?').get(credential.id)) throw fail('This passkey is already registered.', 409);
    db.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?,?,?,?,?)').run(credential.id, req.userId, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports ?? []), JSON.parse(challenge.data).name, new Date().toISOString(), null, credentialDeviceType, Number(credentialBackedUp));
    res.status(201).json({ ok: true });
  });
  app.post('/api/auth/passkeys/login/options', async (req, res) => {
    requirePasskeys();
    rateLimit(req, 'passkey-login-options', 25);
    const generated = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    createChallenge(req, res, 'login', generated.challenge, null);
    res.json(generated);
  });
  app.post('/api/auth/passkeys/login/verify', async (req, res) => {
    requirePasskeys();
    const challenge = consumeChallenge(req, res, 'login');
    rateLimit(req, 'passkey-login', 15);
    const response = req.body.response;
    const stored = typeof response?.id === 'string' && db.prepare('SELECT * FROM passkeys WHERE id=?').get(response.id);
    // Discoverable credentials must carry the opaque, per-account WebAuthn handle used at registration.
    const expectedHandle = stored && Buffer.from(stored.user_id).toString('base64url');
    if (!stored || typeof response.response?.userHandle !== 'string' || response.response.userHandle !== expectedHandle) throw fail('The passkey could not be verified.', 401);
    let verification;
    try { verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: appOrigin, expectedRPID: rpID,
      credential: { id: stored.id, publicKey: new Uint8Array(stored.public_key), counter: stored.counter, transports: JSON.parse(stored.transports) }, requireUserVerification: true }); }
    catch { throw fail('The passkey could not be verified.', 401); }
    if (!verification.verified) throw fail('The passkey could not be verified.', 401);
    const updated = db.prepare('UPDATE passkeys SET counter=?,last_used_at=?,backed_up=? WHERE id=? AND counter=?').run(verification.authenticationInfo.newCounter, new Date().toISOString(), Number(verification.authenticationInfo.credentialBackedUp), stored.id, stored.counter);
    if (!updated.changes) throw fail('This passkey was used simultaneously. Try again.', 409);
    res.json(await completePrimaryAuth(req, res, stored.user_id, 'passkey'));
  });
  app.delete('/api/auth/passkeys/:id', requireAccount, async (req, res) => {
    const user = await requireDestructiveAuth(req);
    const found = db.prepare('SELECT id FROM passkeys WHERE id=? AND user_id=?').get(req.params.id, user.id);
    if (!found) throw fail('This passkey was not found.', 404);
    const state = metadata(user.id);
    if (!state.hasPassword && !state.providers.length && state.passkeys.length <= 1) throw fail('Add another sign-in method before removing your last passkey.', 409);
    db.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').run(req.params.id, user.id);
    res.json({ ok: true });
  });
  return {
    completePrimaryAuth, requireAccount, requireRecentAuth, requireDestructiveAuth, clearPending, metadata,
    emailHmacKey: createHmac('sha256', key).update('roamly-email-codes-v1').digest(),
    options: () => ({ configured: originValid, rpId: rpID, ...(!originValid ? { reason: 'Set a valid HTTPS APP_ORIGIN before enabling passkeys.' } : {}) }),
  };
}
