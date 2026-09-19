import { KOCHI_CITY_IMAGE } from "./photos.ts";

export type DestinationCategory =
  "Nature" | "Adventure" | "Culture" | "Coast" | "City";
export type CrowdLevel = "Low" | "Moderate" | "High";

export interface Destination {
  id: string;
  name: string;
  country: string;
  region: string;
  district: string;
  description: string;
  image: string;
  category: DestinationCategory;
  tags: string[];
  personality: string[];
  /** Illustrative planning allowance per person per day, in costCurrency. */
  costPerDay: number;
  /** ISO currency code; legacy fixtures without one default to USD. */
  costCurrency?: string;
  lat: number;
  lng: number;
  /** Suggested planning window, not verified crowd or opening-hours data. */
  quietTime: string;
  crowd: CrowdLevel;
  duration: string;
  match?: number;
  distanceKm?: number;
}

export type DiscoveryKind = "Activities" | "Food" | "Shopping" | "Stays";
export type BudgetTier = "Budget" | "Balanced" | "Comfort" | "Luxury";

export interface DiscoveryItem {
  id: string;
  title: string;
  kind: DiscoveryKind;
  district: string;
  locality: string;
  description: string;
  tags: string[];
  budgetTiers: BudgetTier[];
  priceHint: string;
}

export const categories = [
  "All places",
  "Nature",
  "Adventure",
  "Culture",
  "Coast",
  "City",
] as const;

export const keralaDistricts = [
  "Thiruvananthapuram",
  "Kollam",
  "Pathanamthitta",
  "Alappuzha",
  "Kottayam",
  "Idukki",
  "Ernakulam",
  "Thrissur",
  "Palakkad",
  "Malappuram",
  "Kozhikode",
  "Wayanad",
  "Kannur",
  "Kasaragod",
] as const;

export const keralaHometowns = [
  ["Thiruvananthapuram", 8.5241, 76.9366], ["Neyyattinkara", 8.3985, 77.0864], ["Attingal", 8.695, 76.815],
  ["Kollam", 8.8932, 76.6141], ["Punalur", 9.0196, 76.9227], ["Pathanamthitta", 9.2648, 76.787], ["Adoor", 9.155, 76.731],
  ["Alappuzha", 9.4981, 76.3388], ["Cherthala", 9.683, 76.336], ["Kottayam", 9.5916, 76.5222], ["Pala", 9.7139, 76.6846],
  ["Kochi", 9.9312, 76.2673], ["Aluva", 10.1004, 76.357], ["Perumbavoor", 10.106, 76.4737], ["Muvattupuzha", 9.9799, 76.5738],
  ["Thrissur", 10.5276, 76.2144], ["Guruvayur", 10.5943, 76.0411], ["Irinjalakuda", 10.3424, 76.2112],
  ["Palakkad", 10.7867, 76.6548], ["Ottapalam", 10.773, 76.377], ["Malappuram", 11.051, 76.071], ["Manjeri", 11.1202, 76.12], ["Tirur", 10.9146, 75.922],
  ["Kozhikode", 11.2588, 75.7804], ["Vadakara", 11.6085, 75.5917], ["Kalpetta", 11.6102, 76.082], ["Mananthavady", 11.802, 76.0],
  ["Kannur", 11.8745, 75.3704], ["Thalassery", 11.748, 75.4929], ["Kasaragod", 12.4996, 74.9869], ["Kanhangad", 12.3087, 75.091],
  ["Thodupuzha", 9.897, 76.717], ["Kattappana", 9.7557, 77.116], ["Munnar", 10.0889, 77.0595],
] as const;

export function distanceFromHometown(city: string, place: Pick<Destination, "lat" | "lng">) {
  const home = keralaHometowns.find(([name]) => name === city);
  if (!home) return undefined;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(place.lat - home[1]);
  const dLng = radians(place.lng - home[2]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(home[1])) * Math.cos(radians(place.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Kerala beta catalogue; the schema remains globally extensible.
 * Costs and crowd levels are illustrative planning estimates, never live data.
 * INR allowances are set for this catalogue, not converted from another currency.
 * Pins represent regional destinations, not navigation endpoints.
 * Photos were selected from destination-specific Unsplash pages/collections.
 */
export const destinations: Destination[] = [
  {
    id: "munnar",
    name: "Munnar",
    country: "India",
    region: "Kerala",
    district: "Idukki",
    description:
      "Misty tea gardens, winding hill roads, and mornings worth slowing down for.",
    image:
      "https://images.unsplash.com/photo-1491497895121-1334fc14d8c9?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Tea gardens", "Hill station", "Scenic drives"],
    personality: ["Peace-seeking", "Ambivert", "Introvert"],
    costPerDay: 2800,
    costCurrency: "INR",
    lat: 10.091234,
    lng: 77.060051,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "3–4 days",
  },
  {
    id: "wayanad",
    name: "Wayanad",
    country: "India",
    region: "Kerala",
    district: "Wayanad",
    description:
      "Green hills, forest-fringed trails, and a little space to reconnect with nature.",
    image:
      "https://images.unsplash.com/photo-1723709431768-d749b0d814b9?auto=format&fit=crop&w=1200&q=85",
    category: "Adventure",
    tags: ["Forest trails", "Viewpoints", "Local food"],
    personality: ["Adventure-seeking", "Peace-seeking", "Introvert"],
    costPerDay: 2600,
    costCurrency: "INR",
    lat: 11.75847,
    lng: 76.093826,
    quietTime: "Morning",
    crowd: "Low",
    duration: "3–4 days",
  },
  {
    id: "varkala",
    name: "Varkala",
    country: "India",
    region: "Kerala",
    district: "Thiruvananthapuram",
    description:
      "Sea breezes, cliffside cafés, and golden afternoons beside the Arabian Sea.",
    image:
      "https://images.unsplash.com/photo-1719299948942-d6bcf2769bd2?auto=format&fit=crop&w=1200&q=85",
    category: "Coast",
    tags: ["Cliff walks", "Beach days", "Cafés"],
    personality: ["Ambivert", "Social", "Peace-seeking"],
    costPerDay: 2400,
    costCurrency: "INR",
    lat: 8.740543,
    lng: 76.716785,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "2–3 days",
  },
  {
    id: "alappuzha",
    name: "Alappuzha",
    country: "India",
    region: "Kerala",
    district: "Alappuzha",
    description:
      "Palm-lined canals, village life, and backwater days that move at their own pace.",
    image:
      "https://images.unsplash.com/photo-1753123545014-901b77892e7d?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Backwaters", "Village life", "Slow travel"],
    personality: ["Introvert", "Peace-seeking", "Flexible"],
    costPerDay: 3000,
    costCurrency: "INR",
    lat: 9.4981,
    lng: 76.3388,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "2–3 days",
  },
  {
    id: "fort-kochi",
    name: "Fort Kochi",
    country: "India",
    region: "Kerala",
    district: "Ernakulam",
    description:
      "Heritage lanes, waterfront sunsets, and conversations over a very good cup of coffee.",
    image:
      "https://images.unsplash.com/photo-1590123732197-e7079d2ceb89?auto=format&fit=crop&w=1200&q=85",
    category: "Culture",
    tags: ["Heritage walks", "Art", "Local food"],
    personality: ["Ambivert", "Extrovert", "Social"],
    costPerDay: 2500,
    costCurrency: "INR",
    lat: 9.964793,
    lng: 76.242943,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "2–3 days",
  },
  {
    id: "thekkady",
    name: "Thekkady",
    country: "India",
    region: "Kerala",
    district: "Idukki",
    description:
      "Forest scenery, spice-scented gardens, and a slower rhythm around Periyar.",
    image:
      "https://images.unsplash.com/photo-1716404985743-8c0e007cb358?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Forest scenery", "Spice gardens", "Periyar"],
    personality: ["Adventure-seeking", "Peace-seeking", "Ambivert"],
    costPerDay: 2800,
    costCurrency: "INR",
    lat: 9.602,
    lng: 77.1615,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "2–3 days",
  },
  {
    id: "vagamon",
    name: "Vagamon",
    country: "India",
    region: "Kerala",
    district: "Idukki",
    description:
      "Rolling meadows, pine-scented paths, and clouds drifting across the hills.",
    image:
      "https://images.unsplash.com/photo-1663597675745-96a3f784369e?auto=format&fit=crop&w=1200&q=85",
    category: "Adventure",
    tags: ["Meadows", "Pine forest", "Hill walks"],
    personality: ["Adventure-seeking", "Introvert", "Peace-seeking"],
    costPerDay: 2200,
    costCurrency: "INR",
    lat: 9.690952,
    lng: 76.904783,
    quietTime: "Morning",
    crowd: "Low",
    duration: "2–3 days",
  },
  {
    id: "athirappilly",
    name: "Athirappilly",
    country: "India",
    region: "Kerala",
    district: "Thrissur",
    description:
      "Waterfall views, lush riverbanks, and the refreshing feeling of being outdoors.",
    image:
      "https://images.unsplash.com/photo-1672597557538-fd88dec3aae2?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Waterfalls", "Forest scenery", "Day trips"],
    personality: ["Adventure-seeking", "Ambivert", "Peace-seeking"],
    costPerDay: 2200,
    costCurrency: "INR",
    lat: 10.293301,
    lng: 76.565723,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "1–2 days",
  },
  {
    id: "kumarakom",
    name: "Kumarakom",
    country: "India",
    region: "Kerala",
    district: "Kottayam",
    description:
      "Lake views, quiet canals, and unhurried moments in Kerala’s backwater country.",
    image:
      "https://images.unsplash.com/photo-1715785849770-22374ff8bdfb?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Backwaters", "Birdwatching", "Village walks"],
    personality: ["Introvert", "Peace-seeking", "Flexible"],
    costPerDay: 3200,
    costCurrency: "INR",
    lat: 9.617119,
    lng: 76.429482,
    quietTime: "Morning",
    crowd: "Low",
    duration: "2–3 days",
  },
  {
    id: "kovalam",
    name: "Kovalam",
    country: "India",
    region: "Kerala",
    district: "Thiruvananthapuram",
    description:
      "A relaxed beach base with lighthouse views, swimming coves, and easy sunset walks.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85",
    category: "Coast",
    tags: ["Lighthouse beach", "Sunsets", "Family-friendly"],
    personality: ["Peace-seeking", "Ambivert", "Flexible"],
    costPerDay: 2700,
    costCurrency: "INR",
    lat: 8.3988,
    lng: 76.9784,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "2–3 days",
  },
  {
    id: "ponmudi",
    name: "Ponmudi",
    country: "India",
    region: "Kerala",
    district: "Thiruvananthapuram",
    description:
      "Cool hill air, winding roads, and short trails through the southern Western Ghats.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85",
    category: "Adventure",
    tags: ["Cool weather", "Hill roads", "Trekking"],
    personality: ["Adventure-seeking", "Peace-seeking", "Flexible"],
    costPerDay: 1900,
    costCurrency: "INR",
    lat: 8.7595,
    lng: 77.1169,
    quietTime: "Morning",
    crowd: "Low",
    duration: "1–2 days",
  },
  {
    id: "thenmala",
    name: "Thenmala",
    country: "India",
    region: "Kerala",
    district: "Kollam",
    description:
      "Forest paths, reservoir views, and an easy introduction to Kerala’s eco-adventure side.",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=85",
    category: "Adventure",
    tags: ["Eco-tourism", "Forest trails", "Reservoir"],
    personality: ["Adventure-seeking", "Ambivert", "Family"],
    costPerDay: 2100,
    costCurrency: "INR",
    lat: 8.9604,
    lng: 77.0686,
    quietTime: "Morning",
    crowd: "Low",
    duration: "1–2 days",
  },
  {
    id: "gavi",
    name: "Gavi",
    country: "India",
    region: "Kerala",
    district: "Pathanamthitta",
    description:
      "Deep forest scenery, misty water, and guided nature experiences away from busy towns.",
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Wildlife", "Forest", "Eco stay"],
    personality: ["Introvert", "Adventure-seeking", "Peace-seeking"],
    costPerDay: 3300,
    costCurrency: "INR",
    lat: 9.4327,
    lng: 77.1557,
    quietTime: "Morning",
    crowd: "Low",
    duration: "2–3 days",
  },
  {
    id: "marari",
    name: "Marari Beach",
    country: "India",
    region: "Kerala",
    district: "Alappuzha",
    description:
      "A quieter stretch of coast for barefoot mornings, village lanes, and slow beach days.",
    image:
      "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1200&q=85",
    category: "Coast",
    tags: ["Quiet beach", "Village life", "Romantic"],
    personality: ["Peace-seeking", "Introvert", "Flexible"],
    costPerDay: 2900,
    costCurrency: "INR",
    lat: 9.6,
    lng: 76.2988,
    quietTime: "Sunset",
    crowd: "Low",
    duration: "2–3 days",
  },
  {
    id: "bekal",
    name: "Bekal",
    country: "India",
    region: "Kerala",
    district: "Kasaragod",
    description:
      "A sea-facing fort, broad lawns, and northern Kerala coastlines made for an unhurried detour.",
    image:
      "https://images.unsplash.com/photo-1533154683836-84ea7a0bc310?auto=format&fit=crop&w=1200&q=85",
    category: "Culture",
    tags: ["Historic fort", "Sea views", "Architecture"],
    personality: ["Culture-seeking", "Ambivert", "Peace-seeking"],
    costPerDay: 2500,
    costCurrency: "INR",
    lat: 12.3922,
    lng: 75.034,
    quietTime: "Evening",
    crowd: "Moderate",
    duration: "1–2 days",
  },
  {
    id: "muzhappilangad",
    name: "Muzhappilangad",
    country: "India",
    region: "Kerala",
    district: "Kannur",
    description:
      "A long drive-in beach with open horizons, sea breeze, and plenty of room to pause.",
    image:
      "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1200&q=85",
    category: "Coast",
    tags: ["Drive-in beach", "Road trip", "Sunsets"],
    personality: ["Adventure-seeking", "Social", "Flexible"],
    costPerDay: 1800,
    costCurrency: "INR",
    lat: 11.7989,
    lng: 75.4397,
    quietTime: "Evening",
    crowd: "Moderate",
    duration: "1–2 days",
  },
  {
    id: "silent-valley",
    name: "Silent Valley",
    country: "India",
    region: "Kerala",
    district: "Palakkad",
    description:
      "Ancient evergreen forest, cool highland air, and a protected landscape rich in wildlife.",
    image:
      "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1200&q=85",
    category: "Nature",
    tags: ["Rainforest", "Cool weather", "Wildlife"],
    personality: ["Introvert", "Adventure-seeking", "Peace-seeking"],
    costPerDay: 2600,
    costCurrency: "INR",
    lat: 11.0872,
    lng: 76.447,
    quietTime: "Morning",
    crowd: "Low",
    duration: "2–3 days",
  },
  {
    id: "kozhikode-city",
    name: "Kozhikode",
    country: "India",
    region: "Kerala",
    district: "Kozhikode",
    description:
      "A lively food city where beach evenings, old markets, cafés, and modern shopping meet.",
    image:
      "https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?auto=format&fit=crop&w=1200&q=85",
    category: "City",
    tags: ["Modern city", "Food scene", "Shopping"],
    personality: ["Extrovert", "Social", "Ambivert"],
    costPerDay: 2600,
    costCurrency: "INR",
    lat: 11.2588,
    lng: 75.7804,
    quietTime: "Evening",
    crowd: "High",
    duration: "2–3 days",
  },
  {
    id: "thrissur-city",
    name: "Thrissur",
    country: "India",
    region: "Kerala",
    district: "Thrissur",
    description:
      "Temple heritage, performance traditions, local food, and a compact cultural city centre.",
    image:
      "https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=1200&q=85",
    category: "Culture",
    tags: ["Performing arts", "Temple heritage", "Local food"],
    personality: ["Culture-seeking", "Social", "Ambivert"],
    costPerDay: 2200,
    costCurrency: "INR",
    lat: 10.5276,
    lng: 76.2144,
    quietTime: "Morning",
    crowd: "Moderate",
    duration: "1–2 days",
  },
  {
    id: "kochi-city",
    name: "Kochi City",
    country: "India",
    region: "Kerala",
    district: "Ernakulam",
    description:
      "Contemporary cafés, galleries, waterfront neighbourhoods, and Kerala’s widest urban mix.",
    image: KOCHI_CITY_IMAGE,
    category: "City",
    tags: ["Modern", "Cafés", "Nightlife"],
    personality: ["Extrovert", "Social", "Ambivert"],
    costPerDay: 3400,
    costCurrency: "INR",
    lat: 9.9816,
    lng: 76.2999,
    quietTime: "Evening",
    crowd: "High",
    duration: "2–4 days",
  },
];

export const discoveryItems: DiscoveryItem[] = [
  { id: "act-fort-kochi-art", title: "Fort Kochi art and heritage walk", kind: "Activities", district: "Ernakulam", locality: "Fort Kochi", description: "A self-paced route through galleries, heritage lanes, and the waterfront.", tags: ["art", "history", "modern", "walk"], budgetTiers: ["Budget", "Balanced", "Comfort", "Luxury"], priceHint: "Mostly free · allow for cafés and entry fees" },
  { id: "act-ponmudi-trail", title: "Ponmudi hill morning", kind: "Activities", district: "Thiruvananthapuram", locality: "Ponmudi", description: "Cool-weather viewpoints and short walks for an early hill escape.", tags: ["cool", "trek", "scenic", "outdoors"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "Low-cost day trip" },
  { id: "act-alappuzha-canoe", title: "Backwater canoe morning", kind: "Activities", district: "Alappuzha", locality: "Alappuzha", description: "A slower, smaller-boat look at canals and village life.", tags: ["romantic", "water", "quiet", "couple"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "Operator pricing varies" },
  { id: "act-wayanad-plantation", title: "Wayanad plantation and forest walk", kind: "Activities", district: "Wayanad", locality: "Kalpetta", description: "A green half-day shaped around viewpoints, plantations, and forest edges.", tags: ["cool", "nature", "hike", "family"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "Guide and access fees vary" },
  { id: "act-athirappilly", title: "Athirappilly waterfall trail", kind: "Activities", district: "Thrissur", locality: "Athirappilly", description: "A scenic waterfall outing with time for the forested river valley.", tags: ["cool", "waterfall", "adventure", "family"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "Entry and transport extra" },
  { id: "act-muzhappilangad", title: "Muzhappilangad coast drive", kind: "Activities", district: "Kannur", locality: "Muzhappilangad", description: "An open-road beach experience best paired with a relaxed sunset stop.", tags: ["drive", "sunset", "fun", "friends"], budgetTiers: ["Budget", "Balanced", "Comfort", "Luxury"], priceHint: "Fuel-led cost" },

  { id: "food-kozhikode", title: "Kozhikode flavour trail", kind: "Food", district: "Kozhikode", locality: "SM Street and beach area", description: "Build an evening around Malabar snacks, biryani, and something sweet.", tags: ["foodie", "local food", "street food", "modern"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "₹–₹₹ planning range" },
  { id: "food-fort-kochi", title: "Fort Kochi café afternoon", kind: "Food", district: "Ernakulam", locality: "Fort Kochi", description: "Contemporary cafés and Kerala flavours between gallery stops.", tags: ["cafe", "modern", "romantic", "art"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "₹₹ planning range" },
  { id: "food-thalassery", title: "Thalassery snack and biryani stop", kind: "Food", district: "Kannur", locality: "Thalassery", description: "A food-first detour through one of north Kerala’s best-known culinary towns.", tags: ["foodie", "heritage", "biryani", "local"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "₹–₹₹ planning range" },
  { id: "food-thrissur", title: "Thrissur vegetarian lunch", kind: "Food", district: "Thrissur", locality: "City centre", description: "A traditional Kerala meal that fits neatly into a culture-focused day.", tags: ["vegetarian", "family", "traditional", "local"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "₹–₹₹ planning range" },
  { id: "food-varkala", title: "Varkala cliff café evening", kind: "Food", district: "Thiruvananthapuram", locality: "Varkala", description: "Sea-view cafés and an easy dinner after a beach afternoon.", tags: ["romantic", "cafe", "sunset", "modern"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "₹₹–₹₹₹ planning range" },
  { id: "food-alappuzha", title: "Alappuzha waterside lunch", kind: "Food", district: "Alappuzha", locality: "Backwater belt", description: "A regional meal stop built around fish, rice, and backwater views.", tags: ["seafood", "local", "water", "family"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "₹–₹₹ planning range" },

  { id: "shop-lulu-kochi", title: "LuLu Mall Kochi", kind: "Shopping", district: "Ernakulam", locality: "Edappally", description: "A large modern shopping and entertainment stop with broad brand choice.", tags: ["mall", "modern", "brands", "family"], budgetTiers: ["Budget", "Balanced", "Comfort", "Luxury"], priceHint: "Free entry · spending varies" },
  { id: "shop-broadway", title: "Broadway market lanes", kind: "Shopping", district: "Ernakulam", locality: "Kochi", description: "Busy old-city lanes for textiles, spices, household goods, and local browsing.", tags: ["market", "local", "budget", "heritage"], budgetTiers: ["Budget", "Balanced"], priceHint: "Budget-friendly browsing" },
  { id: "shop-lulu-tvm", title: "LuLu Mall Thiruvananthapuram", kind: "Shopping", district: "Thiruvananthapuram", locality: "Akkulam", description: "A modern mall day with shopping, dining, and indoor entertainment.", tags: ["mall", "modern", "family", "rainy day"], budgetTiers: ["Budget", "Balanced", "Comfort", "Luxury"], priceHint: "Free entry · spending varies" },
  { id: "shop-chalai", title: "Chalai market", kind: "Shopping", district: "Thiruvananthapuram", locality: "East Fort", description: "A dense traditional market for spices, produce, textiles, and everyday Kerala life.", tags: ["market", "local", "spices", "budget"], budgetTiers: ["Budget", "Balanced"], priceHint: "Budget-friendly browsing" },
  { id: "shop-hilite", title: "HiLITE Mall Calicut", kind: "Shopping", district: "Kozhikode", locality: "Palazhi", description: "A contemporary shopping and entertainment option for a city day.", tags: ["mall", "modern", "cinema", "family"], budgetTiers: ["Budget", "Balanced", "Comfort", "Luxury"], priceHint: "Free entry · spending varies" },
  { id: "shop-sm-street", title: "SM Street", kind: "Shopping", district: "Kozhikode", locality: "City centre", description: "A classic pedestrian shopping street for sweets, clothing, and local finds.", tags: ["market", "food", "local", "heritage"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "₹–₹₹ planning range" },

  { id: "stay-kochi-budget", title: "Fort Kochi guesthouse", kind: "Stays", district: "Ernakulam", locality: "Fort Kochi", description: "A simple heritage-area base for walkable cafés, galleries, and waterfront evenings.", tags: ["heritage", "walkable", "couple", "budget"], budgetTiers: ["Budget", "Balanced"], priceHint: "Illustrative ₹1,500–₹3,500 / night" },
  { id: "stay-kochi-comfort", title: "Kochi waterfront hotel", kind: "Stays", district: "Ernakulam", locality: "Marine Drive", description: "A central city stay suited to business trips and comfortable urban weekends.", tags: ["modern", "city", "business", "waterfront"], budgetTiers: ["Comfort", "Luxury"], priceHint: "Illustrative ₹5,000+ / night" },
  { id: "stay-munnar", title: "Munnar tea-estate lodge", kind: "Stays", district: "Idukki", locality: "Munnar", description: "A cool-weather base surrounded by plantation scenery and quiet mornings.", tags: ["cool", "romantic", "nature", "views"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "Illustrative ₹3,000–₹8,000 / night" },
  { id: "stay-alappuzha", title: "Alappuzha backwater homestay", kind: "Stays", district: "Alappuzha", locality: "Backwater belt", description: "A personal, slower stay close to village canals and local meals.", tags: ["homestay", "romantic", "local", "water"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "Illustrative ₹2,000–₹5,000 / night" },
  { id: "stay-wayanad", title: "Wayanad forest-edge retreat", kind: "Stays", district: "Wayanad", locality: "Kalpetta area", description: "A nature-led base for families or couples planning plantation and trail days.", tags: ["forest", "family", "cool", "wellness"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "Illustrative ₹3,500–₹9,000 / night" },
  { id: "stay-varkala", title: "Varkala cliff guesthouse", kind: "Stays", district: "Thiruvananthapuram", locality: "Varkala", description: "An easy beach base for cafés, sunsets, and a relaxed couple’s break.", tags: ["beach", "romantic", "cafe", "sunset"], budgetTiers: ["Budget", "Balanced", "Comfort"], priceHint: "Illustrative ₹2,000–₹6,000 / night" },
  { id: "stay-kozhikode", title: "Kozhikode city boutique stay", kind: "Stays", district: "Kozhikode", locality: "City centre", description: "A modern base close to food streets, shopping, and the beach promenade.", tags: ["modern", "foodie", "shopping", "city"], budgetTiers: ["Balanced", "Comfort", "Luxury"], priceHint: "Illustrative ₹3,000–₹7,000 / night" },
  { id: "stay-bekal", title: "Bekal coast resort", kind: "Stays", district: "Kasaragod", locality: "Bekal", description: "A slower coastal stay suited to special occasions and fort-side exploring.", tags: ["luxury", "romantic", "coast", "wellness"], budgetTiers: ["Comfort", "Luxury"], priceHint: "Illustrative ₹6,000+ / night" },
];
