import { normalizePersonality } from "./preferences.ts";

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) } : {};
}
function text(value: unknown, label: string, max = 120, optional = false): string {
  if (optional && (value == null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function number(value: unknown, label: string, min = 0, max = 10000000, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    throw new Error(`${label} must be ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`);
  return value;
}
function currency(value: unknown = "INR"): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("Currency must be a three-letter uppercase code.");
  return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error("Enter a valid date (YYYY-MM-DD).");
  return value;
}
export function validateProfile(input: Record<string, unknown>, current: Record<string, unknown>) {
  const result = { ...current };
  for (const key of ["name", "city", "country", "personality", "group", "transport", "language"])
    if (key in input) result[key] = text(input[key], key, 120, key === "city");
  if ("phone" in input) {
    const phone = text(input.phone, "Phone", 16, true);
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Enter a valid international phone number.");
    result.phone = phone;
  }
  if ("currency" in input) result.currency = currency(input.currency);
  if ("budget" in input) result.budget = typeof input.budget === "number" ? number(input.budget, "Budget") : text(input.budget, "Budget", 80);
  if ("interests" in input) {
    if (!Array.isArray(input.interests) || input.interests.length > 20) throw new Error("Choose up to 20 interests.");
    result.interests = [...new Set(input.interests.map((value) => text(value, "Interest", 60)))];
  }
  if ("notifications" in input) {
    if (!input.notifications || typeof input.notifications !== "object" || Array.isArray(input.notifications)) throw new Error("Choose valid notification preferences.");
    result.notifications = Object.fromEntries(Object.entries(record(input.notifications)).map(([key, value]) => {
      if (typeof value !== "boolean") throw new Error("Notification preferences must be true or false.");
      return [key, value];
    }));
  }
  result.personality = normalizePersonality(result.personality);
  result.visibility = "Private";
  result.onboarded = true;
  return result;
}
export function validateEntity(kind: string, input: Record<string, unknown>): Record<string, unknown> {
  if (kind === "vehicles") return {
    name: text(input.name, "Vehicle name"), type: text(input.type ?? "Car", "Vehicle type", 40),
    fuelType: text(input.fuelType ?? "Petrol", "Fuel type", 40),
    tankCapacity: number(input.tankCapacity, "Tank capacity", 0.1, 1000),
    mileage: number(input.mileage, "Mileage", 0.1, 1000), odometer: number(input.odometer ?? 0, "Odometer"),
    fuelLevel: number(input.fuelLevel ?? 100, "Fuel level", 0, 100),
  };
  if (kind === "expenses") return {
    tripId: text(input.tripId, "Trip ID", 100, true), title: text(input.title, "Expense title"),
    category: text(input.category ?? "Other", "Category", 60), amount: number(input.amount, "Amount", 0.01),
    currency: currency(input.currency), date: date(input.date), people: number(input.people ?? 1, "People", 1, 100, true),
  };
  if (kind === "fuelRecords") {
    if (input.fullTank !== undefined && typeof input.fullTank !== "boolean") throw new Error("Full tank must be true or false.");
    return {
      vehicleId: text(input.vehicleId, "Vehicle ID", 100), date: date(input.date), fuelType: text(input.fuelType ?? "Petrol", "Fuel type", 40),
      litres: number(input.litres, "Litres", 0.01, 1000), pricePerLitre: number(input.pricePerLitre, "Price per litre", 0, 100000),
      odometer: number(input.odometer, "Odometer"), fullTank: input.fullTank ?? true, currency: currency(input.currency),
    };
  }
  const trip: Record<string, unknown> = {
    destination: text(input.destination, "Destination"), country: text(input.country, "Country", 120, true),
    image: text(input.image, "Image URL", 1000, true), startDate: date(input.startDate),
    days: number(input.days, "Days", 1, 60, true), people: number(input.people, "People", 1, 100, true),
    budget: number(input.budget ?? 0, "Budget"), currency: currency(input.currency), group: text(input.group ?? "Solo", "Travel group", 50),
    personality: text(normalizePersonality(input.personality ?? "Flexible"), "Travel style", 80),
    transport: text(input.transport ?? "Flexible", "Transport", 80), status: text(input.status ?? "Upcoming", "Status", 30),
    distanceKm: number(input.distanceKm ?? 0, "Distance", 0, 100000),
  };
  if (input.vehicleId !== undefined) trip.vehicleId = text(input.vehicleId, "Vehicle ID", 100, true);
  if (input.fuelPricePerLitre !== undefined) trip.fuelPricePerLitre = number(input.fuelPricePerLitre, "Fuel price per litre", 0, 100000);
  if (trip.image && !/^(https:\/\/|\/images\/)/.test(String(trip.image))) throw new Error("Image must use HTTPS or a local image path.");
  const itinerary = input.itinerary ?? [];
  if (!Array.isArray(itinerary) || itinerary.length > 60 || JSON.stringify(itinerary).length > 60000) throw new Error("Itinerary is too large.");
  for (const day of itinerary) {
    if (!day || typeof day !== "object" || Array.isArray(day)) throw new Error("Each itinerary day must be an object.");
    number(day.day, "Itinerary day", 1, 60, true);
    if (!Array.isArray(day.activities) || day.activities.length > 30) throw new Error("Choose up to 30 activities per day.");
    for (const activity of day.activities) text(record(activity).title ?? record(activity).name, "Activity title", 200);
  }
  trip.itinerary = itinerary;
  return trip;
}
