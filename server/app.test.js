import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.js';
import { createProviders, estimateFuel } from './providers.js';

async function setup(t, options = {}) {
  // These original CRUD tests focus on account ownership. The mandatory email
  // flow is exercised end to end by email-auth.test.js without this fixture flag.
  const service = createApp({ dbPath: ':memory:', logErrors: false, emailVerificationRequired: false, resendApiKey: '', authEmailFrom: '', ...options });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); service.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return {
      get cookie() { return cookie; },
      async request(path, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(url + path, {
          method, headers: { ...(cookie ? { cookie } : {}), ...(['POST', 'PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : {}), ...headers },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
    };
  }
  return { ...service, client, url };
}

const tripData = { destination: 'Lisbon', country: 'Portugal', startDate: '2026-10-09', days: 3, people: 2, budget: 1200, currency: 'EUR', itinerary: [] };
const vehicleData = { name: 'Road trip car', type: 'Car', fuelType: 'Petrol', tankCapacity: 50, mileage: 20, odometer: 10000, fuelLevel: 60 };

test('isolated guest sessions seed examples, persist profile, and protect mutation origins', async (t) => {
  const { client } = await setup(t);
  const alice = client();
  const bob = client();
  const a = await alice.request('/api/session');
  const b = await bob.request('/api/session');
  assert.equal(a.status, 200);
  assert.equal(a.data.user.isGuest, true);
  assert.notEqual(a.data.user.id, b.data.user.id);
  assert.notEqual(a.data.trips[0].id, b.data.trips[0].id);
  assert.equal(a.data.trips[0].isExample, true);
  assert.equal(a.data.profile.city, 'Kochi');
  assert.equal(a.data.profile.country, 'India');
  assert.equal(a.data.profile.currency, 'INR');
  assert.equal(a.data.trips[0].destination, 'Munnar');
  assert.equal(a.data.trips[0].budget, 12000);
  assert.equal(a.data.trips[0].itinerary.length, 3);
  assert.equal(a.data.trips[0].transport, 'Car');
  assert.equal(a.data.expenses.reduce((total, expense) => total + expense.amount, 0), 7800);
  assert.equal(a.data.expenses.every((expense) => expense.currency === 'INR' && expense.isExample), true);
  assert.match(a.headers.get('set-cookie'), /HttpOnly/);
  assert.match(a.headers.get('set-cookie'), /SameSite=Lax/);
  const change = await alice.request('/api/profile', { method: 'PUT', body: { name: 'Maya', currency: 'EUR', interests: ['Nature', 'Art'], notifications: { fuel: false, vehicle: false, weather: true, social: true } } });
  assert.equal(change.status, 200);
  assert.equal(change.data.profile.name, 'Maya');
  assert.equal(change.data.profile.notifications.vehicle, false);
  assert.equal(change.data.profile.notifications.weather, true);
  assert.equal(change.data.profile.notifications.social, true);
  assert.equal((await alice.request('/api/session')).data.profile.currency, 'EUR');
  assert.equal((await bob.request('/api/session')).data.profile.name, 'Alex');
  assert.equal((await alice.request('/api/profile', { method: 'PUT', body: { name: 'Changed' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await alice.request('/api/profile', { method: 'PUT', body: { currency: 'dollars' } })).status, 400);
  assert.equal((await client().request('/api/profile', { method: 'PUT', body: { name: 'No session' } })).status, 401);
});

test('signup preserves guest work, rotates session, passwords are hashed, login and logout isolate accounts', async (t) => {
  const { client, db } = await setup(t);
  const alice = client();
  const guest = (await alice.request('/api/session')).data;
  const originalCookie = alice.cookie;
  const signup = await alice.request('/api/auth/signup', { method: 'POST', body: { name: 'Maya', email: 'MAYA@example.com', password: 'correct-horse-9' } });
  assert.equal(signup.status, 201);
  assert.equal(signup.data.user.id, guest.user.id);
  assert.equal(signup.data.user.email, 'maya@example.com');
  assert.equal(signup.data.user.isGuest, false);
  assert.equal(signup.data.trips[0].id, guest.trips[0].id);
  assert.notEqual(alice.cookie, originalCookie);
  assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id=?').get(guest.user.id).password_hash, 'correct-horse-9');
  const stale = client();
  assert.equal((await stale.request('/api/auth/me', { headers: { cookie: originalCookie } })).status, 401);
  assert.equal((await alice.request('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await alice.request('/api/auth/me')).status, 401);
  const wrong = await alice.request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'incorrect-9' } });
  assert.equal(wrong.status, 401);
  const login = await alice.request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'correct-horse-9' } });
  assert.equal(login.data.user.id, guest.user.id);
  const bob = client();
  await bob.request('/api/session');
  const bobSignup = await bob.request('/api/auth/signup', { method: 'POST', body: { name: 'Bob', email: 'bob@example.com', password: 'bob-password' } });
  assert.notEqual(bobSignup.data.trips[0].id, guest.trips[0].id);
  assert.equal((await bob.request(`/api/trips/${guest.trips[0].id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await bob.request('/api/auth/signup', { method: 'POST', body: { name: 'Duplicate', email: 'Maya@example.com', password: 'duplicate-password' } })).status, 409);
});

test('trip CRUD, expenses, saved places, export, and account deletion persist and enforce ownership', async (t) => {
  const { client, db } = await setup(t);
  const alice = client();
  const bob = client();
  const session = (await alice.request('/api/session')).data;
  const foreign = (await bob.request('/api/session')).data;
  const created = await alice.request('/api/trips', { method: 'POST', body: tripData });
  assert.equal(created.status, 201);
  const id = created.data.trip.id;
  const edit = await alice.request(`/api/trips/${id}`, { method: 'PATCH', body: { budget: 1600, status: 'Completed' } });
  assert.equal(edit.data.trip.budget, 1600);
  assert.equal(edit.data.trip.destination, 'Lisbon');
  assert.equal(edit.data.trip.status, 'Completed');
  assert.equal((await alice.request(`/api/trips/${id}`, { method: 'PATCH', body: { status: 'Upcoming' } })).data.trip.status, 'Upcoming');
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: { ...tripData, days: -1 } })).status, 400);
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: { ...tripData, startDate: '2026-02-30' } })).status, 400);
  const expense = { tripId: id, title: 'Dinner', category: 'Food', amount: 65, currency: 'EUR', date: '2026-10-10', people: 2 };
  assert.equal((await alice.request('/api/expenses', { method: 'POST', body: { ...expense, tripId: foreign.trips[0].id } })).status, 404);
  assert.equal((await alice.request('/api/expenses', { method: 'POST', body: { ...expense, amount: -10 } })).status, 400);
  const added = await alice.request('/api/expenses', { method: 'POST', body: expense });
  assert.equal(added.status, 201);
  assert.equal((await alice.request('/api/saved-places', { method: 'POST', body: { placeId: 'lisbon' } })).data.savedPlaces.includes('lisbon'), true);
  assert.equal((await alice.request('/api/saved-places', { method: 'POST', body: { placeId: 'lisbon' } })).data.savedPlaces.includes('lisbon'), false);
  const exported = await alice.request('/api/account/export');
  assert.equal(exported.data.trips.some((trip) => trip.id === id), true);
  assert.equal(exported.data.expenses.some((item) => item.id === added.data.expense.id), true);
  assert.equal(JSON.stringify(exported.data).includes('password_hash'), false);
  assert.equal(JSON.stringify(exported.data).includes('token_hash'), false);
  assert.equal((await alice.request(`/api/trips/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await alice.request('/api/session')).data.expenses.some((item) => item.tripId === id), false);
  assert.equal((await alice.request('/api/account', { method: 'DELETE' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users WHERE id=?').get(session.user.id).count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM entities WHERE user_id=?').get(session.user.id).count, 0);
  assert.equal((await alice.request('/api/account/export')).status, 401);
  assert.notEqual((await alice.request('/api/session')).data.user.id, session.user.id);
});

test('vehicle validation, full-to-full fuel mileage including partial fills, and delete cascade', async (t) => {
  const { client } = await setup(t);
  const alice = client();
  await alice.request('/api/session');
  assert.equal((await alice.request('/api/vehicles', { method: 'POST', body: { ...vehicleData, fuelLevel: 110 } })).status, 400);
  const vehicle = (await alice.request('/api/vehicles', { method: 'POST', body: vehicleData })).data.vehicle;
  const fill = { vehicleId: vehicle.id, date: '2026-09-19', litres: 20, pricePerLitre: 2, odometer: 10000, fullTank: true, currency: 'USD' };
  const first = await alice.request('/api/fuel-records', { method: 'POST', body: fill });
  assert.equal(first.status, 201);
  assert.equal(first.data.fuelRecord.measuredMileage, null);
  assert.equal(first.data.fuelRecord.totalAmount, 40);
  assert.equal(first.data.vehicle.fuelLevel, 100);
  const partial = await alice.request('/api/fuel-records', { method: 'POST', body: { ...fill, date: '2026-09-20', litres: 10, odometer: 10200, fullTank: false } });
  assert.equal(partial.data.fuelRecord.measuredMileage, null);
  const second = await alice.request('/api/fuel-records', { method: 'POST', body: { ...fill, date: '2026-09-21', litres: 15, odometer: 10500 } });
  assert.equal(second.data.fuelRecord.measuredMileage, 20);
  assert.equal(second.data.vehicle.odometer, 10500);
  assert.equal((await alice.request('/api/fuel-records', { method: 'POST', body: fill })).status, 400);
  assert.equal((await alice.request('/api/fuel-records')).data.fuelRecords.length, 3);
  assert.equal((await alice.request(`/api/vehicles/${vehicle.id}`, { method: 'PATCH', body: { mileage: 21 } })).data.vehicle.mileage, 21);
  await alice.request(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' });
  assert.equal((await alice.request('/api/fuel-records')).data.fuelRecords.length, 0);
});

test('vehicle-linked trip estimates validate ownership, use server mileage, and remain stable after vehicle deletion', async (t) => {
  const { client } = await setup(t);
  const alice = client();
  const bob = client();
  const a = (await alice.request('/api/session')).data;
  const b = (await bob.request('/api/session')).data;
  const plan = { ...tripData, currency: 'INR', vehicleId: a.vehicles[0].id, distanceKm: 170, fuelPricePerLitre: 105 };
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: { ...plan, vehicleId: b.vehicles[0].id } })).status, 404);
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: { ...plan, distanceKm: 0 } })).status, 400);
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: { ...plan, fuelPricePerLitre: -1 } })).status, 400);
  const missingPrice = { ...plan };
  delete missingPrice.fuelPricePerLitre;
  assert.equal((await alice.request('/api/trips', { method: 'POST', body: missingPrice })).status, 400);
  const created = await alice.request('/api/trips', { method: 'POST', body: { ...plan, fuelEstimate: { cost: 1, mileage: 9999 } } });
  assert.equal(created.status, 201);
  const trip = created.data.trip;
  assert.equal(trip.vehicleId, a.vehicles[0].id);
  assert.equal(trip.fuelPricePerLitre, 105);
  assert.deepEqual(trip.fuelEstimate, { litres: 10, cost: 1050, currency: 'INR', mileage: 17, provenance: 'ESTIMATED', vehicleIsExample: true });
  const changed = await alice.request(`/api/trips/${trip.id}`, { method: 'PATCH', body: { fuelPricePerLitre: 100 } });
  assert.equal(changed.data.trip.fuelEstimate.cost, 1000);
  assert.equal((await alice.request(`/api/trips/${trip.id}`, { method: 'PATCH', body: { vehicleId: b.vehicles[0].id } })).status, 404);
  await alice.request(`/api/vehicles/${a.vehicles[0].id}`, { method: 'DELETE' });
  const completed = await alice.request(`/api/trips/${trip.id}`, { method: 'PATCH', body: { status: 'Completed', fuelEstimate: { cost: 0 } } });
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.data.trip.fuelEstimate, changed.data.trip.fuelEstimate);
  const removed = await alice.request(`/api/trips/${trip.id}`, { method: 'PATCH', body: { vehicleId: '' } });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.trip.fuelEstimate, undefined);
  assert.equal(removed.data.trip.fuelPricePerLitre, undefined);
  const simple = await alice.request('/api/trips', { method: 'POST', body: tripData });
  assert.equal(simple.status, 201);
  assert.equal(simple.data.trip.fuelEstimate, undefined);
});

test('password resets deliver only to dev files, are single-use, and revoke previous sessions', async (t) => {
  const emailDir = mkdtempSync(join(tmpdir(), 'roamly-mail-'));
  t.after(() => rmSync(emailDir, { recursive: true, force: true }));
  const { client } = await setup(t, { emailDir });
  const alice = client();
  await alice.request('/api/session');
  await alice.request('/api/auth/signup', { method: 'POST', body: { name: 'Maya', email: 'maya@example.com', password: 'old-password-9' } });
  const response = await alice.request('/api/auth/forgot-password', { method: 'POST', body: { email: 'maya@example.com' } });
  const unknown = await alice.request('/api/auth/forgot-password', { method: 'POST', body: { email: 'unknown@example.com' } });
  assert.deepEqual(response.data, unknown.data);
  assert.equal(response.data.token, undefined);
  assert.equal(readdirSync(emailDir).length, 1);
  const mail = JSON.parse(readFileSync(join(emailDir, readdirSync(emailDir)[0]), 'utf8'));
  const token = new URL(mail.url).searchParams.get('resetToken');
  const reset = await alice.request('/api/auth/reset-password', { method: 'POST', body: { token, password: 'new-password-9' } });
  assert.equal(reset.status, 200);
  assert.equal((await alice.request('/api/auth/me')).status, 401);
  assert.equal((await alice.request('/api/auth/reset-password', { method: 'POST', body: { token, password: 'another-password-9' } })).status, 400);
  assert.equal((await alice.request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'old-password-9' } })).status, 401);
  assert.equal((await alice.request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'new-password-9' } })).status, 200);
});

test('login attempts are limited and configured provider boundaries disclose unavailable data', async (t) => {
  const { client } = await setup(t);
  const user = client();
  let response;
  for (let i = 0; i < 13; i++) response = await user.request('/api/auth/login', { method: 'POST', body: { email: 'absent@example.com', password: 'wrong-password' } });
  assert.equal(response.status, 429);
  const providers = (await user.request('/api/providers')).data.providers;
  assert.equal(providers.weather.configured, false);
  assert.equal(providers.weather.provenance, 'UNAVAILABLE');
  assert.equal((await createProviders().weather.get()).data, null);
  const estimate = estimateFuel({ distanceKm: 350, mileage: 20, pricePerLitre: 1.5, tankCapacity: 50, fuelLevel: 50 });
  assert.equal(estimate.litres, 17.5);
  assert.equal(estimate.cost, 26.25);
  assert.equal(estimate.remainingRangeKm, 500);
  assert.equal(estimate.provenance, 'ESTIMATED');
  assert.throws(() => estimateFuel({ distanceKm: 10, mileage: 0, pricePerLitre: 1, tankCapacity: 50, fuelLevel: 50 }));
});

test('file-backed SQLite retains account and entities after restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'roamly-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'roamly.sqlite');
  const first = createApp({ dbPath });
  const server = first.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session`);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const before = await response.json();
  await new Promise((resolve) => server.close(resolve));
  first.close();
  const after = await setup(t, { dbPath });
  const responseAfter = await after.client().request('/api/session', { headers: { cookie } });
  assert.equal(responseAfter.data.user.id, before.user.id);
  assert.equal(responseAfter.data.trips[0].id, before.trips[0].id);
});
