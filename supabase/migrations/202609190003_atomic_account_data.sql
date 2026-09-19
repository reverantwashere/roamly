-- Apply before deploying the hosted data adapter. These functions run with the
-- caller's permissions: existing RLS remains the boundary for every entity row.
create or replace function public.toggle_saved_place(place_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing_id uuid;
  result jsonb;
begin
  if owner_id is null then raise exception 'Sign in to save places.'; end if;
  if place_id is null or length(trim(place_id)) not between 1 and 100 then raise exception 'Choose a valid place.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select id into existing_id from public.entities where user_id = owner_id and kind = 'savedPlaces' and data->>'placeId' = trim(place_id);
  if existing_id is null then
    insert into public.entities(user_id, kind, data) values(owner_id, 'savedPlaces', jsonb_build_object('placeId', trim(place_id)));
  else
    delete from public.entities where id = existing_id and user_id = owner_id;
  end if;
  select coalesce(jsonb_agg(data->>'placeId' order by created_at, id), '[]'::jsonb) into result
    from public.entities where user_id = owner_id and kind = 'savedPlaces';
  return result;
end; $$;

create or replace function public.delete_roamly_entity(entity_kind text, entity_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in to delete items.'; end if;
  if entity_kind not in ('trips', 'vehicles', 'expenses') then raise exception 'This item cannot be deleted.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform 1 from public.entities where id = entity_id and user_id = owner_id and kind = entity_kind for update;
  if not found then raise exception 'That item could not be found.'; end if;
  if entity_kind = 'trips' then
    delete from public.entities where user_id = owner_id and kind = 'expenses' and data->>'tripId' = entity_id::text;
  elsif entity_kind = 'vehicles' then
    delete from public.entities where user_id = owner_id and kind = 'fuelRecords' and data->>'vehicleId' = entity_id::text;
    -- Historical fuel estimates are planning snapshots; preserve those while
    -- removing the deleted vehicle association.
    update public.entities set data = data - 'vehicleId' - 'fuelPricePerLitre'
      where user_id = owner_id and kind = 'trips' and data->>'vehicleId' = entity_id::text;
  end if;
  delete from public.entities where id = entity_id and user_id = owner_id and kind = entity_kind;
end; $$;

create or replace function public.record_fuel(input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  vehicle_id uuid;
  vehicle jsonb;
  fuel_id uuid := gen_random_uuid();
  fuel jsonb;
  litres numeric;
  price numeric;
  odometer numeric;
  full_tank boolean;
  fill_date date;
  latest_date date;
  baseline_odometer numeric;
  baseline_created timestamptz;
  consumed numeric;
  measured numeric := null;
begin
  if owner_id is null then raise exception 'Sign in to record fuel.'; end if;
  if jsonb_typeof(input) is distinct from 'object'
    or jsonb_typeof(input->'litres') is distinct from 'number'
    or jsonb_typeof(input->'pricePerLitre') is distinct from 'number'
    or jsonb_typeof(input->'odometer') is distinct from 'number'
    or jsonb_typeof(input->'fullTank') is distinct from 'boolean'
    or coalesce(input->>'currency', '') !~ '^[A-Z]{3}$'
    or coalesce(input->>'fuelType', '') = ''
    or length(input->>'fuelType') > 40
    or coalesce(input->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Enter valid fuel details.'; end if;
  litres := (input->>'litres')::numeric;
  price := (input->>'pricePerLitre')::numeric;
  odometer := (input->>'odometer')::numeric;
  full_tank := (input->>'fullTank')::boolean;
  fill_date := (input->>'date')::date;
  vehicle_id := (input->>'vehicleId')::uuid;
  if litres not between 0.01 and 1000 or price not between 0 and 100000 or odometer not between 0 and 10000000 then
    raise exception 'Enter valid fuel quantities and odometer.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select data || jsonb_build_object('id', id) into vehicle from public.entities
    where id = vehicle_id and user_id = owner_id and kind = 'vehicles' for update;
  if not found then raise exception 'That vehicle could not be found.'; end if;
  if litres > (vehicle->>'tankCapacity')::numeric then raise exception 'Fuel added cannot exceed the vehicle tank capacity.'; end if;
  if odometer < (vehicle->>'odometer')::numeric then raise exception 'Odometer cannot be lower than the vehicle’s current reading.'; end if;
  select max((data->>'date')::date) into latest_date from public.entities
    where user_id = owner_id and kind = 'fuelRecords' and data->>'vehicleId' = vehicle_id::text;
  if fill_date < latest_date then raise exception 'Fuel records must be recorded in chronological order.'; end if;
  select (data->>'odometer')::numeric, created_at into baseline_odometer, baseline_created from public.entities
    where user_id = owner_id and kind = 'fuelRecords' and data->>'vehicleId' = vehicle_id::text and data->>'fullTank' = 'true'
    order by (data->>'odometer')::numeric desc, created_at desc, id desc limit 1;
  if full_tank and baseline_odometer is not null and odometer > baseline_odometer then
    select litres + coalesce(sum((data->>'litres')::numeric), 0) into consumed from public.entities
      where user_id = owner_id and kind = 'fuelRecords' and data->>'vehicleId' = vehicle_id::text
      and ((data->>'odometer')::numeric > baseline_odometer or ((data->>'odometer')::numeric = baseline_odometer and created_at > baseline_created));
    measured := round((odometer - baseline_odometer) / consumed, 2);
  end if;
  fuel := jsonb_build_object('id', fuel_id, 'vehicleId', vehicle_id, 'date', fill_date,
    'fuelType', input->>'fuelType', 'litres', litres, 'pricePerLitre', price, 'odometer', odometer,
    'fullTank', full_tank, 'currency', input->>'currency', 'totalAmount', round(litres * price, 2),
    'measuredMileage', measured, 'provenance', 'USER-PROVIDED', 'isExample', false);
  vehicle := vehicle || jsonb_build_object('odometer', odometer, 'fuelLevel', case when full_tank then '100'::jsonb else vehicle->'fuelLevel' end,
    'provenance', 'USER-PROVIDED', 'isExample', false);
  insert into public.entities(id, user_id, kind, data) values(fuel_id, owner_id, 'fuelRecords', fuel);
  update public.entities set data = vehicle where id = vehicle_id and user_id = owner_id and kind = 'vehicles';
  return jsonb_build_object('fuelRecord', fuel, 'vehicle', vehicle);
end; $$;

-- Restrict account deletion to the JWT's own user ID. Fully qualified names
-- and an empty search path prevent objects in writable schemas shadowing auth.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id = auth.uid();
end; $$;

revoke all on function public.toggle_saved_place(text) from public, anon;
revoke all on function public.delete_roamly_entity(text, uuid) from public, anon;
revoke all on function public.record_fuel(jsonb) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.toggle_saved_place(text) to authenticated;
grant execute on function public.delete_roamly_entity(text, uuid) to authenticated;
grant execute on function public.record_fuel(jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
