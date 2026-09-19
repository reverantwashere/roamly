import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHostedConfig } from './check-hosted-config.mjs';

const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
const ok = () => ({ ok: true, json: async () => ({ external: {}, disable_signup: false }) });

test('local Express builds skip network only when both variables are absent', async () => {
  assert.deepEqual(await checkHostedConfig({}, { fetchImpl: () => assert.fail('Unexpected network request') }), { skipped: true });
  for (const config of [{ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL }, { VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY }, { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }]) {
    await assert.rejects(checkHostedConfig(config), /Set both/);
  }
});

test('only a clean HTTPS project origin is accepted', async () => {
  for (const url of ['not a url', 'http://example.supabase.co', 'https://user:password@example.supabase.co', 'https://example.supabase.co/auth', 'https://example.supabase.co?key=secret', 'https://example.supabase.co#fragment', ' https://example.supabase.co']) {
    await assert.rejects(checkHostedConfig({ ...env, VITE_SUPABASE_URL: url }, { fetchImpl: () => assert.fail('Unexpected network request') }));
  }
  await assert.rejects(checkHostedConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: ' padded ' }), /whitespace/);
});

test('checks the actual configured auth origin with its public key and refuses redirects', async () => {
  let request;
  const result = await checkHostedConfig(env, { fetchImpl: async (url, options) => { request = { url: String(url), ...options }; return ok(); } });
  assert.deepEqual(result, { skipped: false });
  assert.equal(request.url, 'https://example.supabase.co/auth/v1/settings');
  assert.equal(request.headers.apikey, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(request.redirect, 'error');
  assert.ok(request.signal instanceof AbortSignal);
});

test('network and key failures stop builds without leaking configuration or provider response data', async () => {
  for (const fetchImpl of [async () => { throw new Error(`DNS failed ${env.VITE_SUPABASE_URL} ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`); }, async () => ({ ok: false, status: 401, text: async () => env.VITE_SUPABASE_PUBLISHABLE_KEY })]) {
    await assert.rejects(checkHostedConfig(env, { fetchImpl }), (error) => {
      assert.match(error.message, /configuration check/);
      assert.ok(!error.message.includes(env.VITE_SUPABASE_URL));
      assert.ok(!error.message.includes(env.VITE_SUPABASE_PUBLISHABLE_KEY));
      return true;
    });
  }
});

test('unresponsive auth endpoints are aborted and invalid responses fail closed', async () => {
  await assert.rejects(checkHostedConfig(env, { timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /timed out/);
  for (const json of [async () => { throw new Error('HTML response'); }, async () => null, async () => [], async () => ({})]) {
    await assert.rejects(checkHostedConfig(env, { fetchImpl: async () => ({ ok: true, json }) }), /valid auth settings/);
  }
});
