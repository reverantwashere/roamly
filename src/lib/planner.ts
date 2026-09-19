import type { CrowdLevel, Destination } from "./data";

export type BudgetPreference = "budget" | "balanced" | "comfort" | number;

export interface ItineraryActivity {
  time: string;
  title: string;
  description: string;
  /** Budget allocation for the whole party, in `currency`; never a market quote. */
  cost: number;
  currency: string;
  costLabel: "Estimated budget allocation";
  crowd: CrowdLevel;
  provenance: "Estimated";
}

export interface ItineraryDay {
  day: number;
  title: string;
  activities: ItineraryActivity[];
}

type Landmark = {
  title: string;
  description: string;
  style: "quiet" | "active" | "social";
};

const landmarkPlans: Record<string, Landmark[]> = {
  munnar: [
    {
      title: "Tea garden viewpoints",
      description:
        "Enjoy the tea-covered hills from public viewpoints and confirm permission before entering estates.",
      style: "quiet",
    },
    {
      title: "Echo Point",
      description:
        "Plan a scenic stop and check local access before travelling.",
      style: "active",
    },
    {
      title: "Munnar town",
      description: "Browse local shops and settle into an unhurried lunch.",
      style: "social",
    },
    {
      title: "Mattupetty waterside",
      description:
        "Leave time for lake views; check local conditions and permitted viewing areas.",
      style: "quiet",
    },
    {
      title: "Munnar Tea Museum",
      description:
        "Explore the region’s tea story after confirming current visiting arrangements.",
      style: "active",
    },
    {
      title: "Munnar local market",
      description: "Make room for local food and a relaxed evening in town.",
      style: "social",
    },
  ],
  wayanad: [
    {
      title: "Pookode Lake",
      description:
        "Take time for lakeside scenery after confirming current access.",
      style: "quiet",
    },
    {
      title: "Edakkal Caves",
      description:
        "Check opening status, steps, and fitness requirements before choosing this visit.",
      style: "active",
    },
    {
      title: "Kalpetta town",
      description: "Explore local shops and find a comfortable lunch stop.",
      style: "social",
    },
    {
      title: "Lakkidi viewpoint",
      description: "Enjoy a scenic pause from a designated viewpoint.",
      style: "quiet",
    },
    {
      title: "Banasura Sagar surroundings",
      description:
        "Explore permitted reservoir viewpoints and check local conditions.",
      style: "active",
    },
    {
      title: "Sulthan Bathery",
      description: "Browse the town and choose a relaxed local meal.",
      style: "social",
    },
  ],
  varkala: [
    {
      title: "Varkala cliff walk",
      description:
        "Enjoy coastal views from permitted paths, keeping clear of cliff edges.",
      style: "quiet",
    },
    {
      title: "Papanasam Beach",
      description:
        "Plan a beach visit and follow local lifeguard advice; swimming conditions are not verified.",
      style: "active",
    },
    {
      title: "North Cliff cafés",
      description: "Choose a café for a relaxed meal and conversation.",
      style: "social",
    },
    {
      title: "Odayam Beach surroundings",
      description: "Take a quiet coastal stroll and check local access.",
      style: "quiet",
    },
    {
      title: "Kappil backwater viewpoints",
      description: "Plan a scenic stop and confirm transport arrangements.",
      style: "active",
    },
    {
      title: "Varkala town",
      description: "Explore local food and shops at your own pace.",
      style: "social",
    },
  ],
  alappuzha: [
    {
      title: "Alappuzha canal walk",
      description:
        "Take a slow walk along accessible public canal-side streets.",
      style: "quiet",
    },
    {
      title: "Alappuzha Beach",
      description:
        "Enjoy the waterfront from public areas and follow local sea-condition advice.",
      style: "active",
    },
    {
      title: "Alappuzha town",
      description: "Discover local food and leave time for a relaxed lunch.",
      style: "social",
    },
    {
      title: "Kuttanad village scenery",
      description:
        "Explore public village roads and respect residents’ privacy.",
      style: "quiet",
    },
    {
      title: "Backwater boat planning",
      description:
        "Choose a licensed operator and confirm safety equipment, availability, and price directly.",
      style: "active",
    },
    {
      title: "Mullakkal neighbourhood",
      description: "Browse town streets and local shops at a comfortable pace.",
      style: "social",
    },
  ],
  "fort-kochi": [
    {
      title: "Fort Kochi heritage walk",
      description:
        "Explore the waterfront and historic streets at an unhurried pace.",
      style: "quiet",
    },
    {
      title: "Mattancherry streets",
      description:
        "Plan a neighbourhood walk with time to pause along the way.",
      style: "active",
    },
    {
      title: "Princess Street cafés",
      description: "Choose a local café and leave room for conversation.",
      style: "social",
    },
    {
      title: "St Francis Church surroundings",
      description:
        "Explore the area respectfully and confirm access before entering.",
      style: "quiet",
    },
    {
      title: "Mattancherry Palace",
      description:
        "Check current admission and visiting arrangements before setting out.",
      style: "active",
    },
    {
      title: "Jew Town shops",
      description:
        "Browse the streets and learn about the area’s heritage with respect for residents.",
      style: "social",
    },
  ],
  thekkady: [
    {
      title: "Periyar scenery",
      description:
        "Enjoy designated public viewpoints and confirm reserve access in advance.",
      style: "quiet",
    },
    {
      title: "Periyar guided nature options",
      description:
        "Choose only authorised forest activities and confirm permits, conditions, and fitness requirements.",
      style: "active",
    },
    {
      title: "Kumily town",
      description: "Browse spice shops and enjoy a relaxed local lunch.",
      style: "social",
    },
    {
      title: "Spice garden visit",
      description:
        "Arrange a visit with a local garden and confirm its admission and access details.",
      style: "quiet",
    },
    {
      title: "Periyar Lake outing",
      description:
        "Check official operator availability and safety requirements; no boat booking is included.",
      style: "active",
    },
    {
      title: "Kumily evening",
      description: "Leave time for local food and an unhurried evening.",
      style: "social",
    },
  ],
  vagamon: [
    {
      title: "Vagamon meadows",
      description:
        "Enjoy the hill scenery from designated paths and check current access.",
      style: "quiet",
    },
    {
      title: "Vagamon pine forest",
      description:
        "Choose a comfortable walk after checking trail and weather conditions.",
      style: "active",
    },
    {
      title: "Vagamon town",
      description: "Take a café break and explore local food.",
      style: "social",
    },
    {
      title: "Vagamon lake surroundings",
      description: "Pause for a relaxed lakeside view from permitted areas.",
      style: "quiet",
    },
    {
      title: "Kurisumala surroundings",
      description:
        "Consider a suitable walk after checking access, weather, and your group’s fitness.",
      style: "active",
    },
    {
      title: "Vagamon market stops",
      description: "Leave time for local shops and a shared meal.",
      style: "social",
    },
  ],
  athirappilly: [
    {
      title: "Athirappilly waterfall viewpoint",
      description:
        "Enjoy the falls from designated viewing areas and follow staff advice.",
      style: "quiet",
    },
    {
      title: "Vazhachal surroundings",
      description:
        "Check access and conditions before a scenic visit; stay out of restricted river areas.",
      style: "active",
    },
    {
      title: "Athirappilly local lunch",
      description: "Choose a nearby meal stop and take an unhurried break.",
      style: "social",
    },
    {
      title: "Chalakudy river scenery",
      description:
        "Enjoy river views from safe designated areas without entering the water.",
      style: "quiet",
    },
    {
      title: "Thumboormuzhi gardens",
      description:
        "Confirm opening status and facilities before planning a garden visit.",
      style: "active",
    },
    {
      title: "Chalakudy town",
      description:
        "Explore local food and shops as part of your return journey.",
      style: "social",
    },
  ],
  kumarakom: [
    {
      title: "Vembanad lakeside",
      description:
        "Take time for lake views from public or permitted access points.",
      style: "quiet",
    },
    {
      title: "Kumarakom Bird Sanctuary",
      description:
        "Check current access and trail conditions; wildlife sightings are not guaranteed.",
      style: "active",
    },
    {
      title: "Kumarakom village",
      description: "Explore local food and craft at a relaxed pace.",
      style: "social",
    },
    {
      title: "Village canal walk",
      description:
        "Follow public village paths and respect residents’ privacy.",
      style: "quiet",
    },
    {
      title: "Backwater boat options",
      description:
        "Choose a licensed operator and confirm safety equipment, availability, and price directly.",
      style: "active",
    },
    {
      title: "Kumarakom local lunch",
      description: "Make room for a relaxed meal and conversation.",
      style: "social",
    },
  ],
};

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite non-negative number.`);
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be greater than zero.`);
}

/** Distance in km, mileage in km/L, price in the user's currency per litre. */
export function fuelCost(
  distance: number,
  mileage: number,
  price: number,
): number {
  finiteNonNegative(distance, "Distance");
  positive(mileage, "Mileage");
  finiteNonNegative(price, "Fuel price");
  return (distance / mileage) * price;
}

/** Tank capacity in litres, user-provided fuel level in percent, mileage in km/L. */
export function remainingRange(
  tankCapacity: number,
  fuelLevel: number,
  mileage: number,
): number {
  positive(tankCapacity, "Tank capacity");
  positive(mileage, "Mileage");
  finiteNonNegative(fuelLevel, "Fuel level");
  if (fuelLevel > 100)
    throw new RangeError("Fuel level must be between 0 and 100 percent.");
  return tankCapacity * (fuelLevel / 100) * mileage;
}

/** Equal share before currency rounding. */
export function splitExpense(amount: number, people: number): number {
  finiteNonNegative(amount, "Amount");
  if (!Number.isInteger(people) || people <= 0)
    throw new RangeError("People must be a positive whole number.");
  return amount / people;
}

/**
 * A deterministic starting point built from curated examples, not an AI or a
 * routing engine. Numeric budget means the user's selected currency per person
 * per day; allocation uses fixed fractions without converting currencies. Named
 * budget preferences use the destination’s local illustrative baseline. Costs are
 * group activity/meal budget allocations, not admission or booking prices, and
 * exclude accommodation and travel to the destination.
 * Times and crowd levels are suggestions; check local access before travelling.
 */
export function buildItinerary(
  destination: Destination,
  days: number,
  personality: string | string[] = "Ambivert",
  budget: BudgetPreference = "balanced",
  people = 1,
  currency = destination.costCurrency ?? "USD",
  travelGroup = "Solo",
): ItineraryDay[] {
  if (!Number.isInteger(days) || days < 1 || days > 30)
    throw new RangeError("Choose between 1 and 30 whole days.");
  splitExpense(0, people);
  const multiplier = { budget: 0.7, balanced: 1, comfort: 1.5 };
  const dailyAllowance =
    typeof budget === "number"
      ? budget
      : destination.costPerDay * multiplier[budget];
  finiteNonNegative(dailyAllowance, "Daily budget");
  const family = travelGroup.toLowerCase() === "family";
  const groupNote: Record<string, string> = {
    family:
      "Keep a relaxed pace with rest breaks; confirm step-free access, toilets, and facilities with the venue if needed.",
    couple: "Leave time for a shared café break and unhurried views.",
    friends:
      "Choose a pace together and agree on a meeting point before exploring.",
    group:
      "Agree on transport, a shared pace, and a meeting point before exploring.",
  };
  const styles = (
    Array.isArray(personality) ? personality.join(" ") : personality
  ).toLowerCase();
  const quiet = /introvert|peace|quiet|slow/.test(styles);
  const social = !quiet && /extrovert|social/.test(styles);
  const active = !quiet && !social && /adventure|active/.test(styles);
  const landmarks =
    landmarkPlans[destination.id] ??
    ([
      {
        title: `${destination.name} at your pace`,
        description:
          "Explore the area and confirm local access before heading out.",
        style: "quiet",
      },
      {
        title: "Discover the neighbourhood",
        description: "Leave time for local sights and regular breaks.",
        style: "active",
      },
      {
        title: "A taste of the destination",
        description: "Choose a local meal that suits your group and budget.",
        style: "social",
      },
    ] satisfies Landmark[]);
  const preferredStyle = quiet
    ? "quiet"
    : social
      ? "social"
      : active
        ? "active"
        : undefined;
  const ordered = [...landmarks].sort(
    (a, b) =>
      Number(b.style === preferredStyle) - Number(a.style === preferredStyle),
  );
  const windows = family
    ? ["09:00", "14:00"]
    : quiet
      ? ["07:30", "11:00", "16:00"]
      : social
        ? ["09:00", "13:00", "18:00"]
        : ["08:30", "12:30", "17:00"];
  const titles = quiet
    ? [
        "A gentle introduction",
        "Find your quieter corners",
        "Slow down and explore",
      ]
    : social
      ? [
          "Meet the destination",
          "Local flavours and lively streets",
          "Make room for connection",
        ]
      : active
        ? [
            "A fresh perspective",
            "Take the scenic route",
            "A little further afield",
          ]
        : [
            "Settle into the rhythm",
            "Explore a little further",
            "Your kind of adventure",
          ];

  return Array.from({ length: days }, (_, dayIndex) => ({
    day: dayIndex + 1,
    title: titles[dayIndex % titles.length],
    activities: windows.map<ItineraryActivity>((time, slot) => {
      const landmark =
        ordered[(dayIndex * windows.length + slot) % ordered.length];
      const allowanceShare = [0.12, 0.2, 0.18][slot];
      return {
        time,
        title: landmark.title,
        description: [
          landmark.description,
          groupNote[travelGroup.toLowerCase()],
        ]
          .filter(Boolean)
          .join(" "),
        cost: Math.round(dailyAllowance * allowanceShare * people * 100) / 100,
        currency:
          typeof budget === "number"
            ? currency
            : (destination.costCurrency ?? "USD"),
        costLabel: "Estimated budget allocation",
        crowd:
          quiet && slot === 0
            ? "Low"
            : landmark.style === "social"
              ? "Moderate"
              : destination.crowd,
        provenance: "Estimated",
      };
    }),
  }));
}
