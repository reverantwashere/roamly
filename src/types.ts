import type { ItineraryDay } from "./lib/planner";
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
  user: { id: string; name: string; email: string; isGuest: boolean };
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
