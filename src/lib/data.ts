export type DestinationCategory =
  "Nature" | "Adventure" | "Culture" | "Coast" | "City";
export type CrowdLevel = "Low" | "Moderate" | "High";

export interface Destination {
  id: string;
  name: string;
  country: string;
  region: string;
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

export const categories = [
  "All places",
  "Nature",
  "Adventure",
  "Culture",
  "Coast",
  "City",
] as const;

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
];
