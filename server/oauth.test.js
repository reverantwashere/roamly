import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { installOAuthRoutes } from './oauth.js';
import { exampleProfile } from './seeds.js';

const signing = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(signing.publicKey), kid: 'test-provider', alg: 'RS256', use: 'sig' };
const appleKey = await generateKeyPair('ES256', { extractable: true });
const applePrivateKey = await exportPKCS8(appleKey.privateKey);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const env = { GOOGLE_CLIENT_ID: 'google-test-client', GOOGLE_CLIENT_SECRET: 'google-test-secret', APPLE_CLIENT_ID: 'apple-test-service', APPLE_TEAM_ID: 'apple-test-team', APPLE_KEY_ID: 'apple-test-key', APPLE_PRIVATE_KEY: applePrivateKey };

async function setup(t, options = {}) {
  const app = express();
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password_hash TEXT,is_guest INTEGER,profile TEXT,created_at TEXT,email_verified_at TEXT);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER,authenticated_at INTEGER);
    CREATE TABLE passkeys(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE entities(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,data TEXT);
  `);
  const tokenResponses = new Map();
  const exchanges = [];
  const authentications = [];
  let recentChecks = 0;
  app.use(express.json());
  app.use((req, res, next) => {
    req.body ??= {};
    req.sessionToken = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('roamly_session='))?.slice('roamly_session='.length);
    if (req.sessionToken) req.userId = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(sha(req.sessionToken), Date.now())?.user_id;
    next();
  });
  const oauth = installOAuthRoutes(app, {
    db, production: options.production ?? false, appOrigin: options.appOrigin ?? 'http://localhost:5173', rateLimit() {},
    requireAccount(req, res, next) {
      const user = req.userId && db.prepare('SELECT * FROM users WHERE id=? AND is_guest=0').get(req.userId);
      if (!user) return res.status(401).json({ error: 'Sign in first.' });
      next();
    },
    async requireRecentAuth(req) {
      recentChecks++;
      const session = req.sessionToken && db.prepare('SELECT authenticated_at FROM sessions WHERE token_hash=?').get(sha(req.sessionToken));
      if (!session || session.authenticated_at < Date.now() - 300000) throw Object.assign(new Error('Sign in again.'), { status: 401 });
    },
    async requireDestructiveAuth(req) {
      recentChecks++;
      const session = req.sessionToken && db.prepare('SELECT authenticated_at FROM sessions WHERE token_hash=?').get(sha(req.sessionToken));
      if (!session || session.authenticated_at < Date.now() - 300000) throw Object.assign(new Error('Sign in again.'), { status: 401 });
      if (options.twoFactor && req.body.code !== 'test-factor') throw Object.assign(new Error('Enter your second-factor code.'), { status: 401 });
    },
    async completePrimaryAuth(req, res, userId, method) {
      authentications.push({ userId, method });
      if (options.twoFactor) { res.cookie('roamly_pending_auth', 'pending-only', { httpOnly: true }); return { requiresTwoFactor: true }; }
      if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(req.sessionToken));
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(token), userId, Date.now() + 3600000, Date.now());
      res.cookie('roamly_session', token, { httpOnly: true });
      return { user: { id: userId } };
    },
    oauth: { env: options.env ?? env, jwks: { google: createLocalJWKSet({ keys: [publicJwk] }), apple: createLocalJWKSet({ keys: [publicJwk] }) },
      async fetch(url, init) {
        exchanges.push({ url, params: new URLSearchParams(init.body) });
        const token = tokenResponses.get(init.body.get('code'));
        return { ok: Boolean(token), async json() { return { id_token: token, access_token: 'never-store-this', refresh_token: 'never-store-this-either' }; } };
      },
    },
  });
  app.use((error, req, res, next) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const jar = new Map();
    return {
      jar,
      async request(path, { method = 'GET', body, headers = {}, form = false } = {}) {
        const response = await fetch(base + path, { method, redirect: 'manual', headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...(body !== undefined ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: form ? new URLSearchParams(body) : JSON.stringify(body) } : {}) });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(';');
          const index = pair.indexOf('=');
          const name = pair.slice(0, index);
          const value = pair.slice(index + 1);
          if (!value) jar.delete(name); else jar.set(name, value);
        }
        return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null };
      },
    };
  }
  function account(browser, { id = randomBytes(8).toString('hex'), address = `${id}@example.com`, guest = false, password = null, recent = true } = {}) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run(id, 'Traveller', guest ? null : address, password, guest ? 1 : 0, JSON.stringify(exampleProfile()), new Date().toISOString(), guest ? null : new Date().toISOString());
    const session = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sha(session), id, Date.now() + 3600000, recent ? Date.now() : Date.now() - 600000);
    browser.jar.set('roamly_session', session);
    return id;
  }
  async function start(browser, provider = 'google', intent = 'signin') {
    const response = await browser.request(`/api/auth/oauth/${provider}/start`, { method: 'POST', body: { intent } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const url = new URL(response.data.url);
    return { url, state: url.searchParams.get('state'), nonce: url.searchParams.get('nonce'), provider, response };
  }
  async function callback(browser, flow, overrides = {}, tokenOptions = {}) {
    const code = randomBytes(16).toString('hex');
    const claims = { sub: 'provider-user-1', email: 'maya@example.com', email_verified: true, name: 'Maya', nonce: flow.nonce, ...overrides };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-provider' }).setIssuer(tokenOptions.issuer ?? (flow.provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com')).setAudience(tokenOptions.audience ?? env[flow.provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'APPLE_CLIENT_ID']).setIssuedAt().setExpirationTime(tokenOptions.expiry ?? '5m').sign(tokenOptions.key ?? signing.privateKey);
    tokenResponses.set(code, token);
    const input = { state: flow.state, code, ...(tokenOptions.user ? { user: tokenOptions.user } : {}) };
    return flow.provider === 'apple'
      ? browser.request('/api/auth/oauth/apple/callback', { method: 'POST', body: input, form: true, headers: { Origin: 'https://appleid.apple.com' } })
      : browser.request(`/api/auth/oauth/google/callback?${new URLSearchParams(input)}`);
  }
  return { db, client, account, start, callback, tokenResponses, exchanges, authentications, oauth, recentChecks: () => recentChecks };
}

test('provider readiness requires explicit credentials, a trusted origin, and public HTTPS for Apple', async (t) => {
  const missing = await setup(t, { env: {} });
  assert.equal(missing.oauth.options().google.configured, false);
  assert.equal((await missing.client().request('/api/auth/oauth/google/start', { method: 'POST', body: {} })).status, 503);
  const local = await setup(t);
  assert.equal(local.oauth.options().google.configured, true);
  assert.equal(local.oauth.options().apple.configured, false);
  const unsafe = await setup(t, { production: true, appOrigin: 'http://travel.example' });
  assert.equal(unsafe.oauth.options().google.configured, false);
  const invalid = await setup(t, { appOrigin: 'https://travel.example/redirect' });
  assert.equal(invalid.oauth.options().google.configured, false);
});

test('Google sends minimal scopes, nonce, state and PKCE and converts only the original guest session', async (t) => {
  const service = await setup(t);
  const browser = service.client();
  const guestId = service.account(browser, { guest: true });
  service.db.prepare('INSERT INTO entities VALUES(?,?,?)').run('trip-to-keep', guestId, 'Kerala trip');
  const flow = await service.start(browser);
  const state = service.db.prepare('SELECT * FROM oauth_states').get();
  assert.equal(state.state_hash, sha(flow.state));
  assert.equal(state.nonce_hash, sha(flow.nonce));
  assert.notEqual(state.binding_hash, browser.jar.get('roamly_oauth_google'));
  assert.equal(flow.url.searchParams.get('scope'), 'openid email profile');
  assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(flow.url.searchParams.get('code_challenge'), createHash('sha256').update(state.code_verifier).digest('base64url'));
  assert.equal(flow.url.searchParams.get('redirect_uri'), 'http://localhost:5173/api/auth/oauth/google/callback');
  assert.match(flow.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(flow.response.headers.get('set-cookie'), /SameSite=Lax/);
  const callback = await service.callback(browser, flow);
  assert.equal(callback.headers.get('location'), 'http://localhost:5173/?auth=success');
  assert.deepEqual(service.authentications, [{ userId: guestId, method: 'google' }]);
  assert.equal(service.db.prepare('SELECT is_guest FROM users WHERE id=?').get(guestId).is_guest, 0);
  assert.ok(service.db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(guestId).email_verified_at);
  assert.equal(service.db.prepare('SELECT user_id FROM entities WHERE id=?').get('trip-to-keep').user_id, guestId);
  assert.equal(service.exchanges[0].params.get('code_verifier'), state.code_verifier);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
  assert.equal(service.db.prepare('SELECT subject FROM oauth_accounts').get().subject, 'provider-user-1');
});

test('state is bound to the initiating browser, expires, and cannot be replayed', async (t) => {
  const service = await setup(t);
  const browser = service.client();
  const attacker = service.client();
  const flow = await service.start(browser);
  const wrong = await service.callback(attacker, flow);
  assert.match(wrong.headers.get('location'), /reason=oauth_state$/);
  assert.equal(service.exchanges.length, 0);
  const success = await service.callback(browser, flow);
  assert.match(success.headers.get('location'), /auth=success$/);
  const replay = await service.callback(browser, flow);
  assert.match(replay.headers.get('location'), /reason=oauth_state$/);
  assert.equal(service.exchanges.length, 1);
  const expired = await service.start(browser);
  service.db.prepare('UPDATE oauth_states SET expires_at=?').run(Date.now() - 1);
  assert.match((await service.callback(browser, expired)).headers.get('location'), /reason=oauth_state$/);
  assert.equal(service.exchanges.length, 1);
});

test('signature, audience, issuer, expiration, nonce and verified email are checked before sign-in', async (t) => {
  const service = await setup(t);
  const browser = service.client();
  const otherSigning = await generateKeyPair('RS256');
  const cases = [
    [{ nonce: 'wrong-nonce' }, {}], [{ email_verified: false }, {}], [{ email_verified: 'false' }, {}],
    [{}, { audience: 'attacker-client' }], [{}, { issuer: 'https://attacker.example' }],
    [{}, { expiry: Math.floor(Date.now() / 1000) - 60 }], [{}, { key: otherSigning.privateKey }],
    [{ azp: 'attacker-client' }, {}], [{ email: undefined }, {}],
  ];
  for (const [claims, options] of cases) {
    const flow = await service.start(browser);
    const result = await service.callback(browser, flow, claims, options);
    assert.match(result.headers.get('location'), /auth=error&reason=oauth_(provider|unverified_email|email_required)$/);
  }
  assert.equal(service.authentications.length, 0);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('matching provider email never takes over an existing account; linking needs recent owner authentication', async (t) => {
  const service = await setup(t);
  const owner = service.client();
  const ownerId = service.account(owner, { address: 'maya@example.com', password: 'existing-password-hash' });
  const attacker = service.client();
  const flow = await service.start(attacker);
  assert.match((await service.callback(attacker, flow)).headers.get('location'), /reason=oauth_account_exists$/);
  assert.equal(service.authentications.length, 0);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM oauth_accounts').get().n, 0);
  assert.equal((await attacker.request('/api/auth/oauth/google/start', { method: 'POST', body: { intent: 'link' } })).status, 401);
  const linking = await service.start(owner, 'google', 'link');
  assert.match((await service.callback(owner, linking)).headers.get('location'), /auth=linked$/);
  assert.equal(service.recentChecks(), 1);
  assert.equal(service.db.prepare('SELECT user_id FROM oauth_accounts').get().user_id, ownerId);
  const secondOwner = service.client();
  service.account(secondOwner, { address: 'other@example.com' });
  const occupied = await service.start(secondOwner, 'google', 'link');
  assert.match((await service.callback(secondOwner, occupied)).headers.get('location'), /reason=oauth_already_linked$/);
});

test('link callbacks reject revoked or stale sessions and cannot upgrade a mismatched guest', async (t) => {
  const service = await setup(t);
  const owner = service.client();
  const ownerId = service.account(owner);
  const flow = await service.start(owner, 'google', 'link');
  service.db.prepare('DELETE FROM sessions WHERE user_id=?').run(ownerId);
  assert.match((await service.callback(owner, flow)).headers.get('location'), /reason=oauth_session_expired$/);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM oauth_accounts').get().n, 0);
  const guestBrowser = service.client();
  const guestId = service.account(guestBrowser, { guest: true });
  const guestFlow = await service.start(guestBrowser);
  guestBrowser.jar.delete('roamly_session');
  assert.match((await service.callback(guestBrowser, guestFlow)).headers.get('location'), /auth=success$/);
  assert.equal(service.db.prepare('SELECT is_guest FROM users WHERE id=?').get(guestId).is_guest, 1);
  assert.notEqual(service.authentications[0].userId, guestId);
});

test('provider sign-in always passes through the two-factor gate before a full session is issued', async (t) => {
  const service = await setup(t, { twoFactor: true });
  const browser = service.client();
  const flow = await service.start(browser);
  const result = await service.callback(browser, flow);
  assert.match(result.headers.get('location'), /auth=two-factor$/);
  assert.equal(browser.jar.has('roamly_session'), false);
  assert.equal(browser.jar.get('roamly_pending_auth'), 'pending-only');
  assert.equal(service.authentications[0].method, 'google');
});

test('Apple uses secure form_post binding, verified token identity and returning subject without trusting posted user data', async (t) => {
  const service = await setup(t, { appOrigin: 'https://roamly.example', production: true });
  const browser = service.client();
  const flow = await service.start(browser, 'apple');
  assert.equal(flow.url.searchParams.get('response_mode'), 'form_post');
  assert.equal(flow.url.searchParams.get('scope'), 'name email');
  assert.match(flow.response.headers.get('set-cookie'), /SameSite=None/);
  assert.match(flow.response.headers.get('set-cookie'), /Secure/);
  const result = await service.callback(browser, flow, { email: 'private@privaterelay.appleid.com', name: undefined }, { user: JSON.stringify({ email: 'victim@example.com', name: { firstName: 'Forged' } }) });
  assert.equal(result.headers.get('location'), 'https://roamly.example/?auth=success');
  const user = service.db.prepare('SELECT * FROM users').get();
  assert.equal(user.email, 'private@privaterelay.appleid.com');
  assert.equal(user.name, 'Roamly traveller');
  assert.ok(service.exchanges[0].params.get('client_secret').split('.').length === 3);
  assert.equal(service.exchanges[0].params.has('code_verifier'), false);
  const returning = await service.start(browser, 'apple');
  assert.match((await service.callback(browser, returning, { email: undefined, email_verified: undefined })).headers.get('location'), /auth=success$/);
  assert.equal(service.authentications[1].userId, user.id);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

test('provider cancellation consumes state and never reflects provider error text or destinations', async (t) => {
  const service = await setup(t);
  const browser = service.client();
  const flow = await service.start(browser);
  const result = await browser.request(`/api/auth/oauth/google/callback?${new URLSearchParams({ state: flow.state, error: 'https://attacker.example/secret', error_description: 'private-token', returnTo: 'https://attacker.example' })}`);
  assert.equal(result.headers.get('location'), 'http://localhost:5173/?auth=error&reason=oauth_cancelled');
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM oauth_states').get().n, 0);
  assert.equal(service.exchanges.length, 0);
});

test('disconnect is owner-scoped and cannot remove the final usable primary sign-in method', async (t) => {
  const service = await setup(t);
  const browser = service.client();
  const id = service.account(browser);
  service.db.prepare('INSERT INTO oauth_accounts VALUES(?,?,?,?,?)').run('google', 'my-provider-id', id, 'test@example.com', new Date().toISOString());
  assert.equal((await browser.request('/api/auth/oauth/google', { method: 'DELETE', body: {} })).status, 409);
  const other = service.client();
  service.account(other);
  assert.equal((await other.request('/api/auth/oauth/google', { method: 'DELETE', body: {} })).status, 404);
  service.db.prepare('INSERT INTO passkeys VALUES(?,?)').run('usable-passkey', id);
  assert.equal((await browser.request('/api/auth/oauth/google', { method: 'DELETE', body: {} })).status, 200);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM oauth_accounts').get().n, 0);
});

test('Express integration accepts only Apple form callbacks and keeps OAuth accounts behind the real two-factor session gate', async (t) => {
  const { createApp } = await import('./app.js');
  const tokens = new Map();
  const service = createApp({
    dbPath: ':memory:', production: true, appOrigin: 'https://roamly.example', authEncryptionKey: Buffer.alloc(32, 5), logErrors: false,
    oauth: { env, jwks: { google: createLocalJWKSet({ keys: [publicJwk] }), apple: createLocalJWKSet({ keys: [publicJwk] }) }, async fetch(url, init) { return { ok: true, async json() { return { id_token: tokens.get(init.body.get('code')) }; } }; } },
  });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); service.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  async function request(path, { method = 'GET', form, body, origin = 'https://roamly.example' } = {}) {
    const response = await fetch(base + path, { method, redirect: 'manual', headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), Origin: origin, ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) }, ...(body ? { body: form ? new URLSearchParams(body) : JSON.stringify(body) } : {}) });
    for (const entry of response.headers.getSetCookie()) { const [pair] = entry.split(';'); const index = pair.indexOf('='); const name = pair.slice(0, index); const value = pair.slice(index + 1); if (value) jar.set(name, value); else jar.delete(name); }
    return response;
  }
  async function appleSignIn(code) {
    const start = await request('/api/auth/oauth/apple/start', { method: 'POST', body: {} });
    assert.equal(start.status, 200);
    const url = new URL((await start.json()).url);
    tokens.set(code, await new SignJWT({ sub: 'apple-integration', email: 'apple@example.com', email_verified: true, nonce: url.searchParams.get('nonce') }).setProtectedHeader({ alg: 'RS256', kid: 'test-provider' }).setIssuer('https://appleid.apple.com').setAudience(env.APPLE_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(signing.privateKey));
    return request('/api/auth/oauth/apple/callback', { method: 'POST', form: true, origin: 'https://appleid.apple.com', body: { state: url.searchParams.get('state'), code } });
  }
  assert.equal((await request('/api/auth/oauth/apple/callback', { method: 'POST', form: true, origin: 'https://attacker.example', body: { state: 'bad' } })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', form: true, origin: 'https://appleid.apple.com', body: { email: 'a@example.com' } })).status, 403);
  assert.equal((await appleSignIn('first-code')).headers.get('location'), 'https://roamly.example/?auth=success');
  assert.equal((await request('/api/auth/me')).status, 200);
  const user = service.db.prepare('SELECT * FROM users WHERE email=?').get('apple@example.com');
  service.db.prepare("INSERT INTO security_settings(user_id,two_factor_enabled,two_factor_method) VALUES(?,1,'totp')").run(user.id);
  assert.equal((await appleSignIn('second-code')).headers.get('location'), 'https://roamly.example/?auth=two-factor');
  assert.equal((await request('/api/auth/me')).status, 401);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM auth_pending WHERE user_id=?').get(user.id).n, 1);
});
