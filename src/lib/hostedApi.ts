import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Session } from "../types";
import { record, validateEntity, validateProfile } from "./hostedValidation.ts";
import { normalizePersonality } from "./preferences.ts";

export function createHostedApi(supabase: SupabaseClient) {
  type EntityKind = "trips" | "vehicles" | "expenses" | "fuelRecords" | "savedPlaces";

  type EntityRow = {
    id: string;
    kind: EntityKind;
    data: Record<string, unknown>;
    created_at?: string;
  };

  const defaultProfile = (name = "Traveller"): Profile => ({
    name,
    city: "Kochi",
    country: "India",
    currency: "INR",
    personality: "Peace-seeking",
    interests: ["Nature", "Culture"],
    group: "Couple",
    transport: "Car",
    budget: "Balanced",
    language: "English",
    notifications: {},
    visibility: "Private",
  });

  function entityData(row: EntityRow): Record<string, unknown> & { id: string } {
    return { ...record(row.data), id: row.id };
  }

  function databaseError(error: { message?: string } | null, fallback: string) {
    if (!error) return;
    console.error("Roamly data error:", error.message || error);
    throw new Error("code" in error && error.code === "P0001" && error.message ? error.message : fallback);
  }

  async function currentSupabaseUser() {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error("Your session could not be verified. Please sign in again.");
    if (!data.user || data.user.is_anonymous) throw new Error("Create an account or sign in to save your changes.");
    return data.user;
  }

  async function allEntities(userId: string): Promise<EntityRow[]> {
    if (!supabase) return [];
    const rows: EntityRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("entities")
        .select("id, kind, data, created_at").eq("user_id", userId)
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      databaseError(error, "Your Roamly data could not be loaded. Please try again.");
      rows.push(...(data || []) as EntityRow[]);
      if (!data || data.length < pageSize) return rows;
    }
  }

  async function getEntity(userId: string, kind: EntityKind, id: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from("entities")
      .select("id, kind, data, created_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("id", id)
      .maybeSingle();
    databaseError(error, "That item could not be loaded. Please try again.");
    if (!data) throw new Error("That item could not be found.");
    return entityData(data as EntityRow);
  }

  async function saveEntity(
    userId: string,
    kind: EntityKind,
    input: unknown,
    id: string = crypto.randomUUID(),
  ) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const data = { ...record(input), id, provenance: "USER-PROVIDED", isExample: false };
    const { error } = await supabase.from("entities").upsert({
      id,
      user_id: userId,
      kind,
      data,
      updated_at: new Date().toISOString(),
    });
    databaseError(error, "Your changes could not be saved. Please try again.");
    return data;
  }

  function entityKindFromPath(path: string): EntityKind | undefined {
    const match = /^\/(trips|vehicles|expenses)(?:\/[^/]+)?$/.exec(path);
    return match?.[1] as EntityKind | undefined;
  }

  async function supabaseApi<T>(path: string, body?: unknown, method?: string): Promise<T> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const requestMethod = method || (body ? "POST" : "GET");

    if (path === "/session") {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError") {
        throw new Error("Your session could not be loaded. Please try again.");
      }
      const user = auth.user;
      if (!user || user.is_anonymous) {
        return {
          user: { id: "guest", name: "Traveller", email: "", isGuest: true },
          profile: defaultProfile(),
          trips: [],
          vehicles: [],
          expenses: [],
          savedPlaces: [],
        } as T;
      }
      const [{ data: row, error: profileError }, entities] = await Promise.all([
        supabase.from("profiles").select("name, profile").eq("id", user.id).maybeSingle(),
        allEntities(user.id),
      ]);
      databaseError(profileError, "Your travel profile could not be loaded. Please try again.");
      const name = row?.name || user.user_metadata.name || "Traveller";
      const byKind = (kind: EntityKind) => entities.filter((item) => item.kind === kind).map(entityData);
      return {
        user: { id: user.id, name, email: user.email || "", isGuest: false },
        profile: { ...defaultProfile(name), ...record(row?.profile), personality: normalizePersonality(record(row?.profile).personality), name },
        trips: byKind("trips"),
        vehicles: byKind("vehicles"),
        expenses: byKind("expenses"),
        savedPlaces: byKind("savedPlaces").map((item) => String(item.placeId)),
      } as T;
    }

    if (path === "/auth/logout" && requestMethod === "POST") {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error("You could not be signed out. Please try again.");
      return { ok: true } as T;
    }

    if (path === "/profile" && requestMethod === "PUT") {
      const user = await currentSupabaseUser();
      const { data: current, error: readError } = await supabase
        .from("profiles")
        .select("profile")
        .eq("id", user.id)
        .maybeSingle();
      databaseError(readError, "Your travel profile could not be loaded. Please try again.");
      const input = record(body);
      const name = input.name ?? record(current?.profile).name ?? user.user_metadata.name ?? "Traveller";
      const profile = validateProfile({ ...input, name }, record(current?.profile));
      const { error } = await supabase.from("profiles").upsert({ id: user.id, name: profile.name, profile });
      databaseError(error, "Your travel profile could not be saved. Please try again.");
      return { profile } as T;
    }

    if (path === "/saved-places" && requestMethod === "POST") {
      await currentSupabaseUser();
      const placeId = String(record(body).placeId || "").trim();
      if (!placeId) throw new Error("Choose a place to save.");
      if (placeId.length > 100) throw new Error("Choose a valid place.");
      const { data, error } = await supabase.rpc("toggle_saved_place", { place_id: placeId });
      databaseError(error, "That place could not be saved. Please try again.");
      return { savedPlaces: data || [] } as T;
    }

    if (path === "/fuel-records" && requestMethod === "GET") {
      const user = await currentSupabaseUser();
      const fuelRecords = (await allEntities(user.id))
        .filter((item) => item.kind === "fuelRecords")
        .map(entityData);
      return { fuelRecords } as T;
    }

    if (path === "/fuel-records" && requestMethod === "POST") {
      await currentSupabaseUser();
      const input = validateEntity("fuelRecords", record(body));
      const { data, error } = await supabase.rpc("record_fuel", { input });
      databaseError(error, "Your fuel record could not be saved. Please try again.");
      return data as T;
    }

    if (path === "/account/export" && requestMethod === "GET") {
      const session = await supabaseApi<Session>("/session");
      if (session.user.isGuest) throw new Error("Sign in before exporting your data.");
      const fuelRecords = (await allEntities(session.user.id))
        .filter((item) => item.kind === "fuelRecords")
        .map(entityData);
      return { ...session, fuelRecords, exportedAt: new Date().toISOString() } as T;
    }

    if (path === "/account" && requestMethod === "DELETE") {
      await currentSupabaseUser();
      const { error } = await supabase.rpc("delete_my_account");
      databaseError(error, "Your account could not be deleted. Please try again.");
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) console.error("Local session cleanup failed after account deletion.");
      return { ok: true } as T;
    }

    const kind = entityKindFromPath(path);
    if (kind) {
      const user = await currentSupabaseUser();
      const id = path.split("/")[2];
      const singular = kind.slice(0, -1);
      if (requestMethod === "GET" && !id) {
        return { [kind]: (await allEntities(user.id)).filter((item) => item.kind === kind).map(entityData) } as T;
      }
      if ((requestMethod === "POST" && !id) || (requestMethod === "PATCH" && id)) {
        const existing = id ? await getEntity(user.id, kind, id) : undefined;
        const patch = record(body);
        const input = validateEntity(kind, { ...existing, ...patch });
        const fuelInputsChanged = ["vehicleId", "distanceKm", "fuelPricePerLitre", "currency"]
          .some((field) => Object.hasOwn(patch, field) && input[field] !== existing?.[field]);
        if (kind === "expenses" && input.tripId) await getEntity(user.id, "trips", String(input.tripId));
        if (kind === "trips" && input.vehicleId) {
          if (existing?.fuelEstimate && !fuelInputsChanged) input.fuelEstimate = existing.fuelEstimate;
          else {
            const vehicle = await getEntity(user.id, "vehicles", String(input.vehicleId));
            const distanceKm = Number(input.distanceKm), price = input.fuelPricePerLitre;
            const mileage = Number(vehicle.mileage);
            if (!(distanceKm > 0) || typeof price !== "number" || !Number.isFinite(price) || price < 0 || !(mileage > 0) || !Number.isFinite(mileage))
              throw new Error("Enter a valid journey distance, mileage, and fuel price.");
            const litres = distanceKm / mileage;
            input.fuelEstimate = { litres, cost: litres * price, currency: input.currency, mileage, provenance: "ESTIMATED" };
          }
        } else if (kind === "trips") {
          delete input.fuelPricePerLitre;
          // Deleting a vehicle detaches it but retains the trip’s historical
          // estimate. Unrelated edits must not erase that planning snapshot.
          if (existing?.fuelEstimate && !fuelInputsChanged) input.fuelEstimate = existing.fuelEstimate;
        }
        const item = await saveEntity(user.id, kind, input, id);
        return { [singular]: item } as T;
      }
      if (requestMethod === "DELETE" && id) {
        const { error } = await supabase.rpc("delete_roamly_entity", { entity_kind: kind, entity_id: id });
        databaseError(error, "That item could not be deleted. Please try again.");
        return { ok: true } as T;
      }
    }

    throw new Error("This action is not available in the hosted app.");
  }


  return supabaseApi;
}
