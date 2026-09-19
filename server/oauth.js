import express from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { exampleProfile } from './seeds.js';

const TEN_MINUTES = 10 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const oauthError = (code, message, status = 400) => Object.assign(new Error(message), { oauthCode: code, status });
const ENDPOINTS = {
  google: { authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuer: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { authorization: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', jwks: 'https://appleid.apple.com/auth/keys', issuer: 'https://appleid.apple.com' },
};
const PUBLIC_ERRORS = new Set(['unavailable', 'cancelled', 'state', 'provider', 'unverified_email', 'email_required', 'account_exists', 'already_linked', 'session_expired']);

function readCookie(req, name) {
  const value = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}
function equalHash(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function trustedOrigin(value, production) {
  try {
    const url = new URL(value ?? (production ? '' : 'http://localhost:5173'));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !production)) return null;
    return url.origin;
  } catch { return null; }
}
function verifiedAddress(claims) {
  if (claims.email === undefined || claims.email === null || claims.email === '') return null;
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw oauthError('unverified_email', 'The provider must verify your email address first.');
  if (typeof claims.email !== 'string' || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw oauthError('provider', 'The provider returned an invalid email address.');
  return claims.email.toLowerCase();
}

/** Server-only configuration and injected network/key resolvers support offline cryptographic tests. */
export function installOAuthRoutes(app, ctx) {
  const { db, production, rateLimit, requireAccount, requireRecentAuth, requireDestructiveAuth, completePrimaryAuth } = ctx;
  const settings = ctx.oauth ?? {};
  const env = settings.env ?? process.env;
  const origin = trustedOrigin(ctx.appOrigin ?? env.APP_ORIGIN, production);
  const credentials = {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    apple: { clientId: env.APPLE_CLIENT_ID, teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  };
  const has = (value) => typeof value === 'string' && Boolean(value.trim());
  const configured = (provider) => Boolean(origin && (provider === 'google'
    ? has(credentials.google.clientId) && has(credentials.google.clientSecret)
    : origin.startsWith('https://') && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) && Object.values(credentials.apple).every(has)));
  const options = () => Object.fromEntries(['google', 'apple'].map((provider) => [provider, {
    configured: configured(provider),
    ...(!configured(provider) ? { reason: !origin ? 'A valid APP_ORIGIN is required.' : provider === 'apple' && (!origin.startsWith('https://') || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) ? 'Apple sign-in needs a public HTTPS domain and Apple Developer configuration.' : `${provider === 'google' ? 'Google' : 'Apple'} sign-in needs server configuration.` } : {}),
  }]));
  const providerFor = (name) => {
    if (!Object.hasOwn(ENDPOINTS, name)) throw oauthError('unavailable', 'This sign-in provider is not supported.', 404);
    if (!configured(name)) throw oauthError('unavailable', `${name === 'google' ? 'Google' : 'Apple'} sign-in has not been configured yet.`, 503);
    return name;
  };
  const callbackUrl = (provider) => `${origin}/api/auth/oauth/${provider}/callback`;
  const cookieName = (provider) => `roamly_oauth_${provider}`;
  const cookieOptions = (provider) => ({ httpOnly: true, secure: Boolean(origin?.startsWith('https://')), sameSite: provider === 'apple' ? 'none' : 'lax', path: `/api/auth/oauth/${provider}` });
  const keyResolvers = Object.fromEntries(Object.entries(ENDPOINTS).map(([provider, endpoints]) => [provider, settings.jwks?.[provider] ?? createRemoteJWKSet(new URL(endpoints.jwks), { timeoutDuration: 10000 })]));
  const request = settings.fetch ?? globalThis.fetch;
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL CHECK(provider IN ('google','apple')), subject TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT, created_at TEXT NOT NULL,
      PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, binding_hash TEXT NOT NULL,
      nonce_hash TEXT NOT NULL, code_verifier TEXT, intent TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE, session_hash TEXT, expires_at INTEGER NOT NULL
    );
  `);

  async function appleClientSecret() {
    const config = credentials.apple;
    const key = await importPKCS8(config.privateKey, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId).setSubject(config.clientId).setAudience('https://appleid.apple.com')
      .setIssuedAt().setExpirationTime('5m').sign(key);
  }

  async function exchangeAndVerify(provider, code, pending) {
    const clientId = credentials[provider].clientId;
    const body = new URLSearchParams({ code, client_id: clientId, client_secret: provider === 'apple' ? await appleClientSecret() : credentials.google.clientSecret, grant_type: 'authorization_code', redirect_uri: callbackUrl(provider) });
    if (provider === 'google') body.set('code_verifier', pending.code_verifier);
    const response = await request(ENDPOINTS[provider].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw oauthError('provider', 'The sign-in provider could not complete this request.');
    const result = await response.json();
    if (typeof result.id_token !== 'string' || result.id_token.length > 20000) throw oauthError('provider', 'The sign-in provider did not return a valid identity token.');
    const { payload: claims } = await jwtVerify(result.id_token, keyResolvers[provider], {
      issuer: ENDPOINTS[provider].issuer, audience: clientId, algorithms: ['RS256'],
      requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'nonce'], maxTokenAge: '10m', clockTolerance: 5,
    });
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.nonce !== 'string' || !equalHash(sha(claims.nonce), pending.nonce_hash)) throw oauthError('provider', 'The sign-in provider returned an invalid identity.');
    if (claims.azp !== undefined && claims.azp !== clientId) throw oauthError('provider', 'This identity token was issued to a different application.');
    if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) throw oauthError('provider', 'The identity token has an invalid authorized party.');
    const address = verifiedAddress(claims);
    if (provider === 'google' && !address) throw oauthError('email_required', 'Google must provide a verified email address.');
    return { subject: claims.sub, email: address, name: typeof claims.name === 'string' ? claims.name.trim().slice(0, 100) : '' };
  }

  function savedSession(pending) {
    if (!pending.session_hash || !pending.user_id) return null;
    return db.prepare('SELECT * FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?').get(pending.session_hash, pending.user_id, Date.now());
  }
  function resolveAccount(req, provider, pending, identity) {
    // There is no asynchronous work inside this transaction: identity uniqueness and guest conversion are atomic.
    db.exec('BEGIN');
    try {
      let account = db.prepare('SELECT * FROM oauth_accounts WHERE provider=? AND subject=?').get(provider, identity.subject);
      let userId;
      if (pending.intent === 'link') {
        const session = savedSession(pending);
        const user = db.prepare('SELECT * FROM users WHERE id=? AND is_guest=0').get(pending.user_id);
        if (!session || !user || !session.authenticated_at || session.authenticated_at < Date.now() - FIVE_MINUTES) throw oauthError('session_expired', 'Sign in again before connecting an account.');
        if (account && account.user_id !== user.id) throw oauthError('already_linked', 'This provider account is already connected to another Roamly account.');
        const previous = db.prepare('SELECT subject FROM oauth_accounts WHERE user_id=? AND provider=?').get(user.id, provider);
        if (previous && previous.subject !== identity.subject) throw oauthError('already_linked', 'Disconnect the currently connected provider account before replacing it.');
        if (!account) db.prepare('INSERT INTO oauth_accounts(provider,subject,user_id,email,created_at) VALUES(?,?,?,?,?)').run(provider, identity.subject, user.id, identity.email, new Date().toISOString());
        if (identity.email && user.email === identity.email && !user.email_verified_at) db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(new Date().toISOString(), user.id);
        userId = user.id;
      } else if (account) {
        userId = account.user_id;
        const user = db.prepare('SELECT email,email_verified_at FROM users WHERE id=?').get(userId);
        if (identity.email && identity.email === user.email && !user.email_verified_at) db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(new Date().toISOString(), userId);
      } else {
        if (!identity.email) throw oauthError('email_required', 'The provider must share a verified email address when you first create an account.');
        // Matching an email is not enough to take over an existing password or provider account.
        if (db.prepare('SELECT id FROM users WHERE email=?').get(identity.email)) throw oauthError('account_exists', 'Sign in to your existing account, then connect this provider in Security.');
        const originalSession = savedSession(pending);
        const guest = pending.user_id && req.userId === pending.user_id && req.sessionToken && equalHash(sha(req.sessionToken), pending.session_hash) && originalSession && db.prepare('SELECT * FROM users WHERE id=? AND is_guest=1').get(pending.user_id);
        const name = identity.name || 'Roamly traveller';
        userId = guest ? guest.id : randomUUID();
        const profile = { ...(guest ? JSON.parse(guest.profile) : exampleProfile()), name };
        const now = new Date().toISOString();
        if (guest) db.prepare('UPDATE users SET name=?,email=?,password_hash=NULL,is_guest=0,profile=?,email_verified_at=? WHERE id=?').run(name, identity.email, JSON.stringify(profile), now, userId);
        else db.prepare('INSERT INTO users(id,name,email,password_hash,is_guest,profile,created_at,email_verified_at) VALUES(?,?,?,?,?,?,?,?)').run(userId, name, identity.email, null, 0, JSON.stringify(profile), now, now);
        db.prepare('INSERT INTO oauth_accounts(provider,subject,user_id,email,created_at) VALUES(?,?,?,?,?)').run(provider, identity.subject, userId, identity.email, now);
      }
      db.exec('COMMIT');
      return userId;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  app.post('/api/auth/oauth/:provider/start', async (req, res) => {
    rateLimit(req, 'oauth-start', 20);
    const provider = providerFor(req.params.provider);
    const intent = req.body.intent ?? 'signin';
    if (!['signin', 'link'].includes(intent)) throw oauthError('provider', 'Choose sign in or connect account.');
    if (intent === 'link') {
      const user = req.userId && db.prepare('SELECT is_guest FROM users WHERE id=?').get(req.userId);
      if (!user || user.is_guest) throw oauthError('session_expired', 'Sign in before connecting another account.', 401);
      await requireRecentAuth(req);
    }
    const state = random();
    const nonce = random();
    const binding = random();
    const verifier = provider === 'google' ? random() : null;
    const now = Date.now();
    db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(now);
    // One pending flow per browser/provider avoids leaving obsolete cookie-bound attempts behind.
    const previousBinding = readCookie(req, cookieName(provider));
    if (previousBinding) db.prepare('DELETE FROM oauth_states WHERE provider=? AND binding_hash=?').run(provider, sha(previousBinding));
    db.prepare('INSERT INTO oauth_states(state_hash,provider,binding_hash,nonce_hash,code_verifier,intent,user_id,session_hash,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(sha(state), provider, sha(binding), sha(nonce), verifier, intent, req.userId ?? null, req.sessionToken ? sha(req.sessionToken) : null, now + (intent === 'link' ? FIVE_MINUTES : TEN_MINUTES));
    res.cookie(cookieName(provider), binding, { ...cookieOptions(provider), maxAge: TEN_MINUTES });
    const url = new URL(ENDPOINTS[provider].authorization);
    url.search = new URLSearchParams({ client_id: credentials[provider].clientId, redirect_uri: callbackUrl(provider), response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'name email', state, nonce }).toString();
    if (provider === 'google') {
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('prompt', 'select_account');
    } else url.searchParams.set('response_mode', 'form_post');
    res.json({ url: url.toString() });
  });

  const callback = (provider) => async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    try {
      rateLimit(req, `oauth-callback-${provider}`, 30);
      providerFor(provider);
      const input = provider === 'apple' ? req.body : req.query;
      const state = input?.state;
      const binding = readCookie(req, cookieName(provider));
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || typeof binding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(binding)) throw oauthError('state', 'This sign-in attempt expired. Please try again.');
      const pending = db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND provider=? AND expires_at>?').get(sha(state), provider, Date.now());
      if (!pending || !equalHash(pending.binding_hash, sha(binding))) throw oauthError('state', 'This sign-in attempt expired. Please try again.');
      // Consume the pending flow before exchanging a code, including error responses; retries need a new start.
      const used = db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND binding_hash=? AND expires_at>?').run(sha(state), sha(binding), Date.now());
      if (!used.changes) throw oauthError('state', 'This sign-in attempt has already been used.');
      res.clearCookie(cookieName(provider), cookieOptions(provider));
      if (input.error) throw oauthError('cancelled', 'Sign-in was cancelled.');
      if (typeof input.code !== 'string' || !input.code || input.code.length > 4096) throw oauthError('provider', 'The sign-in provider did not return a valid code.');
      const identity = await exchangeAndVerify(provider, input.code, pending);
      const userId = resolveAccount(req, provider, pending, identity);
      if (pending.intent === 'link') return res.redirect(303, `${origin}/?auth=linked`);
      const result = await completePrimaryAuth(req, res, userId, provider);
      return res.redirect(303, `${origin}/?auth=${result.requiresTwoFactor ? 'two-factor' : 'success'}`);
    } catch (error) {
      const reason = PUBLIC_ERRORS.has(error.oauthCode) ? error.oauthCode : 'provider';
      // The target is fixed configuration, never callback input. No codes, JWTs, or provider errors are reflected.
      return res.redirect(303, `${origin ?? ''}/?auth=error&reason=oauth_${reason}`);
    }
  };
  app.get('/api/auth/oauth/google/callback', callback('google'));
  app.post('/api/auth/oauth/apple/callback', express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 10 }), callback('apple'));

  app.delete('/api/auth/oauth/:provider', requireAccount, async (req, res) => {
    rateLimit(req, 'oauth-disconnect', 10);
    if (!Object.hasOwn(ENDPOINTS, req.params.provider)) throw oauthError('unavailable', 'This sign-in provider is not supported.', 404);
    await requireDestructiveAuth(req);
    const account = db.prepare('SELECT * FROM oauth_accounts WHERE user_id=? AND provider=?').get(req.userId, req.params.provider);
    if (!account) throw oauthError('unavailable', 'This sign-in provider is not connected.', 404);
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.userId);
    const providers = db.prepare('SELECT COUNT(*) AS count FROM oauth_accounts WHERE user_id=?').get(req.userId).count;
    const passkeys = db.prepare('SELECT COUNT(*) AS count FROM passkeys WHERE user_id=?').get(req.userId).count;
    if (!user.password_hash && providers + passkeys <= 1) throw oauthError('provider', 'Add another sign-in method before disconnecting this account.', 409);
    db.prepare('DELETE FROM oauth_accounts WHERE user_id=? AND provider=?').run(req.userId, req.params.provider);
    res.json({ ok: true });
  });
  return { options };
}
