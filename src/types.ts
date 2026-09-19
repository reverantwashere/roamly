import type { ItineraryDay } from "./lib/planner";
import { supabase } from "./lib/supabase";
export interface Profile {
  name: string;
  city: string;
  country: string;
  currency: string;
  personality: string;
  interests: string[];
  group: string;
  transport: string;
  budget: string;
  language: string;
  notifications: Record<string, boolean>;
  visibility: string;
  [key: string]: unknown;
}
export interface Trip {
  id: string;
  destination: string;
  country: string;
  image: string;
  startDate: string;
  days: number;
  people: number;
  budget: number;
  currency: string;
  group: string;
  personality: string;
  transport: string;
  status: string;
  itinerary: ItineraryDay[];
  distanceKm?: number;
  vehicleId?: string;
  fuelPricePerLitre?: number;
  fuelEstimate?: {
    cost: number;
    litres: number;
    currency: string;
    mileage: number;
    provenance: string;
  };
  [key: string]: unknown;
}
export interface Vehicle {
  id: string;
  name: string;
  type: string;
  fuelType: string;
  tankCapacity: number;
  mileage: number;
  odometer: number;
  fuelLevel: number;
  [key: string]: unknown;
}
export interface Expense {
  id: string;
  tripId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  people: number;
  [key: string]: unknown;
}
export interface Session {
  user: { id: string; name: string; email: string; isGuest: boolean; phone?: string; phoneVerified?: boolean };
  profile: Profile;
  trips: Trip[];
  vehicles: Vehicle[];
  expenses: Expense[];
  savedPlaces: string[];
}
export type Page =
  | "home"
  | "explore"
  | "trips"
  | "vehicle"
  | "expenses"
  | "social"
  | "ai"
  | "saved"
  | "profile";
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  // Cloudflare Pages is a static host. Until a user signs in, provide the
  // same read-only Kerala starter space without asking a nonexistent /api
  // server for a local SQLite session.
  if (supabase && path === "/session") {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      return {
        user: { id: "guest", name: "Traveller", email: "", isGuest: true, phoneVerified: false },
        profile: {
          name: "Traveller", city: "Kochi", country: "India", currency: "INR",
          personality: "Peace-seeking", interests: ["Nature", "Culture"], group: "Couple",
          transport: "Car", budget: "Balanced", language: "English", notifications: {}, visibility: "Private",
        },
        trips: [], vehicles: [], expenses: [], savedPlaces: [],
      } as T;
    }
    const { data: row } = await supabase.from("profiles").select("name, profile").eq("id", user.id).maybeSingle();
    return {
      user: { id: user.id, name: row?.name || user.user_metadata.name || "Traveller", email: user.email || "", isGuest: false, phone: user.phone || "", phoneVerified: Boolean(user.phone_confirmed_at) },
      profile: { name: row?.name || user.user_metadata.name || "Traveller", city: "Kochi", country: "India", currency: "INR", personality: "Peace-seeking", interests: ["Nature", "Culture"], group: "Couple", transport: "Car", budget: "Balanced", language: "English", notifications: {}, visibility: "Private", ...(row?.profile || {}) },
      trips: [], vehicles: [], expenses: [], savedPlaces: [],
    } as T;
  }
  if (supabase && path === "/profile" && (method === "PUT" || body)) {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Please sign in to save your preferences.");
    const { data: current } = await supabase.from("profiles").select("profile").eq("id", auth.user.id).maybeSingle();
    const input = (body || {}) as Record<string, unknown>;
    const name = String(input.name || auth.user.user_metadata.name || "Traveller");
    const profile = { ...(current?.profile || {}), ...input, name, onboarded: true };
    const { error } = await supabase.from("profiles").upsert({ id: auth.user.id, name, profile });
    if (error) throw error;
    return { profile } as T;
  }
  const res = await fetch(`/api${path}`, {
    method: method || (body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Could not reach Roamly. Please try again.");
  }
  if (!res.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.message || "Something went wrong. Please try again.",
    );
  return data;
}
export function money(amount: number, currency = "USD", fraction = 0) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: fraction,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(fraction)}`;
  }
}
export function dateLabel(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
export const currencies = [
  "USD",
  "AED",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "IDR",
  "AUD",
  "CAD",
  "SGD",
];
