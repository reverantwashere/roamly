import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { exampleProfile, exampleEntities } from './seeds.js';
import { createProviders } from './providers.js';
import { installSecurity } from './security.js';
import { installOAuthRoutes } from './oauth.js';
import { installEmailAuth } from './email-auth.js';

const scrypt = promisify(scryptCallback);
const COOKIE = 'roamly_session';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function string(value, label, max = 120, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw fail(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function number(value, label, min = 0, max = 10000000, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw fail(`${label} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
  }
  return value;
}
function currency(value = 'INR') {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw fail('Currency must be a three-letter uppercase code.');
  return value;
}
function date(value, label = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail(`${label} must be a valid date (YYYY-MM-DD).`);
  return value;
}
function email(value) {
  const result = string(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw fail('Enter a valid email address.');
  return result;
}
function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw fail('Password must be between 8 and 128 characters.');
  return value;
}
async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(value, stored) {
  const [salt, hash] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await scrypt(value, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected) && Boolean(stored);
}

function validateProfile(input, current) {
  const result = { ...current };
  for (const key of ['name', 'city', 'country', 'personality', 'group', 'transport', 'language', 'visibility']) {
    if (own(input, key)) result[key] = string(input[key], key, 120, key === 'city');
  }
  if (own(input, 'currency')) result.currency = currency(input.currency);
  if (own(input, 'budget')) result.budget = typeof input.budget === 'number' ? number(input.budget, 'Budget') : string(input.budget, 'Budget', 80);
  if (own(input, 'interests')) {
    if (!Array.isArray(input.interests) || input.interests.length > 20) throw fail('Choose up to 20 interests.');
    result.interests = [...new Set(input.interests.map((v) => string(v, 'Interest', 60)))];
  }
  if (own(input, 'notifications')) {
    if (!input.notifications || typeof input.notifications !== 'object' || Array.isArray(input.notifications)) throw fail('Notification preferences must be an object.');
    result.notifications = { ...current.notifications };
    for (const key of ['trips', 'vehicle', 'fuel', 'recommendations', 'weather', 'maintenance', 'social']) {
      if (own(input.notifications, key)) {
        if (typeof input.notifications[key] !== 'boolean') throw fail('Notification settings must be true or false.');
        result.notifications[key] = input.notifications[key];
      }
    }
  }
  return result;
}

function validateTrip(input) {
  const trip = {
    destination: string(input.destination, 'Destination'), country: string(input.country, 'Country', 120, true),
    image: string(input.image, 'Image URL', 1000, true), startDate: date(input.startDate, 'Start date'),
    days: number(input.days, 'Days', 1, 60, true), people: number(input.people, 'People', 1, 100, true),
    budget: number(input.budget ?? 0, 'Budget'), currency: currency(input.currency),
    group: string(input.group ?? 'Solo', 'Travel group', 50), personality: string(input.personality ?? 'Flexible', 'Travel style', 80),
    transport: string(input.transport ?? 'Flexible', 'Transport', 80), status: string(input.status ?? 'Upcoming', 'Status', 30),
    distanceKm: number(input.distanceKm ?? 0, 'Distance', 0, 100000),
  };
  if (own(input, 'vehicleId')) trip.vehicleId = string(input.vehicleId, 'Vehicle ID', 100, true);
  if (own(input, 'fuelPricePerLitre')) trip.fuelPricePerLitre = number(input.fuelPricePerLitre, 'Fuel price per litre', 0, 100000);
  if (trip.image && !/^(https:\/\/|\/images\/)/.test(trip.image)) throw fail('Image must use HTTPS or a local image path.');
  if (input.itinerary !== undefined) {
    if (!Array.isArray(input.itinerary) || input.itinerary.length > 60 || JSON.stringify(input.itinerary).length > 60000) throw fail('Itinerary is too large.');
    for (const day of input.itinerary) {
      if (!day || typeof day !== 'object' || Array.isArray(day)) throw fail('Each itinerary day must be an object.');
      number(day.day, 'Itinerary day', 1, 60, true);
      if (!Array.isArray(day.activities) || day.activities.length > 30) throw fail('Each itinerary day needs up to 30 activities.');
      for (const activity of day.activities) {
        if (!activity || typeof activity !== 'object' || Array.isArray(activity)) throw fail('Each activity must be an object.');
        string(activity.title ?? activity.name, 'Activity title', 200);
      }
    }
  }
  trip.itinerary = input.itinerary ?? [];
  return trip;
}
function validateVehicle(input) {
  return {
    name: string(input.name, 'Vehicle name'), type: string(input.type ?? 'Car', 'Vehicle type', 40),
    fuelType: string(input.fuelType ?? 'Petrol', 'Fuel type', 40),
    tankCapacity: number(input.tankCapacity, 'Tank capacity', 0.1, 1000),
    mileage: number(input.mileage, 'Mileage', 0.1, 1000), odometer: number(input.odometer ?? 0, 'Odometer', 0, 10000000),
    fuelLevel: number(input.fuelLevel ?? 100, 'Fuel level', 0, 100),
  };
}
function validateExpense(input) {
  return {
    tripId: string(input.tripId, 'Trip ID', 100, true), title: string(input.title, 'Expense title'),
    category: string(input.category ?? 'Other', 'Category', 60), amount: number(input.amount, 'Amount', 0.01),
    currency: currency(input.currency), date: date(input.date), people: number(input.people ?? 1, 'People', 1, 100, true),
  };
}
function validateFuel(input) {
  const litres = number(input.litres, 'Litres', 0.01, 1000);
  const pricePerLitre = number(input.pricePerLitre, 'Price per litre', 0, 100000);
  if (input.fullTank !== undefined && typeof input.fullTank !== 'boolean') throw fail('Full tank must be true or false.');
  return {
    vehicleId: string(input.vehicleId, 'Vehicle ID', 100), date: date(input.date),
    fuelType: string(input.fuelType ?? 'Petrol', 'Fuel type', 40), litres, pricePerLitre,
    totalAmount: Math.round(litres * pricePerLitre * 100) / 100, odometer: number(input.odometer, 'Odometer'),
    fullTank: input.fullTank ?? true, currency: currency(input.currency),
  };
}

export function createApp(options = {}) {
  const dbPath = options.dbPath ?? resolve('.data/roamly.sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, password_hash TEXT,
      is_guest INTEGER NOT NULL DEFAULT 1, profile TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entities_user_kind ON entities(user_id, kind);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
  `);
  // SQLite migrations preserve existing beta accounts and sessions.
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name));
  if (!sessionColumns.has('authenticated_at')) db.exec('ALTER TABLE sessions ADD COLUMN authenticated_at INTEGER NOT NULL DEFAULT 0');
  if (!sessionColumns.has('method')) db.exec("ALTER TABLE sessions ADD COLUMN method TEXT NOT NULL DEFAULT 'legacy'");
  db.exec('CREATE TABLE IF NOT EXISTS auth_attempts (identifier TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL)');
  const app = express();
  const providers = createProviders(options.providers);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const appOrigin = options.appOrigin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const entities = (userId, kind) => db.prepare('SELECT data FROM entities WHERE user_id=? AND kind=? ORDER BY created_at, id').all(userId, kind).map((row) => JSON.parse(row.data));
  const getEntity = (userId, kind, id) => {
    const row = db.prepare('SELECT data FROM entities WHERE user_id=? AND kind=? AND id=?').get(userId, kind, id);
    if (!row) throw fail('This item could not be found.', 404);
    return JSON.parse(row.data);
  };
  function setTripFuelEstimate(userId, trip, input, previous) {
    // An estimate is a saved planning snapshot, independent of subsequent vehicle edits or deletion.
    if (!trip.vehicleId) {
      delete trip.fuelPricePerLitre;
      return;
    }
    const changed = !previous || ['vehicleId', 'fuelPricePerLitre', 'distanceKm', 'currency'].some((key) => own(input, key) && trip[key] !== previous[key]);
    if (!changed && previous.fuelEstimate) {
      trip.fuelEstimate = previous.fuelEstimate;
      return;
    }
    const vehicle = getEntity(userId, 'vehicles', trip.vehicleId);
    if (trip.distanceKm <= 0) throw fail('Enter a distance greater than zero to estimate trip fuel.');
    const price = number(trip.fuelPricePerLitre, 'Fuel price per litre', 0, 100000);
    const litres = trip.distanceKm / vehicle.mileage;
    trip.fuelEstimate = {
      litres, cost: litres * price, currency: trip.currency, mileage: vehicle.mileage,
      provenance: 'ESTIMATED', vehicleIsExample: Boolean(vehicle.isExample),
    };
  }
  const addEntity = (userId, kind, data) => {
    const item = { ...data, id: randomUUID() };
    db.prepare('INSERT INTO entities VALUES (?,?,?,?,?)').run(item.id, userId, kind, JSON.stringify(item), new Date().toISOString());
    return item;
  };
  const payload = (userId) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    return {
      user: { id: user.id, name: user.name, email: user.email, isGuest: Boolean(user.is_guest) }, profile: JSON.parse(user.profile),
      trips: entities(userId, 'trips'), vehicles: entities(userId, 'vehicles'), expenses: entities(userId, 'expenses'),
      savedPlaces: entities(userId, 'savedPlaces').map((item) => item.placeId),
    };
  };
  function setSession(res, userId, oldToken, method = 'password') {
    if (oldToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(oldToken));
    const token = randomBytes(32).toString('base64url');
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,authenticated_at,method) VALUES (?,?,?,?,?)').run(sha(token), userId, Date.now() + maxAge, method === 'guest' ? 0 : Date.now(), method);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge });
  }
  function makeGuest(res) {
    const id = randomUUID();
    const profile = exampleProfile();
    const seed = exampleEntities();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO users (id,name,email,password_hash,is_guest,profile,created_at) VALUES (?,?,?,?,?,?,?)').run(id, profile.name, null, null, 1, JSON.stringify(profile), new Date().toISOString());
      for (const kind of ['trips', 'vehicles', 'expenses']) for (const item of seed[kind]) {
        db.prepare('INSERT INTO entities VALUES (?,?,?,?,?)').run(item.id, id, kind, JSON.stringify(item), new Date().toISOString());
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    setSession(res, id, undefined, 'guest');
    return id;
  }
  function rateLimit(req, key, limit = 12) {
    const now = Date.now();
    const identifier = sha(`${key}:${req.ip}`);
    db.prepare('DELETE FROM auth_attempts WHERE until_at<=?').run(now);
    const previous = db.prepare('SELECT count,until_at FROM auth_attempts WHERE identifier=?').get(identifier);
    const entry = previous ?? { count: 0, until_at: now + 15 * 60 * 1000 };
    db.prepare('INSERT INTO auth_attempts VALUES (?,?,?) ON CONFLICT(identifier) DO UPDATE SET count=excluded.count,until_at=excluded.until_at').run(identifier, entry.count + 1, entry.until_at);
    if (entry.count >= limit) throw fail('Too many attempts. Please try again in 15 minutes.', 429);
  }
  function revokeSession(req, res) {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(req.sessionToken));
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' });
  }
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Apple's signed form_post callback is the only cross-site form endpoint. Its state and nonce are verified by the OAuth module.
      const appleCallback = req.method === 'POST' && req.path === '/auth/oauth/apple/callback' && req.is('application/x-www-form-urlencoded') && (!req.get('origin') || req.get('origin') === 'https://appleid.apple.com');
      if (appleCallback) return next();
      const origin = req.get('origin');
      const allowed = appOrigin ? [appOrigin] : [`${req.protocol}://${req.get('host')}`];
      if (!production && !options.appOrigin && !process.env.APP_ORIGIN) allowed.push('http://localhost:5173', 'http://127.0.0.1:5173');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) return next(fail('This request origin is not allowed.', 403));
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return next(fail('Use application/json for this request.', 415));
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (req, res, next) => {
    const entry = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
    req.sessionToken = entry?.slice(COOKIE.length + 1);
    if (req.sessionToken) {
      const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(sha(req.sessionToken), Date.now());
      if (session) req.userId = session.user_id;
    }
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(fail('Request body must be an object.'));
    req.body ??= {};
    next();
  });
  const signedIn = (req, res, next) => req.userId ? next() : next(fail('Your session has expired. Please refresh and try again.', 401));

  let emailAuth;
  const security = installSecurity(app, { db, production, appOrigin, options, dbPath, fail, rateLimit, payload, setSession, revokeSession, checkPassword, getEmailAuth: () => emailAuth });
  const { completePrimaryAuth, requireAccount, requireRecentAuth, requireDestructiveAuth } = security;
  emailAuth = installEmailAuth(app, { db, production, appOrigin, options, fail, rateLimit, completePrimaryAuth, revokeSession, requireAccount, requireRecentAuth, emailHmacKey: security.emailHmacKey });
  const oauth = installOAuthRoutes(app, { db, production, appOrigin, fail, rateLimit, payload, setSession, completePrimaryAuth, requireAccount, requireRecentAuth, requireDestructiveAuth, hashPassword, checkPassword, makeGuest, oauth: options.oauth });
  app.get('/api/auth/options', (req, res) => res.json({ ...oauth.options(), passkeys: security.options(), email: emailAuth.options() }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/session', (req, res) => res.json(payload(req.userId || makeGuest(res))));
  app.get('/api/auth/me', signedIn, (req, res) => res.json(payload(req.userId)));
  app.post('/api/auth/signup', async (req, res) => {
    rateLimit(req, 'signup', 10);
    const name = string(req.body.name, 'Name', 100);
    const address = email(req.body.email);
    const secret = password(req.body.password);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(address)) throw fail('An account with this email already exists.', 409);
    if (options.emailVerificationRequired !== false) emailAuth.assertAvailable();
    const hash = await hashPassword(secret);
    const existing = req.userId && db.prepare('SELECT is_guest, profile FROM users WHERE id=?').get(req.userId);
    const userId = existing?.is_guest ? req.userId : randomUUID();
    const profile = existing?.is_guest ? { ...JSON.parse(existing.profile), name } : { ...exampleProfile(), name };
    if (existing?.is_guest) db.prepare('UPDATE users SET name=?,email=?,password_hash=?,is_guest=0,profile=? WHERE id=?').run(name, address, hash, JSON.stringify(profile), userId);
    else db.prepare('INSERT INTO users (id,name,email,password_hash,is_guest,profile,created_at) VALUES (?,?,?,?,?,?,?)').run(userId, name, address, hash, 0, JSON.stringify(profile), new Date().toISOString());
    res.status(201).json(await completePrimaryAuth(req, res, userId, 'password'));
  });
  app.post('/api/auth/login', async (req, res) => {
    rateLimit(req, 'login');
    const address = email(req.body.email);
    const secret = password(req.body.password);
    const user = db.prepare('SELECT * FROM users WHERE email=? AND is_guest=0').get(address);
    if (!await checkPassword(secret, user?.password_hash)) throw fail('Email or password is incorrect.', 401);
    res.json(await completePrimaryAuth(req, res, user.id, 'password'));
  });
  app.post('/api/auth/logout', (req, res) => {
    revokeSession(req, res);
    security.clearPending(req, res);
    res.json({ ok: true });
  });
  app.post('/api/auth/forgot-password', (req, res) => {
    rateLimit(req, 'password-reset', 5);
    const address = email(req.body.email);
    const user = db.prepare('SELECT id FROM users WHERE email=? AND is_guest=0').get(address);
    const devEmail = options.devEmail ?? !production;
    if (user && devEmail) {
      const token = randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);
      db.prepare('INSERT INTO password_resets VALUES (?,?,?)').run(sha(token), user.id, Date.now() + 15 * 60 * 1000);
      const emailDir = options.emailDir ?? resolve('.data/mail-outbox');
      mkdirSync(emailDir, { recursive: true, mode: 0o700 });
      const url = `${appOrigin ?? 'http://localhost:5173'}/?resetToken=${encodeURIComponent(token)}`;
      writeFileSync(resolve(emailDir, `${randomUUID()}.json`), JSON.stringify({ to: address, subject: 'Reset your Roamly password', url, expiresInMinutes: 15 }, null, 2), { mode: 0o600 });
    }
    res.json({ ok: true, message: devEmail ? 'If the account exists, a password reset has been written to the local development email directory. No email is sent.' : 'Email delivery has not been configured. Contact the service administrator.', delivery: devEmail ? 'development-file' : 'unavailable' });
  });
  app.post('/api/auth/reset-password', async (req, res) => {
    rateLimit(req, 'reset-complete', 10);
    const token = string(req.body.token, 'Reset token', 200);
    const secret = password(req.body.password);
    const reset = db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?').get(sha(token), Date.now());
    if (!reset) throw fail('This reset link is invalid or has expired.');
    const hash = await hashPassword(secret);
    db.exec('BEGIN');
    try {
      const valid = db.prepare('DELETE FROM password_resets WHERE token_hash=? AND expires_at>?').run(sha(token), Date.now());
      if (!valid.changes) throw fail('This reset link has already been used.');
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, reset.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
      db.prepare('DELETE FROM auth_pending WHERE user_id=?').run(reset.user_id);
      db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(reset.user_id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ ok: true, message: 'Password updated. Log in with your new password.' });
  });

  app.put('/api/profile', signedIn, (req, res) => {
    const current = JSON.parse(db.prepare('SELECT profile FROM users WHERE id=?').get(req.userId).profile);
    const profile = validateProfile(req.body, current);
    db.prepare('UPDATE users SET profile=?,name=? WHERE id=?').run(JSON.stringify(profile), profile.name, req.userId);
    res.json({ profile });
  });
  for (const [kind, singular, validate] of [['trips', 'trip', validateTrip], ['vehicles', 'vehicle', validateVehicle], ['expenses', 'expense', validateExpense]]) {
    app.get(`/api/${kind}`, signedIn, (req, res) => res.json({ [kind]: entities(req.userId, kind) }));
    app.post(`/api/${kind}`, signedIn, (req, res) => {
      const data = validate(req.body);
      if (kind === 'trips') setTripFuelEstimate(req.userId, data, req.body);
      if (kind === 'expenses' && data.tripId) getEntity(req.userId, 'trips', data.tripId);
      const item = addEntity(req.userId, kind, { ...data, provenance: 'USER-PROVIDED', isExample: false });
      res.status(201).json({ [singular]: item });
    });
    app.patch(`/api/${kind}/:id`, signedIn, (req, res) => {
      const existing = getEntity(req.userId, kind, req.params.id);
      const data = validate({ ...existing, ...req.body });
      if (kind === 'trips') setTripFuelEstimate(req.userId, data, req.body, existing);
      if (kind === 'expenses' && data.tripId) getEntity(req.userId, 'trips', data.tripId);
      const item = { ...data, id: existing.id, provenance: 'USER-PROVIDED', isExample: false };
      db.prepare('UPDATE entities SET data=? WHERE user_id=? AND kind=? AND id=?').run(JSON.stringify(item), req.userId, kind, item.id);
      res.json({ [singular]: item });
    });
    app.delete(`/api/${kind}/:id`, signedIn, (req, res) => {
      getEntity(req.userId, kind, req.params.id);
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM entities WHERE user_id=? AND kind=? AND id=?').run(req.userId, kind, req.params.id);
        const relatedKind = kind === 'trips' ? 'expenses' : kind === 'vehicles' ? 'fuelRecords' : null;
        if (relatedKind) {
          const field = kind === 'trips' ? 'tripId' : 'vehicleId';
          for (const item of entities(req.userId, relatedKind)) if (item[field] === req.params.id) db.prepare('DELETE FROM entities WHERE id=? AND user_id=?').run(item.id, req.userId);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      res.json({ ok: true });
    });
  }
  app.post('/api/saved-places', signedIn, (req, res) => {
    const placeId = string(req.body.placeId, 'Place ID', 100);
    const existing = entities(req.userId, 'savedPlaces').find((item) => item.placeId === placeId);
    if (existing) db.prepare('DELETE FROM entities WHERE user_id=? AND id=?').run(req.userId, existing.id);
    else addEntity(req.userId, 'savedPlaces', { placeId });
    res.json({ savedPlaces: entities(req.userId, 'savedPlaces').map((item) => item.placeId) });
  });
  app.get('/api/fuel-records', signedIn, (req, res) => res.json({ fuelRecords: entities(req.userId, 'fuelRecords') }));
  app.post('/api/fuel-records', signedIn, (req, res) => {
    const data = validateFuel(req.body);
    const vehicle = getEntity(req.userId, 'vehicles', data.vehicleId);
    if (data.odometer < vehicle.odometer) throw fail('Odometer cannot be lower than the vehicle’s current reading.');
    if (data.litres > vehicle.tankCapacity) throw fail('Fuel added cannot exceed the vehicle tank capacity.');
    const records = entities(req.userId, 'fuelRecords').filter((record) => record.vehicleId === data.vehicleId).sort((a, b) => a.odometer - b.odometer);
    if (records.length && data.date < records.at(-1).date) throw fail('Fuel records must be recorded in chronological order.');
    const lastFullIndex = records.findLastIndex((record) => record.fullTank);
    let measuredMileage = null;
    if (data.fullTank && lastFullIndex >= 0) {
      const distance = data.odometer - records[lastFullIndex].odometer;
      const consumedLitres = records.slice(lastFullIndex + 1).reduce((sum, record) => sum + record.litres, data.litres);
      if (distance > 0 && consumedLitres > 0) measuredMileage = Math.round(distance / consumedLitres * 100) / 100;
    }
    db.exec('BEGIN');
    try {
      const fuelRecord = addEntity(req.userId, 'fuelRecords', { ...data, measuredMileage, provenance: 'USER-PROVIDED' });
      const updatedVehicle = { ...vehicle, odometer: data.odometer, fuelLevel: data.fullTank ? 100 : vehicle.fuelLevel, isExample: false, provenance: 'USER-PROVIDED' };
      db.prepare('UPDATE entities SET data=? WHERE user_id=? AND id=?').run(JSON.stringify(updatedVehicle), req.userId, vehicle.id);
      db.exec('COMMIT');
      res.status(201).json({ fuelRecord, vehicle: updatedVehicle });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.get('/api/providers', (req, res) => res.json({ providers: Object.fromEntries(Object.entries(providers).map(([key, provider]) => [key, { configured: provider.configured, provenance: provider.configured ? 'PROVIDER' : 'UNAVAILABLE' }])) }));
  app.get('/api/account/export', signedIn, (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="roamly-personal-data.json"');
    res.json({ ...payload(req.userId), security: security.metadata(req.userId), fuelRecords: entities(req.userId, 'fuelRecords'), exportedAt: new Date().toISOString() });
  });
  app.delete('/api/account', signedIn, async (req, res) => {
    const user = db.prepare('SELECT is_guest FROM users WHERE id=?').get(req.userId);
    if (!user.is_guest) await requireDestructiveAuth(req);
    db.prepare('DELETE FROM users WHERE id=?').run(req.userId);
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' });
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status ?? (error.type === 'entity.too.large' ? 413 : 500);
    if (status === 500 && options.logErrors !== false) console.error('Roamly API error:', error);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.type === 'entity.parse.failed' ? 'Request body contains invalid JSON.' : error.message });
  });
  return { app, db, close: () => db.close() };
}
