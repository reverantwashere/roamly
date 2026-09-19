import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createApp } from './app.js';
import { installEmailAuth } from './email-auth.js';

async function setup(t, options = {}) {
  const emailDir = mkdtempSync(join(tmpdir(), 'roamly-email-'));
  const service = createApp({ dbPath: ':memory:', emailDir, logErrors: false, resendApiKey: '', authEmailFrom: '', ...options });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); service.close(); rmSync(emailDir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const cookies = new Map();
    return {
      get cookie() { return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '); },
      async request(path, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(url + path, {
          method, headers: { cookie: this.cookie, ...(['POST', 'PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : {}), ...headers },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        for (const setCookie of response.headers.getSetCookie()) {
          const [key, value] = setCookie.split(';')[0].split('=');
          if (value) cookies.set(key, value); else cookies.delete(key);
        }
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
    };
  }
  function emails(address) {
    return readdirSync(emailDir).map((file) => ({ ...JSON.parse(readFileSync(join(emailDir, file), 'utf8')), file: join(emailDir, file) }))
      .filter((item) => !address || item.to === address).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return { ...service, client, emails, emailDir };
}

const signup = (client, email = 'maya@example.com') => client.request('/api/auth/signup', { method: 'POST', body: { name: 'Maya', email, password: 'correct-horse-9' } });
const post = (client, path, body = {}) => client.request(path, { method: 'POST', body });

test('password signup requires an emailed code, retains guest work, and revokes the old session', async (t) => {
  const { client, db, emails } = await setup(t);
  const alice = client();
  const guest = (await alice.request('/api/session')).data;
  const oldCookie = alice.cookie;
  const result = await signup(alice);
  assert.equal(result.status, 201);
  assert.equal(result.data.requiresEmailVerification, true);
  assert.equal(result.data.delivery, 'development-file');
  assert.equal(result.data.emailHint, 'm***@example.com');
  assert.equal(result.data.user, undefined);
  assert.equal((await alice.request('/api/auth/me')).status, 401);
  assert.equal((await client().request('/api/auth/me', { headers: { cookie: oldCookie } })).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(guest.user.id).n, 0);
  const [message] = emails('maya@example.com');
  assert.match(message.code, /^\d{6}$/);
  assert.equal(statSync(message.file).mode & 0o777, 0o600);
  assert.equal(JSON.stringify(result.data).includes(message.code), false);
  const stored = db.prepare('SELECT * FROM email_auth_codes').get();
  assert.notEqual(stored.code_hash, message.code);
  assert.notEqual(stored.code_hash, createHash('sha256').update(message.code).digest('hex'));
  const verified = await post(alice, '/api/auth/email/verify', { code: message.code });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.user.id, guest.user.id);
  assert.equal(verified.data.trips[0].id, guest.trips[0].id);
  assert.ok(db.prepare('SELECT email_verified_at FROM users WHERE id=?').get(guest.user.id).email_verified_at);
  assert.equal((await alice.request('/api/auth/me')).status, 200);
  assert.equal((await post(alice, '/api/auth/email/verify', { code: message.code })).status, 401);
});

test('email codes are bound to the browser and cannot verify another account', async (t) => {
  const { client, emails } = await setup(t);
  const alice = client();
  const bob = client();
  await signup(alice, 'alice@example.com');
  await signup(bob, 'bob@example.com');
  const aliceCode = emails('alice@example.com')[0].code;
  const bobCode = emails('bob@example.com')[0].code;
  assert.equal((await post(client(), '/api/auth/email/verify', { code: aliceCode })).status, 401);
  // On the one-in-a-million chance of equal generated codes, use a different value.
  const foreignCode = aliceCode === bobCode ? `${(Number(aliceCode) + 1) % 1000000}`.padStart(6, '0') : aliceCode;
  assert.equal((await post(bob, '/api/auth/email/verify', { code: foreignCode, email: 'alice@example.com' })).status, 400);
  assert.equal((await post(alice, '/api/auth/email/verify', { code: aliceCode })).data.user.email, 'alice@example.com');
  assert.equal((await post(bob, '/api/auth/email/verify', { code: bobCode })).data.user.email, 'bob@example.com');
});

test('resending waits one minute, keeps the server-selected address, and expires the previous code', async (t) => {
  let clock = Date.now();
  const { client, emails, db } = await setup(t, { emailNow: () => clock });
  const alice = client();
  await signup(alice);
  const first = emails()[0];
  assert.equal((await post(alice, '/api/auth/email/resend', { email: 'attacker@example.com' })).status, 429);
  clock += 61000;
  const resent = await post(alice, '/api/auth/email/resend', { email: 'attacker@example.com' });
  assert.equal(resent.status, 200);
  assert.equal(emails().length, 2);
  assert.equal(emails().every((item) => item.to === 'maya@example.com'), true);
  const latest = emails().at(-1);
  if (first.code !== latest.code) assert.equal((await post(alice, '/api/auth/email/verify', { code: first.code })).status, 400);
  // Simulate an expired code while the restricted browser session remains valid.
  db.prepare('UPDATE email_auth_codes SET expires_at=?').run(clock - 1);
  assert.equal((await post(alice, '/api/auth/email/verify', { code: latest.code })).status, 400);
});

test('incorrect attempts are capped and persist across replacement codes', async (t) => {
  let clock = Date.now();
  const { client, emails } = await setup(t, { emailNow: () => clock });
  const alice = client();
  await signup(alice);
  for (let round = 0; round < 2; round += 1) {
    const code = emails().at(-1).code;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await post(alice, '/api/auth/email/verify', { code: wrong })).status, 400);
    assert.equal((await post(alice, '/api/auth/email/verify', { code })).status, 429);
    clock += 61000;
    assert.equal((await post(alice, '/api/auth/email/resend')).status, 200);
  }
  assert.equal((await post(alice, '/api/auth/email/verify', { code: emails().at(-1).code })).status, 429);
});

test('repeated delivery is limited per account rather than per browser challenge', async (t) => {
  let clock = Date.now();
  const { client, emails, db } = await setup(t, { emailNow: () => clock });
  const alice = client();
  await signup(alice);
  for (let index = 0; index < 4; index += 1) {
    clock += 61000;
    assert.equal((await post(alice, '/api/auth/email/resend')).status, 200);
  }
  clock += 61000;
  assert.equal((await post(alice, '/api/auth/email/resend')).status, 429);
  assert.equal(emails().length, 5);
  assert.equal(db.prepare("SELECT send_count FROM email_auth_limits WHERE purpose='verify-email'").get().send_count, 5);
  const freshBrowser = client();
  assert.equal((await post(freshBrowser, '/api/auth/login', { email: 'maya@example.com', password: 'correct-horse-9' })).status, 429);
  assert.equal(emails().length, 5);
});

test('delivery unavailable blocks signup before an account is created', async (t) => {
  const { client, db } = await setup(t, { devEmail: false, resendApiKey: '', authEmailFrom: '' });
  const alice = client();
  assert.equal((await signup(alice)).status, 503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_guest=0').get().n, 0);
  const response = await post(client(), '/api/auth/email/resend', { email: 'anyone@example.com' });
  assert.equal(response.status, 200);
  assert.equal(response.data.delivery, undefined);
});

function moduleHarness(t, options = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT,is_guest INTEGER,email_verified_at TEXT); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT);');
  db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('account', 'maya@example.com', 0, new Date().toISOString());
  const email = installEmailAuth(express(), { db, production: true, options, emailHmacKey: randomBytes(32), completePrimaryAuth() {}, revokeSession() {} });
  t.after(() => db.close());
  return { db, email };
}

test('production sends through Resend without exposing the code or provider credentials', async (t) => {
  let sent;
  const { db, email } = moduleHarness(t, {
    resendApiKey: 'server-only-test-key', authEmailFrom: 'Roamly <auth@example.com>',
    emailFetch: async (url, request) => { sent = { url, request, body: JSON.parse(request.body) }; return new Response('{}', { status: 200 }); },
  });
  const result = await email.sendCode({ userId: 'account', purpose: 'two-factor-login', binding: 'browser-A' });
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.request.headers.Authorization, 'Bearer server-only-test-key');
  assert.ok(sent.request.headers['Idempotency-Key']);
  assert.deepEqual(sent.body.to, ['maya@example.com']);
  assert.deepEqual(result, { emailHint: 'm***@example.com', delivery: 'email' });
  const code = sent.body.text.match(/code: (\d{6})/)[1];
  assert.equal(JSON.stringify(result).includes(code), false);
  assert.throws(() => email.verifyCode({ userId: 'account', purpose: 'verify-email', binding: 'browser-A', code }), { status: 400 });
  assert.throws(() => email.verifyCode({ userId: 'account', purpose: 'two-factor-login', binding: 'browser-B', code }), { status: 400 });
  assert.equal(email.verifyCode({ userId: 'account', purpose: 'two-factor-login', binding: 'browser-A', code }), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_auth_codes').get().n, 0);
  assert.throws(() => email.verifyCode({ userId: 'account', purpose: 'two-factor-login', binding: 'browser-A', code }), { status: 400 });
});

test('production never uses development email and failed provider delivery invalidates its code', async (t) => {
  const unavailable = moduleHarness(t, { devEmail: true, resendApiKey: '', authEmailFrom: '' });
  assert.deepEqual(unavailable.email.options(), { enabled: false, delivery: 'unavailable' });
  await assert.rejects(unavailable.email.sendCode({ userId: 'account', purpose: 'verify-email', binding: 'browser' }), { status: 503 });
  const failure = moduleHarness(t, {
    resendApiKey: 'test-key', authEmailFrom: 'auth@example.com',
    emailFetch: async () => new Response('Provider details and secret data', { status: 403 }),
  });
  await assert.rejects(failure.email.sendCode({ userId: 'account', purpose: 'verify-email', binding: 'browser' }), (error) => error.status === 503 && !error.message.includes('secret data'));
  assert.equal(failure.db.prepare('SELECT COUNT(*) AS n FROM email_auth_codes').get().n, 0);
});
