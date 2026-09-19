import assert from 'node:assert/strict';
import test from 'node:test';
import { createHostedApi } from './hostedApi.ts';

const alice = { id: 'alice', email: 'alice@example.test', user_metadata: { name: 'Alice' } };
const vehicle = { name: 'My car', type: 'Car', fuelType: 'Petrol', tankCapacity: 45, mileage: 20, odometer: 1000, fuelLevel: 50 };
const trip = { destination: 'Munnar', country: 'India', image: '/images/munnar.webp', startDate: '2026-09-20', days: 3, people: 2, budget: 5000, currency: 'INR', itinerary: [] };
function client({ user = alice, authError = null, rows = [], profiles = [], rpcResult = null, rpcError = null } = {}) {
  const calls = [], tables = { entities: structuredClone(rows), profiles: structuredClone(profiles) };
  const auth = {
    async getUser() { return { data: { user }, error: authError }; },
    async signOut(options) { calls.push(['signOut', options]); return { error: null }; },
  };
  function from(table) {
    let filters = [], page = null, single = false, write = null, failure = null;
    const query = {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      order() { return this; },
      range(start, end) { page = [start, end]; calls.push(['range', start, end]); return this; },
      maybeSingle() { single = true; return this; },
      upsert(data) { write = data; return this; },
      then(resolve, reject) {
        try {
          if (write) {
            calls.push(['upsert', table, write]);
            const old = tables[table].findIndex((row) => row.id === write.id);
            if (old >= 0) tables[table][old] = structuredClone(write); else tables[table].push(structuredClone(write));
            return Promise.resolve({ data: null, error: failure }).then(resolve, reject);
          }
          let data = tables[table].filter((row) => filters.every(([key, value]) => row[key] === value));
          if (page) data = data.slice(page[0], page[1] + 1);
          return Promise.resolve({ data: single ? data[0] || null : data, error: failure }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  }
  return { auth, from, calls, tables, async rpc(name, args) { calls.push(['rpc', name, args]); return { data: rpcResult, error: rpcError }; } };
}

const entity = (id, kind, data, owner = 'alice') => ({ id, kind, data, user_id: owner, created_at: '2026-09-19T00:00:00Z' });

test('hosted guests have no dummy data and cannot write, while network failures are not downgraded to guests', async () => {
  const missing = { name: 'AuthSessionMissingError', message: 'Auth session missing!' };
  const guestApi = createHostedApi(client({ user: null, authError: missing }));
  const session = await guestApi('/session');
  assert.equal(session.user.isGuest, true);
  assert.deepEqual(session.trips, []);
  assert.deepEqual(session.savedPlaces, []);
  await assert.rejects(guestApi('/vehicles', vehicle), /session could not be verified/);
  await assert.rejects(createHostedApi(client({ user: null, authError: { name: 'FetchError', message: 'Load failed' } }))('/session'), /session could not be loaded/);
  const anonymous = createHostedApi(client({ user: { ...alice, is_anonymous: true } }));
  assert.equal((await anonymous('/session')).user.isGuest, true);
  await assert.rejects(anonymous('/vehicles', vehicle), /Create an account/);
});

test('sessions load all owned records beyond one API page and use database IDs', async () => {
  const rows = Array.from({ length: 503 }, (_, index) => entity(`trip-${index}`, 'trips', { ...trip, id: 'spoofed' }));
  rows.push(entity('other', 'trips', trip, 'bob'), entity('saved', 'savedPlaces', { placeId: 'munnar' }));
  const fake = client({ rows, profiles: [{ id: 'alice', name: 'Alice', profile: { personality: 'A thoughtful mix', onboarded: true } }] });
  const session = await createHostedApi(fake)('/session');
  assert.equal(session.trips.length, 503);
  assert.equal(session.trips[0].id, 'trip-0');
  assert.equal(session.profile.personality, 'Ambivert');
  assert.deepEqual(session.savedPlaces, ['munnar']);
  assert.ok(fake.calls.some(([kind, offset]) => kind === 'range' && offset === 500));
});

test('hosted entity validation rejects impossible quantities before any write', async () => {
  const fake = client(), api = createHostedApi(fake);
  for (const mileage of [0, NaN, Infinity, -1]) await assert.rejects(api('/vehicles', { ...vehicle, mileage }), /Mileage/);
  await assert.rejects(api('/trips', { ...trip, days: 1.5 }), /Days/);
  await assert.rejects(api('/trips', { ...trip, startDate: '2026-02-30' }), /valid date/);
  await assert.rejects(api('/expenses', { title: 'Lunch', date: '2026-09-20', amount: -1 }), /Amount/);
  assert.equal(fake.calls.filter(([kind]) => kind === 'upsert').length, 0);
});

test('owned create and patch persist data; foreign entities and foreign related trips cannot be modified', async () => {
  const fake = client({ rows: [entity('car', 'vehicles', vehicle), entity('foreign-trip', 'trips', trip, 'bob'), entity('foreign-car', 'vehicles', vehicle, 'bob')] });
  const api = createHostedApi(fake);
  const created = (await api('/vehicles', vehicle)).vehicle;
  assert.equal(created.name, 'My car');
  assert.equal(created.isExample, false);
  const patched = (await api('/vehicles/car', { name: 'Updated', id: 'foreign-car' }, 'PATCH')).vehicle;
  assert.equal(patched.id, 'car');
  assert.equal(patched.name, 'Updated');
  await assert.rejects(api('/vehicles/foreign-car', { name: 'Hijack' }, 'PATCH'), /could not be found/);
  await assert.rejects(api('/expenses', { tripId: 'foreign-trip', title: 'Lunch', amount: 100, date: '2026-09-20', currency: 'INR' }), /could not be found/);
});

test('trip fuel estimates recompute when inputs change and cannot use invalid mileage', async () => {
  const fake = client({ rows: [entity('car', 'vehicles', vehicle)] }), api = createHostedApi(fake);
  const created = (await api('/trips', { ...trip, vehicleId: 'car', distanceKm: 200, fuelPricePerLitre: 100 })).trip;
  assert.equal(created.fuelEstimate.cost, 1000);
  const patched = (await api(`/trips/${created.id}`, { distanceKm: 400 }, 'PATCH')).trip;
  assert.equal(patched.fuelEstimate.cost, 2000);
  const detached = (await api(`/trips/${created.id}`, { vehicleId: '' }, 'PATCH')).trip;
  assert.equal(detached.fuelEstimate, undefined);
});

test('profile updates preserve existing metadata, validate phone, and normalize styles', async () => {
  const fake = client({ profiles: [{ id: 'alice', name: 'Alice', profile: { interests: ['Nature'], customMetadata: 'keep' } }] });
  const api = createHostedApi(fake);
  const { profile } = await api('/profile', { name: 'Alice', phone: '+971501234567', personality: 'Lively and social', visibility: 'Public' }, 'PUT');
  assert.equal(profile.personality, 'Extrovert');
  assert.equal(profile.customMetadata, 'keep');
  assert.equal(profile.visibility, 'Private');
  assert.equal(profile.onboarded, true);
  await assert.rejects(api('/profile', { phone: 'abc' }, 'PUT'), /international phone/);
});

test('fuel creation uses one atomic RPC and never performs a separate vehicle write', async () => {
  const input = { vehicleId: 'car', date: '2026-09-20', litres: 20, pricePerLitre: 100, odometer: 1400, fullTank: true, currency: 'INR' };
  const fake = client({ rpcResult: { fuelRecord: { ...input, measuredMileage: 20 }, vehicle: { ...vehicle, odometer: 1400 } } });
  const result = await createHostedApi(fake)('/fuel-records', input);
  assert.equal(result.vehicle.odometer, 1400);
  assert.deepEqual(fake.calls.map(([kind, name]) => [kind, name]), [['rpc', 'record_fuel']]);
  const failed = client({ rpcError: { code: 'P0001', message: 'Fuel added cannot exceed the vehicle tank capacity.' } });
  await assert.rejects(createHostedApi(failed)('/fuel-records', input), /tank capacity/);
  assert.equal(failed.calls.some(([kind]) => kind === 'upsert'), false);
  await assert.rejects(createHostedApi(fake)('/fuel-records', { ...input, odometer: NaN }), /Odometer/);
});

test('delete and saved-place toggle use server transactions; RPC errors do not report success', async () => {
  const fake = client({ rpcResult: ['munnar'] }), api = createHostedApi(fake);
  assert.deepEqual(await api('/saved-places', { placeId: 'munnar' }), { savedPlaces: ['munnar'] });
  await api('/vehicles/car', undefined, 'DELETE');
  assert.deepEqual(fake.calls.map(([kind, name]) => [kind, name]), [['rpc', 'toggle_saved_place'], ['rpc', 'delete_roamly_entity']]);
  const failed = createHostedApi(client({ rpcError: { code: '42501', message: 'permission denied' } }));
  await assert.rejects(failed('/trips/trip', undefined, 'DELETE'), /could not be deleted/);
});

test('account export contains owned data and account deletion clears the local session only after success', async () => {
  const fake = client({ rows: [entity('fill', 'fuelRecords', { litres: 20 }), entity('foreign', 'expenses', { amount: 500 }, 'bob')] });
  const api = createHostedApi(fake);
  const exported = await api('/account/export');
  assert.equal(exported.fuelRecords.length, 1);
  assert.equal(exported.expenses.length, 0);
  await api('/account', undefined, 'DELETE');
  assert.deepEqual(fake.calls.slice(-2), [['rpc', 'delete_my_account', undefined], ['signOut', { scope: 'local' }]]);
  const failed = client({ rpcError: { message: 'Unavailable' } });
  await assert.rejects(createHostedApi(failed)('/account', undefined, 'DELETE'), /could not be deleted/);
  assert.equal(failed.calls.some(([kind]) => kind === 'signOut'), false);
});
