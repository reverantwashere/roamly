import assert from 'node:assert/strict';
import test from 'node:test';
import { signOutAndLoadGuest } from './sessionRecovery.ts';

const guest = { user: { isGuest: true }, trips: [] };

test('load-error recovery signs out only the current session before loading a guest', async () => {
  const calls = [];
  const result = await signOutAndLoadGuest({ signOut: async (options) => { calls.push(['signOut', options]); return { error: null }; } }, async () => { calls.push(['loadSession']); return guest; });
  assert.deepEqual(calls, [['signOut', { scope: 'local' }], ['loadSession']]);
  assert.equal(result, guest);
});

test('remote logout errors still permit guest browsing when local credentials were cleared', async () => {
  const auth = { signOut: async () => ({ error: { message: 'Network unavailable' } }) };
  assert.equal(await signOutAndLoadGuest(auth, async () => guest), guest);
});

test('recovery does not report success while an authenticated session remains', async () => {
  const auth = { signOut: async () => ({ error: { message: 'Storage unavailable' } }) };
  await assert.rejects(signOutAndLoadGuest(auth, async () => ({ user: { isGuest: false } })), /could not sign you out/);
});

test('guest loading failure leaves a retryable error without leaking provider details', async () => {
  await assert.rejects(signOutAndLoadGuest({ signOut: async () => ({ error: null }) }, async () => { throw new Error('provider details'); }), /could not open guest browsing/);
  await assert.rejects(signOutAndLoadGuest({ signOut: async () => { throw new Error('storage details'); } }, async () => { throw new Error('provider details'); }), /could not sign you out/);
});
