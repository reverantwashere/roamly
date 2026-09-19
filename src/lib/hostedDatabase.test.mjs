import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Run the production SQL against an isolated PostgreSQL engine. The minimal
// auth schema models Supabase's JWT identity; no network or real accounts.
test('hosted database enforces ownership and atomic account operations', async (t) => {
  const db = new PGlite()
  const alice = '11111111-1111-4111-8111-111111111111'
  const bob = '22222222-2222-4222-8222-222222222222'
  const vehicleId = '33333333-3333-4333-8333-333333333333'
  const tripId = '44444444-4444-4444-8444-444444444444'
  const asUser = async (id) => {
    await db.exec('reset role; set role authenticated;')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  }
  const rpc = async (name, input) => (await db.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(input)])).rows[0].result
  const entity = async (kind, data, id) => (await db.query(
    "insert into public.entities(user_id, kind, data, id) values(auth.uid(), $1, $2::jsonb, coalesce($3::uuid, gen_random_uuid())) returning id",
    [kind, JSON.stringify(data), id || null],
  )).rows[0].id
  const rows = async (kind) => (await db.query('select * from public.entities where kind = $1', [kind])).rows
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      alter default privileges in schema public grant execute on functions to anon, authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to authenticated, anon;
    `)
    for (const name of ['202609190001_roamly.sql', '202609190002_account_delete_rpc.sql', '202609190003_atomic_account_data.sql', '202609190004_authenticated_table_access.sql']) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into auth.users(id, email) values($1, $2), ($3, $4)', [alice, 'alice@example.test', bob, 'bob@example.test'])

    await t.test('deployment migrations grant authenticated CRUD without fixture table grants', async () => {
      for (const table of ['profiles', 'entities']) {
        for (const permission of ['select', 'insert', 'update', 'delete']) {
          const result = await db.query('select has_table_privilege($1, $2, $3) as permitted', ['authenticated', `public.${table}`, permission])
          assert.equal(result.rows[0].permitted, true, `authenticated lacks ${permission} on ${table}`)
          const anonymous = await db.query('select has_table_privilege($1, $2, $3) as permitted', ['anon', `public.${table}`, permission])
          assert.equal(anonymous.rows[0].permitted, false, `migration granted anonymous ${permission} on ${table}`)
        }
        const security = await db.query('select relrowsecurity from pg_class where oid = $1::regclass', [`public.${table}`])
        assert.equal(security.rows[0].relrowsecurity, true, `${table} must retain RLS`)
      }
      await asUser(alice)
      // Exact column/filter/order shape used when a signed-in app loads /session.
      assert.deepEqual((await db.query('select id, kind, data, created_at from public.entities where user_id = $1 order by created_at, id limit 500', [alice])).rows, [])
      assert.equal((await db.query('select name, profile from public.profiles where id = $1', [alice])).rows.length, 1)
    })

    await t.test('RLS and saved-place toggles keep accounts separate', async () => {
      await asUser(alice)
      assert.equal((await db.query('select * from public.profiles')).rows.length, 1)
      assert.deepEqual((await db.query("select public.toggle_saved_place('munnar') as result")).rows[0].result, ['munnar'])
      await asUser(bob)
      assert.equal((await rows('savedPlaces')).length, 0)
      await db.query("select public.toggle_saved_place('munnar')")
      await assert.rejects(db.query('insert into public.entities(user_id,kind,data) values($1, $2, $3)', [alice, 'trips', '{}']), /row-level security/)
      await asUser(alice)
      assert.deepEqual((await db.query("select public.toggle_saved_place('munnar') as result")).rows[0].result, [])
      await asUser(bob)
      assert.equal((await rows('savedPlaces')).length, 1)
    })

    const fuel = (odometer, litres, fullTank = true) => ({ vehicleId, date: '2026-09-19', fuelType: 'Petrol', litres, pricePerLitre: 100, odometer, fullTank, currency: 'INR' })
    await t.test('fuel updates calculate full-to-full mileage including partial fills', async () => {
      await asUser(alice)
      await entity('vehicles', { name: 'Test car', tankCapacity: 50, odometer: 1000, fuelLevel: 20, mileage: 18 }, vehicleId)
      assert.equal((await rpc('record_fuel', fuel(1000, 20))).fuelRecord.measuredMileage, null)
      await rpc('record_fuel', fuel(1100, 5, false))
      const result = await rpc('record_fuel', fuel(1200, 5))
      assert.equal(result.fuelRecord.measuredMileage, 20)
      assert.equal(result.fuelRecord.totalAmount, 500)
      assert.equal(result.vehicle.odometer, 1200)
      assert.equal(result.vehicle.fuelLevel, 100)
      await assert.rejects(rpc('record_fuel', fuel(1100, 10)), /Odometer/)
      await assert.rejects(rpc('record_fuel', fuel(1300, 51)), /tank capacity/)
      await assert.rejects(rpc('record_fuel', { ...fuel(1300, 10), date: '2026-02-30' }), /date/)
      await assert.rejects(rpc('record_fuel', { ...fuel(1300, 10), date: '2026-09-18' }), /chronological/)
      assert.equal((await rows('fuelRecords')).length, 3)
      await asUser(bob)
      await assert.rejects(rpc('record_fuel', fuel(1300, 10)), /could not be found/)
    })

    await t.test('a failed vehicle update rolls the inserted fuel record back', async () => {
      await db.exec(`reset role;
        create function public.test_reject_vehicle_update() returns trigger language plpgsql as $$
        begin if new.kind = 'vehicles' then raise exception 'simulated failure'; end if; return new; end; $$;
        create trigger reject_vehicle_update before update on public.entities for each row execute function public.test_reject_vehicle_update();`)
      await asUser(alice)
      await assert.rejects(rpc('record_fuel', fuel(1300, 10)), /simulated failure/)
      assert.equal((await rows('fuelRecords')).length, 3)
      assert.equal((await rows('vehicles'))[0].data.odometer, 1200)
      await db.exec('reset role; drop trigger reject_vehicle_update on public.entities;')
    })

    await t.test('related deletes are owner-scoped and preserve historical estimates', async () => {
      await asUser(alice)
      await entity('trips', { vehicleId, fuelPricePerLitre: 100, fuelEstimate: { cost: 500 } }, tripId)
      await entity('expenses', { tripId, amount: 100 })
      await asUser(bob)
      await entity('expenses', { tripId, amount: 200 })
      await assert.rejects(db.query("select public.delete_roamly_entity('vehicles', $1)", [vehicleId]), /could not be found/)
      await asUser(alice)
      await db.query("select public.delete_roamly_entity('vehicles', $1)", [vehicleId])
      assert.equal((await rows('fuelRecords')).length, 0)
      const trip = (await rows('trips'))[0].data
      assert.equal(trip.vehicleId, undefined)
      assert.equal(trip.fuelEstimate.cost, 500)
      await db.query("select public.delete_roamly_entity('trips', $1)", [tripId])
      assert.equal((await rows('expenses')).length, 0)
      await asUser(bob)
      assert.equal((await rows('expenses')).length, 1)
    })

    await t.test('anonymous callers cannot execute mutations or delete an account', async () => {
      await db.exec('reset role; set role anon;')
      await assert.rejects(db.query('select public.delete_my_account()'), /permission denied/)
      await assert.rejects(db.query("select public.toggle_saved_place('munnar')"), /permission denied/)
      await asUser('')
      await assert.rejects(db.query('select public.delete_my_account()'), /Authentication required/)
    })

    await t.test('account deletion cascades only through the authenticated account', async () => {
      await asUser(alice)
      await db.query("select public.toggle_saved_place('kovalam')")
      await db.query('select public.delete_my_account()')
      await db.exec('reset role;')
      assert.deepEqual((await db.query('select id from auth.users')).rows.map(row => row.id), [bob])
      assert.deepEqual((await db.query('select id from public.profiles')).rows.map(row => row.id), [bob])
      assert.ok((await db.query('select user_id from public.entities')).rows.every(row => row.user_id === bob))
    })
  } finally {
    await db.close()
  }
})
