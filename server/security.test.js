import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as OTPAuth from 'otpauth';
import { createApp } from './app.js';

const PASSWORD = 'safe-password-123';
const ORIGIN = 'http://localhost:5173';
const sha = (value) => createHash('sha256').update(value).digest();
async function setup(t, options = {}) {
  const emailDir = mkdtempSync(join(tmpdir(), 'roamly-security-'));
  const service = createApp({ dbPath: ':memory:', logErrors: false, emailVerificationRequired: false, resendApiKey: '', authEmailFrom: '', emailDir, ...options });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); service.close(); rmSync(emailDir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const cookies = new Map();
    return {
      get cookie() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); },
      async request(path, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(url + path, { method, headers: { cookie: this.cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        for (const value of response.headers.getSetCookie()) {
          const [name, ...rest] = value.split(';')[0].split('=');
          const content = rest.join('=');
          if (!content) cookies.delete(name); else cookies.set(name, content);
        }
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
    };
  }
  async function signup(address = 'maya@example.com') {
    const user = client();
    const response = await user.request('/api/auth/signup', { method: 'POST', body: { name: 'Maya', email: address, password: PASSWORD } });
    assert.equal(response.status, 201);
    return { user, id: response.data.user.id };
  }
  function emailCode(purpose) {
    return readdirSync(emailDir).map((name) => JSON.parse(readFileSync(join(emailDir, name), 'utf8'))).filter((mail) => mail.purpose === purpose).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.code;
  }
  return { ...service, client, signup, emailCode };
}
const post = (user, path, body = {}) => user.request(path, { method: 'POST', body });
function totpCode(secret, offset = 0) {
  return new OTPAuth.TOTP({ issuer: 'Roamly', label: 'test', algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset });
}
async function enableTotp(user) {
  const setup = await post(user, '/api/auth/2fa/setup', { method: 'totp' });
  assert.equal(setup.status, 200);
  const enabled = await post(user, '/api/auth/2fa/enable', { code: totpCode(setup.data.secret) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.recoveryCodes.length, 10);
  return { ...enabled.data, secret: setup.data.secret };
}

// Minimal CBOR encoding for a genuine software WebAuthn test authenticator.
function cbor(value) {
  const header = (major, n) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof value === 'number') return value >= 0 ? header(0, value) : header(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([header(2, value.length), value]);
  if (typeof value === 'string') return Buffer.concat([header(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (value instanceof Map) return Buffer.concat([header(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
  throw new Error('Unsupported test CBOR value.');
}
function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32);
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  let count = 0;
  const clientData = (type, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const authData = (flags, counter) => { const n = Buffer.alloc(4); n.writeUInt32BE(counter); return Buffer.concat([sha('localhost'), Buffer.from([flags]), n]); };
  return {
    id: id.toString('base64url'),
    register(options, origin = ORIGIN) {
      const credentialLength = Buffer.alloc(2); credentialLength.writeUInt16BE(id.length);
      const data = Buffer.concat([authData(0x45, 0), Buffer.alloc(16), credentialLength, id, cose]);
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {}, response: {
        clientDataJSON: clientData('webauthn.create', options.challenge, origin).toString('base64url'),
        attestationObject: cbor(new Map([['fmt', 'none'], ['authData', data], ['attStmt', new Map()]])).toString('base64url'), transports: ['internal'],
      } };
    },
    login(options, userId, { origin = ORIGIN, challenge = options.challenge, flags = 0x05, counter = ++count, badSignature = false } = {}) {
      const data = authData(flags, counter);
      const json = clientData('webauthn.get', challenge, origin);
      const signature = sign('sha256', Buffer.concat([data, sha(json)]), privateKey);
      if (badSignature) signature[signature.length - 1] ^= 0xff;
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {}, response: {
        clientDataJSON: json.toString('base64url'), authenticatorData: data.toString('base64url'), signature: signature.toString('base64url'), userHandle: Buffer.from(userId).toString('base64url'),
      } };
    },
  };
}
async function registerPasskey(user, auth = authenticator()) {
  const options = await post(user, '/api/auth/passkeys/register/options', { name: 'Test phone' });
  assert.equal(options.status, 200);
  assert.equal(options.data.authenticatorSelection.userVerification, 'required');
  assert.equal(options.data.authenticatorSelection.residentKey, 'required');
  const verified = await post(user, '/api/auth/passkeys/register/verify', { response: auth.register(options.data) });
  assert.equal(verified.status, 201, JSON.stringify(verified.data));
  return auth;
}

 test('TOTP requires confirmation, encrypts secrets, blocks primary-only sessions and replay; recovery codes are single use', async (t) => {
  const { signup, client, db } = await setup(t);
  const { user, id } = await signup();
  const oldCookie = user.cookie;
  const pending = await post(user, '/api/auth/2fa/setup', { method: 'totp' });
  assert.equal((await user.request('/api/auth/security')).data.twoFactorEnabled, false);
  assert.equal((await post(user, '/api/auth/2fa/enable', { code: 'bad' })).status, 400);
  const code = totpCode(pending.data.secret);
  const enabled = await post(user, '/api/auth/2fa/enable', { code });
  assert.equal(enabled.status, 200);
  const row = db.prepare('SELECT * FROM security_settings WHERE user_id=?').get(id);
  assert.equal(row.encrypted_totp.includes(pending.data.secret), false);
  assert.equal(row.pending_totp, null);
  assert.equal((await client().request('/api/auth/me', { headers: { cookie: oldCookie } })).status, 401);
  const login = client();
  const primary = await post(login, '/api/auth/login', { email: 'maya@example.com', password: PASSWORD });
  assert.equal(primary.data.requiresTwoFactor, true);
  assert.equal(primary.data.method, 'totp');
  assert.equal(primary.data.user, undefined);
  assert.equal((await login.request('/api/auth/me')).status, 401);
  assert.equal((await post(login, '/api/auth/2fa/verify', { code })).status, 400);
  assert.equal((await post(login, '/api/auth/2fa/verify', { code: enabled.data.recoveryCodes[0] })).data.user.id, id);
  assert.equal((await post(login, '/api/auth/2fa/verify', { code: enabled.data.recoveryCodes[1] })).status, 401);
  const another = client();
  await post(another, '/api/auth/login', { email: 'maya@example.com', password: PASSWORD });
  assert.equal((await post(another, '/api/auth/2fa/verify', { code: enabled.data.recoveryCodes[0] })).status, 400);
  assert.equal((await post(another, '/api/auth/2fa/verify', { code: totpCode(pending.data.secret, 30000) })).status, 200);
  const exported = JSON.stringify((await another.request('/api/account/export')).data);
  assert.equal(exported.includes(pending.data.secret), false);
  assert.equal(exported.includes('encrypted_totp'), false);
  assert.equal(exported.includes(enabled.data.recoveryCodes[1]), false);
});

test('email is the default optional second factor and its code is bound to the pending login', async (t) => {
  const { signup, client, emailCode, db } = await setup(t);
  const { user, id } = await signup();
  const configured = await post(user, '/api/auth/2fa/setup');
  assert.equal(configured.data.method, 'email');
  assert.equal(configured.data.delivery, 'development-file');
  const enabled = await post(user, '/api/auth/2fa/enable', { code: emailCode('two-factor-setup') });
  assert.equal(enabled.status, 200);
  const login = client();
  const result = await post(login, '/api/auth/login', { email: 'maya@example.com', password: PASSWORD });
  assert.equal(result.data.requiresTwoFactor, true);
  assert.equal(result.data.method, 'email');
  const code = emailCode('two-factor-login');
  assert.equal((await post(client(), '/api/auth/2fa/verify', { code })).status, 401);
  assert.equal((await login.request('/api/auth/me')).status, 401);
  assert.equal((await post(login, '/api/auth/2fa/verify', { code })).data.user.id, id);
  assert.equal((await post(login, '/api/auth/2fa/verify', { code })).status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM email_auth_codes WHERE user_id=? AND purpose='two-factor-login'").get(id).n, 0);
  assert.equal((await post(user, '/api/auth/2fa/action-code')).status, 200);
  assert.equal((await post(user, '/api/auth/2fa/disable', { code: emailCode('two-factor-action') })).status, 200);
  assert.equal((await login.request('/api/auth/me')).status, 401);
});

test('two-step attempts are capped, pending sessions expire, and destructive changes require recent authentication and a factor', async (t) => {
  const { signup, client, db } = await setup(t);
  const { user, id } = await signup();
  const { recoveryCodes } = await enableTotp(user);
  db.prepare('UPDATE sessions SET authenticated_at=0 WHERE user_id=?').run(id);
  assert.equal((await post(user, '/api/auth/2fa/disable', { code: recoveryCodes[0] })).status, 401);
  assert.equal((await post(user, '/api/auth/2fa/disable', { password: PASSWORD })).status, 400);
  const fresh = client();
  await post(fresh, '/api/auth/login', { email: 'maya@example.com', password: PASSWORD });
  db.prepare('UPDATE auth_pending SET expires_at=0 WHERE user_id=?').run(id);
  assert.equal((await post(fresh, '/api/auth/2fa/verify', { code: recoveryCodes[0] })).status, 401);
  await post(fresh, '/api/auth/login', { email: 'maya@example.com', password: PASSWORD });
  for (let n = 0; n < 8; n++) assert.equal((await post(fresh, '/api/auth/2fa/verify', { code: 'bad' })).status, 400);
  assert.equal((await post(fresh, '/api/auth/2fa/verify', { code: recoveryCodes[0] })).status, 401);
  assert.equal((await post(user, '/api/auth/2fa/disable', { password: PASSWORD, code: recoveryCodes[0] })).status, 200);
  assert.equal((await user.request('/api/auth/security')).data.twoFactorEnabled, false);
});

test('passkeys validate signed assertions, require user verification, consume challenges, and enforce TOTP after passkey authentication', async (t) => {
  const { signup, client, db } = await setup(t);
  const { user, id } = await signup();
  const auth = await registerPasskey(user);
  const fresh = client();
  const options = await post(fresh, '/api/auth/passkeys/login/options');
  const response = auth.login(options.data, id);
  const result = await post(fresh, '/api/auth/passkeys/login/verify', { response });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.user.id, id);
  assert.equal(db.prepare('SELECT counter FROM passkeys WHERE id=?').get(auth.id).counter, 1);
  assert.equal((await post(fresh, '/api/auth/passkeys/login/verify', { response })).status, 400);
  for (const manipulation of [{ origin: 'https://evil.example' }, { flags: 0x01 }, { challenge: 'wrong' }, { badSignature: true }, { counter: 1 }]) {
    const attacker = client();
    const challenge = await post(attacker, '/api/auth/passkeys/login/options');
    const invalid = auth.login(challenge.data, id, manipulation);
    assert.equal((await post(attacker, '/api/auth/passkeys/login/verify', { response: invalid })).status, 401);
    assert.equal((await attacker.request('/api/auth/me')).status, 401);
  }
  const twoFactor = await enableTotp(user);
  const protectedLogin = client();
  const newOptions = await post(protectedLogin, '/api/auth/passkeys/login/options');
  const protectedResult = await post(protectedLogin, '/api/auth/passkeys/login/verify', { response: auth.login(newOptions.data, id) });
  assert.equal(protectedResult.data.requiresTwoFactor, true);
  assert.equal((await protectedLogin.request('/api/auth/me')).status, 401);
  assert.equal((await post(protectedLogin, '/api/auth/2fa/verify', { code: twoFactor.recoveryCodes[0] })).status, 200);
});

test('passkey registration is session-bound, rejects expired or malformed requests, isolates accounts, and preserves last primary method', async (t) => {
  const { signup, client, db } = await setup(t);
  const { user, id } = await signup();
  const { user: other, id: otherId } = await signup('other@example.com');
  const auth = await registerPasskey(user);
  assert.equal((await other.request(`/api/auth/passkeys/${auth.id}`, { method: 'DELETE', body: {} })).status, 404);
  const staleOptions = await post(user, '/api/auth/passkeys/register/options');
  db.prepare('UPDATE auth_challenges SET expires_at=0 WHERE user_id=?').run(id);
  assert.equal((await post(user, '/api/auth/passkeys/register/verify', { response: authenticator().register(staleOptions.data) })).status, 400);
  const ownOptions = await post(user, '/api/auth/passkeys/register/options');
  const challengeCookie = user.cookie.split('; ').find((entry) => entry.startsWith('roamly_webauthn='));
  const confused = await other.request('/api/auth/passkeys/register/verify', { method: 'POST', body: { response: authenticator().register(ownOptions.data) }, headers: { cookie: `${other.cookie}; ${challengeCookie}` } });
  assert.equal(confused.status, 400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM passkeys WHERE user_id=?').get(otherId).n, 0);
  await post(user, '/api/auth/passkeys/register/options');
  assert.equal((await post(user, '/api/auth/passkeys/register/verify', { response: { id: 'broken' } })).status, 400);
  assert.equal((await post(user, '/api/auth/passkeys/register/verify', { response: { id: 'broken' } })).status, 400);
  const login = client();
  const options = await post(login, '/api/auth/passkeys/login/options');
  assert.equal((await post(login, '/api/auth/passkeys/login/verify', { response: auth.login(options.data, otherId) })).status, 401);
  db.prepare('UPDATE users SET password_hash=NULL WHERE id=?').run(id);
  assert.equal((await user.request(`/api/auth/passkeys/${auth.id}`, { method: 'DELETE', body: {} })).status, 409);
  db.prepare('INSERT INTO oauth_accounts VALUES (?,?,?,?,?)').run('google', 'test-subject', id, 'maya@example.com', new Date().toISOString());
  assert.equal((await user.request(`/api/auth/passkeys/${auth.id}`, { method: 'DELETE', body: {} })).status, 200);
});

test('production refuses ephemeral TOTP encryption and rejects insecure passkey origins', async (t) => {
  const previous = process.env.AUTH_ENCRYPTION_KEY;
  delete process.env.AUTH_ENCRYPTION_KEY;
  try { assert.throws(() => createApp({ dbPath: ':memory:', production: true }), /AUTH_ENCRYPTION_KEY/); }
  finally { if (previous !== undefined) process.env.AUTH_ENCRYPTION_KEY = previous; }
  const { client } = await setup(t, { production: true, authEncryptionKey: randomBytes(32), appOrigin: 'http://localhost:5173' });
  const options = await client().request('/api/auth/options');
  assert.equal(options.data.passkeys.configured, false);
  assert.equal((await post(client(), '/api/auth/passkeys/login/options')).status, 503);
});
