import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BedDouble,
  Building2,
  CalendarDays,
  CarFront,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronRight,
  Compass,
  CreditCard,
  Fuel,
  Globe2,
  Heart,
  House,
  Leaf,
  List,
  LoaderCircle,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageCircle,
  Mountain,
  Navigation,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Users,
  UtensilsCrossed,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import {
  destinations,
  discoveryItems,
  distanceFromHometown,
  keralaDistricts,
  keralaHometowns,
  type BudgetTier,
  type Destination,
  type DiscoveryKind,
} from "./lib/data";
import { destinationForDiscovery } from "./lib/discovery";
import { normalizePersonality } from "./lib/preferences";
import { hasIntentExpansion, intentScore } from "./lib/search";
import { remainingRange } from "./lib/planner";
import { supabase } from "./lib/supabase";
import { signOutAndLoadGuest } from "./lib/sessionRecovery";
import { useTheme } from "./lib/useTheme";
import { tripImage } from "./lib/photos";
import ThemeSwitcher from "./components/ThemeSwitcher";
import {
  api,
  currencies,
  dateLabel,
  money,
  type Page,
  type Profile,
  type Session,
  type Trip,
  type Vehicle,
} from "./types";
import DestinationCard from "./components/DestinationCard";
import DestinationMap from "./components/DestinationMap";
import Modal from "./components/Modal";
import {
  AuthModal,
  OnboardingModal,
  PlannerModal,
  VehicleModal,
  ExpenseModal,
  FuelModal,
  FuelCalculator,
  ErrorMessage,
  type AuthMode,
} from "./components/Forms";

type ModalType =
  | "auth"
  | "onboarding"
  | "planner"
  | "place"
  | "trip"
  | "vehicle"
  | "expense"
  | "fuel"
  | "notifications"
  | "deleteAccount"
  | "deleteTrip"
  | "deleteVehicle"
  | null;

const phoneRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
const phoneCountries = getCountries()
  .map((country) => ({
    country,
    name: phoneRegionNames.of(country) || country,
    callingCode: getCountryCallingCode(country),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const navItems: {
  id: Page;
  label: string;
  icon: typeof House;
  soon?: boolean;
}[] = [
  { id: "home", label: "Overview", icon: House },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "trips", label: "My trips", icon: MapIcon },
  { id: "vehicle", label: "My vehicle", icon: CarFront },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "social", label: "Travel circle", icon: Users, soon: true },
  { id: "ai", label: "Roamly assistant", icon: Sparkles, soon: true },
];
const categoryOptions = [
  { name: "For you", icon: Sparkles },
  { name: "Nature", icon: Leaf },
  { name: "Adventure", icon: Mountain },
  { name: "Culture", icon: Globe2 },
  { name: "Coast", icon: Waves },
  { name: "City", icon: Building2 },
];
type ExploreMode = "Places" | DiscoveryKind;
const exploreModes: { name: ExploreMode; icon: typeof Compass }[] = [
  { name: "Places", icon: Compass },
  { name: "Activities", icon: Sparkles },
  { name: "Food", icon: UtensilsCrossed },
  { name: "Shopping", icon: ShoppingBag },
  { name: "Stays", icon: BedDouble },
];
const routedPages = new Set<Page>([
  "home",
  "explore",
  "trips",
  "vehicle",
  "expenses",
  "social",
  "ai",
  "saved",
  "profile",
]);
function pageFromLocation(): Page {
  const candidate = new URLSearchParams(window.location.search).get("page") as Page | null;
  return candidate && routedPages.has(candidate) ? candidate : "home";
}
function IconBox({
  icon: Icon,
  color = "sage",
}: {
  icon: typeof Leaf;
  color?: string;
}) {
  return (
    <div className={`section-icon ${color}`}>
      <Icon size={19} />
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Leaf;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty-state">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={action.onClick}>
          {action.label}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
function App() {
  const theme = useTheme();
  const initialAuthMode = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("resetToken") || params.get("recovery") === "password"
      ? "reset"
      : undefined;
  })() as AuthMode | undefined;
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadRecovery, setLoadRecovery] = useState<"retry" | "signout" | null>(null);
  const [loadRecoveryError, setLoadRecoveryError] = useState("");
  const [page, setPage] = useState<Page>(pageFromLocation);
  const [modal, setModal] = useState<ModalType>(initialAuthMode ? "auth" : null);
  const [authMode, setAuthMode] = useState<AuthMode | undefined>(initialAuthMode);
  const [selectedPlace, setSelectedPlace] = useState<Destination>();
  const [selectedTrip, setSelectedTrip] = useState<Trip>();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle>();
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("For you");
  const [exploreMode, setExploreMode] = useState<ExploreMode>("Places");
  const [exploreDistrict, setExploreDistrict] = useState("All Kerala");
  const [stayBudget, setStayBudget] = useState<BudgetTier>("Balanced");
  const [mapView, setMapView] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const locationPicker = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expenseTrip, setExpenseTrip] = useState("all");
  const [expenseCurrency, setExpenseCurrency] = useState("INR");
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback(
    (message: string, tone: "success" | "error" = "success") => setToast({ message, tone }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const next = await api<Session>("/session");
      setSession(next);
      setLoadError("");
      return next;
    } catch (e) {
      setLoadError((e as Error).message);
      throw e;
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    if (!supabase) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("reset");
        setModal("auth");
      }
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Auth calls must run after Supabase releases the event callback lock.
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, 0);
      }
    });
    return () => {
      clearTimeout(refreshTimer);
      data.subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    if (session && !session.user.isGuest && session.profile.onboarded !== true && modal === null) {
      setModal("onboarding");
    }
  }, [session, modal]);
  useEffect(() => {
    const savedBudget = session?.profile.budget;
    if (["Budget", "Balanced", "Comfort", "Luxury"].includes(String(savedBudget))) {
      setStayBudget(savedBudget as BudgetTier);
    }
  }, [session?.profile.budget]);
  useEffect(() => {
    const nextTrip = session?.trips.find(
      (trip) => trip.status?.toLowerCase() !== "completed",
    );
    const tripPlace = destinations.find(
      (place) => place.name === nextTrip?.destination,
    );
    if (tripPlace?.district && !nextTrip?.isExample) {
      setExploreDistrict((current) =>
        current === "All Kerala" ? tripPlace.district : current,
      );
    }
  }, [session?.trips]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromLocation());
      setSidebarOpen(false);
      setLocationOpen(false);
      setModal((current) => current === "onboarding" ? current : null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!locationOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!locationPicker.current?.contains(event.target as Node)) setLocationOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLocationOpen(false);
        locationPicker.current?.querySelector<HTMLButtonElement>(".location-button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [locationOpen]);
  useEffect(() => {
    if (session?.user.isGuest && page === "profile") {
      setPage("home");
      const url = new URL(window.location.href);
      url.searchParams.delete("page");
      window.history.replaceState({ page: "home" }, "", url);
      setModal("auth");
    }
  }, [page, session?.user.isGuest]);
  useEffect(() => {
    if (!session || session.user.isGuest) {
      setFuelRecords([]);
      return;
    }
    if (page !== "vehicle") return;
    let cancelled = false;
    api("/fuel-records")
      .then((data) => { if (!cancelled) setFuelRecords(data.fuelRecords || []); })
      .catch((e) => { if (!cancelled) notify(e.message, "error"); });
    return () => { cancelled = true; };
  }, [page, session, notify]);
  function navigate(next: Page) {
    if (next === "profile" && session?.user.isGuest) {
      setSidebarOpen(false);
      setModal("auth");
      return;
    }
    setPage(next);
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("page");
    else url.searchParams.set("page", next);
    if (url.href !== window.location.href)
      window.history.pushState({ page: next }, "", url);
    setSidebarOpen(false);
    setLocationOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (next !== "explore") setSearch("");
  }
  function planner(place?: Destination) {
    if (session?.user.isGuest) {
      setModal("auth");
      return;
    }
    setSelectedPlace(place);
    setModal("planner");
  }
  function openEditor(kind: "vehicle" | "fuel" | "expense" | "deleteVehicle" | "deleteTrip") {
    setModal(session?.user.isGuest ? "auth" : kind);
  }
  function openPlace(place: Destination) {
    setSelectedPlace(place);
    setModal("place");
  }
  function openTrip(trip: Trip) {
    setSelectedTrip(trip);
    setModal("trip");
  }
  async function savePlace(id: string) {
    if (session?.user.isGuest) {
      setModal("auth");
      return;
    }
    try {
      const data = await api("/saved-places", { placeId: id });
      setSession((s) => (s ? { ...s, savedPlaces: data.savedPlaces } : s));
      notify(
        data.savedPlaces.includes(id)
          ? "A little inspiration, saved."
          : "Place removed from your collection.",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function chooseLocation(city: string) {
    setLocationOpen(false);
    if (user.isGuest) {
      setSession((current) => current ? { ...current, profile: { ...current.profile, city } } : current);
      notify(`Showing Roamly from ${city}.`);
      return;
    }
    try {
      await api("/profile", { ...profile, city }, "PUT");
      await refresh();
      notify(`Home location changed to ${city}.`);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function removeEntity(type: "trips" | "vehicles", id: string) {
    setBusy(true);
    try {
      await api(`/${type}/${id}`, undefined, "DELETE");
      await refresh();
      closeModal();
      notify(type === "trips" ? "Trip deleted." : "Vehicle removed.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const handleSaved = () => {
    refresh().catch(() => {});
    notify("All set. Your changes are saved.");
  };
  if (!session)
    return (
      <div className="loading-screen">
        <div className="loading-theme"><ThemeSwitcher {...theme} /></div>
        <div className="brand">
          <span className="brand-icon">
            <Navigation size={25} />
          </span>
          roamly<span className="brand-dot">.</span>
        </div>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button
              className="button primary"
              disabled={loadRecovery !== null}
              onClick={async () => {
                setLoadRecovery("retry");
                setLoadRecoveryError("");
                try { await refresh(); } catch { /* Keep the loading error visible. */ }
                finally { setLoadRecovery(null); }
              }}
            >
              {loadRecovery === "retry" && <LoaderCircle size={15} className="spin" />}
              Try again
            </button>
            {supabase && (
              <button
                className="button secondary"
                disabled={loadRecovery !== null}
                onClick={async () => {
                  if (!supabase) return;
                  setLoadRecovery("signout");
                  setLoadRecoveryError("");
                  try {
                    const guest = await signOutAndLoadGuest(supabase.auth, () => api<Session>("/session"));
                    setSession(guest);
                    setLoadError("");
                    setAuthMode(undefined);
                    closeModal();
                    navigate("home");
                  } catch (error) {
                    setLoadRecoveryError((error as Error).message);
                  } finally {
                    setLoadRecovery(null);
                  }
                }}
              >
                {loadRecovery === "signout" ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />}
                Sign out and browse
              </button>
            )}
            {loadRecoveryError && <p role="alert">{loadRecoveryError}</p>}
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={25} />
            <p>Finding a little room to wander…</p>
          </>
        )}
      </div>
    );
  const { user, trips, vehicles, expenses, savedPlaces } = session;
  const profile = { ...session.profile, personality: normalizePersonality(session.profile.personality) };
  const firstName =
    profile.name?.split(" ")[0] || user.name?.split(" ")[0] || "traveller";
  const vehicle = vehicles[0];
  const upcoming = trips.find((t) => t.status?.toLowerCase() !== "completed");
  const nearbyPlaces = destinations.map((place) => ({
    ...place,
    distanceKm: distanceFromHometown(profile.city, place),
  })).sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE));
  const personalizedPlaces = [...nearbyPlaces].sort((a, b) => {
    const score = (p: Destination) =>
      p.personality.filter(
        (style) => style.toLowerCase() === profile.personality.toLowerCase(),
      ).length *
        3 +
      (profile.interests || []).filter(
        (interest) =>
          p.category.toLowerCase() === interest.toLowerCase() ||
          p.tags.some((tag) =>
            tag.toLowerCase().includes(interest.toLowerCase()),
          ),
      ).length;
    const proximity = (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
    return Math.abs(proximity) < 25 ? score(b) - score(a) : proximity;
  });
  const matchedPlaces = (
    category === "For you" ? personalizedPlaces : nearbyPlaces
  )
    .filter((place) => category === "For you" || place.category === category)
    .map((place) => ({
      place,
      score: intentScore(search, [
        place.name,
        place.country,
        place.region,
        place.district,
        place.category,
        place.description,
        place.tags.join(" "),
        place.personality.join(" "),
        `${place.crowd} crowds`,
        place.quietTime,
      ]),
    }))
    .filter(({ score }) => !search || score > 0)
    .sort((a, b) => (search ? b.score - a.score : 0))
    .map(({ place }) => place);
  const matchedDiscoveries = discoveryItems
    .filter((item) => item.kind === exploreMode)
    .filter(
      (item) =>
        exploreDistrict === "All Kerala" || item.district === exploreDistrict,
    )
    .filter(
      (item) => exploreMode !== "Stays" || item.budgetTiers.includes(stayBudget),
    )
    .map((item) => ({
      item,
      score: intentScore(search, [
        item.title,
        item.kind,
        item.district,
        item.locality,
        item.description,
        item.tags.join(" "),
        item.budgetTiers.join(" "),
      ]),
    }))
    .filter(({ score }) => !search || score > 0)
    .sort((a, b) => (search ? b.score - a.score : 0))
    .map(({ item }) => item);
  const featuredPlace = personalizedPlaces[0] || destinations[0];
  const interests = profile.interests?.length
    ? profile.interests
    : ["Nature", "Culture"];
  const matchingExpenses = expenses.filter(
    (e) =>
      (expenseTrip === "all" || e.tripId === expenseTrip) &&
      e.currency === expenseCurrency,
  );
  const totalExpenses = matchingExpenses.reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );
  const matchingBudget = trips
    .filter(
      (t) =>
        (expenseTrip === "all" || t.id === expenseTrip) &&
        t.currency === expenseCurrency,
    )
    .reduce((sum, t) => sum + Number(t.budget), 0);
  const homeCurrency = upcoming?.currency || profile.currency || "INR";
  const tripSpent = expenses
    .filter((e) => e.tripId === upcoming?.id && e.currency === homeCurrency)
    .reduce((s, e) => s + Number(e.amount), 0);
  const homeBudget = Number(upcoming?.budget) || 0;
  const budgetPercent = homeBudget
    ? Math.min(100, (tripSpent / homeBudget) * 100)
    : 0;
  const range = vehicle
    ? remainingRange(vehicle.tankCapacity, vehicle.fuelLevel, vehicle.mileage)
    : 0;
  return (
    <div className="app-shell">
      <div
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="Roamly home"
        >
          <span className="brand-icon">
            <Navigation size={24} fill="currentColor" />
          </span>
          roamly<span className="brand-dot">.</span>
        </button>
        <div className="beta-label">
          <span />
          KERALA BETA
        </div>
        <div className="workspace-caption">YOUR NEXT CHAPTER</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon, soon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {soon && <small>SOON</small>}
              {page === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="workspace-caption second-caption">YOUR SPACE</div>
        <nav className="main-nav secondary-nav" aria-label="Your space">
          <button
            className={`nav-item ${page === "saved" ? "active" : ""}`}
            onClick={() => navigate("saved")}
          >
            <Heart size={19} />
            <span>Saved places</span>
            {savedPlaces.length > 0 && (
              <span className="nav-count">{savedPlaces.length}</span>
            )}
          </button>
          {user.isGuest ? (
            <button className="nav-item" onClick={() => setModal("auth")}>
              <LogIn size={19} />
              <span>Login / Sign up</span>
            </button>
          ) : (
            <button
              className={`nav-item ${page === "profile" ? "active" : ""}`}
              onClick={() => navigate("profile")}
            >
              <SlidersHorizontal size={19} />
              <span>Travel profile</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-spark">
              <Sprout size={24} />
            </span>
            <h4>
              A world that feels
              <br />a little more like you.
            </h4>
            <p>
              Your preferences. Your pace.
              <br />
              Your kind of journey.
            </p>
            <button onClick={() => navigate("profile")}>
              Make it yours
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="sidebar-profile"
            onClick={() =>
              user.isGuest ? setModal("auth") : navigate("profile")
            }
          >
            <div className="avatar">{firstName.charAt(0)}</div>
            <span>
              <strong>{profile.name || user.name}</strong>
              <small>
                {user.isGuest
                  ? "Sign in to save your plans"
                  : "Roamly explorer"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-context">
              Your Kerala chapter starts here
              <span className="tiny-leaf">
                <Leaf size={13} />
              </span>
            </span>
          </div>
          <div className="topbar-actions">
            <div className="header-search">
              <Search size={16} />
              <input
                aria-label="Search destinations"
                placeholder="Where to next?"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (page !== "explore") {
                    navigate("explore");
                    setCategory("For you");
                    setExploreMode("Places");
                    setExploreDistrict("All Kerala");
                    setMapView(false);
                  }
                }}
              />
            </div>
            <div ref={locationPicker} className={`location-picker ${locationOpen ? "open" : ""}`}>
              <button
                className="location-button"
                onClick={() => setLocationOpen((open) => !open)}
                aria-label={`Choose location, current ${profile.city || "not set"}`}
                aria-controls="location-options"
                aria-expanded={locationOpen}
              >
                <MapPin size={15} />
                <span>{profile.city || "Set your city"}</span>
                <ChevronDown size={12} />
              </button>
              {locationOpen && (
                <div id="location-options" className="location-dropdown" role="group" aria-label="Choose your Kerala location">
                  <span>YOUR AREA</span>
                  {keralaHometowns.map(([city]) => (
                    <button key={city} aria-pressed={profile.city === city} onClick={() => chooseLocation(city)}>
                      <MapPin size={13} />
                      {city}
                      {profile.city === city && <Check size={13} />}
                    </button>
                  ))}
                  <button className="location-edit" onClick={() => { setLocationOpen(false); navigate("profile"); }}>
                    Edit full travel profile
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>
            <div className="header-divider" />
            <ThemeSwitcher {...theme} />
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
            </button>
            <button
              className="avatar header-avatar"
              onClick={() =>
                user.isGuest ? setModal("auth") : navigate("profile")
              }
              aria-label={user.isGuest ? "Create an account" : "Open profile"}
            >
              {firstName.charAt(0)}
            </button>
          </div>
        </header>
        <main className={`main-content page-${page}`}>
          {page === "home" && (
            <>
              <div className="page-heading home-heading">
                <div>
                  <div className="greeting">
                    A little room to wander <Sun size={16} />
                  </div>
                  <h1>
                    Hey {firstName}, where to next?
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>New places. Open roads. A journey that feels like you.</p>
                </div>
                <button className="button primary" onClick={() => planner()}>
                  <Plus size={17} />
                  Plan a trip
                </button>
              </div>
              <div className="hero-row">
                <section
                  className="hero"
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgba(18,39,32,.79) 0%,rgba(20,47,37,.46) 45%,rgba(20,47,37,.02) 100%),url(${featuredPlace.image})`,
                  }}
                >
                  <div className="hero-content">
                    <span className="hero-eyebrow">
                      <span />
                      LESS SCROLLING. MORE WANDERING.
                    </span>
                    <h2>
                      Find your next
                      <br />
                      kind of happy.
                    </h2>
                    <p>
                      Quiet corners or a little adventure.
                      <br />
                      There’s a place with your name on it.
                    </p>
                    <button
                      className="button cream"
                      onClick={() => {
                        setCategory("For you");
                        navigate("explore");
                      }}
                    >
                      Find my kind of place
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <span className="hero-location">
                    <MapPin size={13} />
                    {featuredPlace.name}, Kerala
                  </span>
                  <span className="hero-pagination">
                    <b />
                    <i />
                    <i />
                  </span>
                </section>
                <section className="profile-card">
                  <span className="eyebrow">
                    <Leaf size={13} />
                    THE WAY YOU WANDER
                  </span>
                  <div className="profile-art">
                    <div className="art-orbit orbit-one" />
                    <div className="art-orbit orbit-two" />
                    <div className="art-leaf leaf-one" />
                    <div className="art-leaf leaf-two" />
                    <div className="art-sun" />
                    <Compass
                      className="art-compass"
                      size={41}
                      strokeWidth={1.2}
                    />
                  </div>
                  <h3>
                    A little peace.
                    <br />A little possibility.
                  </h3>
                  <p>
                    Good trips start with knowing
                    <br />
                    what makes you, you.
                  </p>
                  <div className="profile-tags">
                    <span>
                      <Leaf size={12} />
                      {profile.personality || "Peace-seeking"}
                    </span>
                    <span>{interests[0]}</span>
                  </div>
                  <button onClick={() => navigate("profile")}>
                    Fine-tune your travel style
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <section className="roamly-value">
                <div>
                  <span className="eyebrow">WHY ROAMLY</span>
                  <h2>One Kerala plan, shaped around you.</h2>
                  <p>
                    Start with how you like to travel. Roamly connects nearby
                    places, things to do, food, shopping, and stays to your
                    district and budget—then turns them into one personal trip.
                  </p>
                </div>
                <div className="value-points">
                  <span><MapPin size={15} /> Near your area</span>
                  <span><SlidersHorizontal size={15} /> Matches your pace</span>
                  <span><Wallet size={15} /> Fits your budget</span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setExploreMode("Activities");
                    navigate("explore");
                  }}
                >
                  Explore the district guide
                  <ArrowRight size={15} />
                </button>
              </section>
              <section className="recommendations">
                <div className="section-title">
                  <div>
                    <h2>
                      Away from the ordinary
                      <span className="small-spark">✧</span>
                    </h2>
                    <p>A few places we think you’ll feel at home.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("explore")}
                  >
                    Explore all places
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div
                  className="category-tabs"
                  role="group"
                  aria-label="Destination interests"
                >
                  {categoryOptions.map(({ name, icon: Icon }) => (
                    <button
                      className={category === name ? "active" : ""}
                      onClick={() => setCategory(name)}
                      key={name}
                    >
                      <Icon size={15} />
                      {name}
                    </button>
                  ))}
                  <span className="recommendation-note">
                    <SlidersHorizontal size={13} />
                    Inspired by your travel style
                  </span>
                </div>
                <div className="destination-grid">
                  {matchedPlaces.slice(0, 4).map((place) => (
                    <DestinationCard
                      key={place.id}
                      place={place}
                      saved={savedPlaces.includes(place.id)}
                      onSave={() => savePlace(place.id)}
                      onOpen={() => openPlace(place)}
                    />
                  ))}
                </div>
              </section>
              <section className="journey-section">
                <div className="section-title">
                  <div>
                    <h2>A little planning, a lot of possibility</h2>
                    <p>Everything for the journey, in one place.</p>
                  </div>
                  <span className="small-muted">
                    {upcoming?.isExample || vehicle?.isExample
                      ? "Your sample travel space"
                      : "Your travel space"}
                  </span>
                </div>
                <div className="dashboard-bottom">
                  <div className="panel trip-preview">
                    <div className="widget-title">
                      <span>
                        <CalendarDays size={16} />
                        ON THE HORIZON
                      </span>
                      <button
                        className="icon-button"
                        aria-label="View all trips"
                        onClick={() => navigate("trips")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    {upcoming ? (
                      <>
                        <button
                          className="upcoming-trip"
                          onClick={() => openTrip(upcoming)}
                        >
                          <img
                            src={tripImage(upcoming) || destinations[1].image}
                            alt={upcoming.destination}
                          />
                          <div>
                            <span className="tiny-muted">
                              YOUR NEXT ADVENTURE
                            </span>
                            <h3>{upcoming.destination}</h3>
                            <p>
                              {dateLabel(upcoming.startDate)} · {upcoming.days}{" "}
                              days · {upcoming.group}
                            </p>
                            <span className="trip-tag">
                              <span />
                              Let the countdown begin
                            </span>
                          </div>
                        </button>
                        <button
                          className="panel-link"
                          onClick={() => openTrip(upcoming)}
                        >
                          A peek at your itinerary
                          <ArrowRight size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="widget-empty">
                          Your next chapter is waiting.
                        </p>
                        <button
                          className="panel-link"
                          onClick={() => planner()}
                        >
                          Plan your first trip
                          <ArrowRight size={15} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="panel vehicle-preview">
                    <div className="widget-title">
                      <span>
                        <CarFront size={17} />
                        YOUR ROAD-TRIP COMPANION
                      </span>
                      <button
                        className="icon-button"
                        aria-label="View your vehicle"
                        onClick={() => navigate("vehicle")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    {vehicle ? (
                      <>
                        <div className="vehicle-preview-main">
                          <div>
                            <h3>{vehicle.name}</h3>
                            <p>
                              {vehicle.type} · {vehicle.fuelType}
                            </p>
                          </div>
                          <div className="car-art">
                            <CarFront size={61} strokeWidth={1.1} />
                            <span />
                          </div>
                        </div>
                        <div className="vehicle-preview-stats">
                          <span>
                            <small>Fuel level</small>
                            <strong>
                              {vehicle.fuelLevel}
                              <em>%</em>
                              <span className="mini-fuel">
                                <i style={{ width: `${vehicle.fuelLevel}%` }} />
                              </span>
                            </strong>
                          </span>
                          <span>
                            <small>Est. range</small>
                            <strong>
                              {Math.round(range)}
                              <em> km</em>
                            </strong>
                          </span>
                          <span>
                            <small>Efficiency</small>
                            <strong>
                              {vehicle.mileage}
                              <em> km/L</em>
                            </strong>
                          </span>
                        </div>
                        <span className="vehicle-footnote">
                          <span />
                          Based on {vehicle.isExample ? "sample" : "your"}{" "}
                          vehicle inputs
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="widget-empty">
                          Open roads start with your ride.
                        </p>
                        <button
                          className="panel-link"
                          onClick={() => {
                            setSelectedVehicle(undefined);
                            openEditor("vehicle");
                          }}
                        >
                          Add your vehicle
                          <Plus size={15} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="panel budget-preview">
                    <div className="widget-title">
                      <span>
                        <Wallet size={16} />
                        MORE MOMENTS, LESS WORRY
                      </span>
                      <button
                        className="icon-button"
                        aria-label="View expenses"
                        onClick={() => navigate("expenses")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <span className="budget-caption">
                      {upcoming
                        ? `${upcoming.destination.split(",")[0]} trip budget`
                        : "Your travel budget"}
                    </span>
                    <div className="budget-total">
                      {money(tripSpent, homeCurrency)}
                      <span> / {money(homeBudget, homeCurrency)}</span>
                    </div>
                    <div className="budget-progress">
                      <span
                        style={{ width: `${Math.max(budgetPercent, 2)}%` }}
                      />
                    </div>
                    <div className="budget-legend">
                      <span>
                        <i />
                        Spent so far
                      </span>
                      <strong>
                        {money(
                          Math.max(0, homeBudget - tripSpent),
                          homeCurrency,
                        )}{" "}
                        to enjoy
                      </strong>
                    </div>
                    <button
                      className="panel-link"
                      onClick={() => openEditor("expense")}
                    >
                      Keep track of the little things
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </section>
              <footer className="dashboard-footer">
                <span>
                  <Sprout size={14} />
                  Take the scenic route. It’s usually worth it.
                </span>
                <span>Thoughtfully planned. Personally yours.</span>
              </footer>
            </>
          )}
          {(page === "explore" || page === "saved") && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "saved"
                      ? "A LITTLE INSPIRATION, KEPT CLOSE"
                      : "GO SOMEWHERE THAT FEELS LIKE YOU"}
                  </span>
                  <h1>
                    {page === "saved"
                      ? "Your someday places."
                      : "The world is full of your kind of places."}
                  </h1>
                  <p>
                    {page === "saved"
                      ? "Dreams worth coming back to. Where will the next one take you?"
                      : `${destinations.length} curated places, plus district guides for activities, food, shopping, and stays.`}
                  </p>
                </div>
                <button className="button primary" onClick={() => planner()}>
                  <Plus size={17} />
                  Plan a trip
                </button>
              </div>
              {page === "explore" && (
                <div className="explore-mode-tabs" role="tablist" aria-label="Explore Kerala">
                  {exploreModes.map(({ name, icon: Icon }) => (
                    <button
                      key={name}
                      role="tab"
                      aria-selected={exploreMode === name}
                      className={exploreMode === name ? "active" : ""}
                      onClick={() => {
                        setExploreMode(name);
                        if (name !== "Places") setMapView(false);
                      }}
                    >
                      <Icon size={16} />
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <div className="explore-search">
                <Search size={17} />
                <input
                  aria-label="Search Kerala by place or travel vibe"
                  placeholder="Try ‘cool’, ‘modern’, ‘romantic’, a district, or a place…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span>KERALA, INDIA</span>
              </div>
              {page === "explore" && !search && (
                <div className="search-ideas" aria-label="Search ideas">
                  <span>Search by feeling</span>
                  {["Cool", "Modern", "Romantic", "Family", "Foodie"].map((idea) => (
                    <button key={idea} onClick={() => setSearch(idea.toLowerCase())}>
                      {idea}
                    </button>
                  ))}
                </div>
              )}
              {page === "explore" && (
                <div className="area-filters">
                  <label>
                    District
                    <select
                      value={exploreDistrict}
                      onChange={(e) => setExploreDistrict(e.target.value)}
                    >
                      <option>All Kerala</option>
                      {keralaDistricts.map((district) => (
                        <option key={district}>{district}</option>
                      ))}
                    </select>
                  </label>
                  {exploreMode === "Stays" && (
                    <label>
                      Match my budget
                      <select
                        value={stayBudget}
                        onChange={(e) => setStayBudget(e.target.value as BudgetTier)}
                      >
                        {(["Budget", "Balanced", "Comfort", "Luxury"] as BudgetTier[]).map((tier) => (
                          <option key={tier}>{tier}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span>
                    {exploreDistrict === "All Kerala"
                      ? "Showing ideas across Kerala"
                      : `Showing ideas for ${exploreDistrict}`}
                  </span>
                </div>
              )}
              {(page === "saved" || exploreMode === "Places") && (
              <div className="explore-toolbar">
                <div className="category-tabs">
                  {categoryOptions.map(({ name, icon: Icon }) => (
                    <button
                      className={category === name ? "active" : ""}
                      onClick={() => setCategory(name)}
                      key={name}
                    >
                      <Icon size={15} />
                      {name === "For you" ? "All places" : name}
                    </button>
                  ))}
                </div>
                <div className="segmented view-toggle">
                  <button
                    className={!mapView ? "active" : ""}
                    aria-label="Grid view"
                    onClick={() => setMapView(false)}
                  >
                    <List size={16} />
                    Cards
                  </button>
                  <button
                    className={mapView ? "active" : ""}
                    aria-label="Map view"
                    onClick={() => setMapView(true)}
                  >
                    <MapIcon size={16} />
                    Map
                  </button>
                </div>
              </div>
              )}
              {search && (
                <p className="search-summary">
                  <span>
                    Results for “{search}”
                    {hasIntentExpansion(search) && (
                      <small> · matching the feeling, not only the exact word</small>
                    )}
                  </span>
                  <button className="text-button" onClick={() => setSearch("")}>
                    Clear search
                    <X size={13} />
                  </button>
                </p>
              )}
              {(() => {
                const places = matchedPlaces.filter(
                  (place) =>
                    (page === "saved" ||
                      exploreDistrict === "All Kerala" ||
                      place.district === exploreDistrict) &&
                    (page !== "saved" || savedPlaces.includes(place.id)),
                );
                if (page === "explore" && exploreMode !== "Places") {
                  return matchedDiscoveries.length ? (
                    <div className="discovery-grid">
                      {matchedDiscoveries.map((item) => {
                        const Icon =
                          item.kind === "Activities"
                            ? Sparkles
                            : item.kind === "Food"
                              ? UtensilsCrossed
                              : item.kind === "Shopping"
                                ? ShoppingBag
                                : BedDouble;
                        const nearby = destinationForDiscovery(item, destinations);
                        return (
                          <article className="discovery-card" key={item.id}>
                            <div className="discovery-card-heading">
                              <span className="discovery-icon"><Icon size={18} /></span>
                              <span className="tag sage">{item.kind}</span>
                            </div>
                            <span className="place-location">
                              <MapPin size={12} />
                              {item.locality} · {item.district}
                            </span>
                            <h3>{item.title}</h3>
                            <p>{item.description}</p>
                            <div className="discovery-tags">
                              {item.tags.slice(0, 3).map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                            <div className="discovery-card-footer">
                              <span>{item.priceHint}</span>
                              <button
                                onClick={() => {
                                  if (nearby) {
                                    planner(nearby);
                                    return;
                                  }
                                  setExploreMode("Places");
                                  setExploreDistrict(item.district);
                                  setSearch("");
                                  setCategory("For you");
                                  setMapView(false);
                                }}
                              >
                                {nearby ? `Plan for ${nearby.name}` : `Explore ${item.district}`}
                                <ArrowUpRight size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="Try a wider area."
                      description={`No ${exploreMode.toLowerCase()} match these filters yet. Choose All Kerala, another budget, or a different travel feeling.`}
                      action={{
                        label: "Show all Kerala",
                        onClick: () => {
                          setExploreDistrict("All Kerala");
                          setSearch("");
                        },
                      }}
                    />
                  );
                }
                return places.length ? (
                  mapView ? (
                    <div className="explore-map-layout">
                      <DestinationMap
                        places={places}
                        onSelect={(id) =>
                          openPlace(destinations.find((p) => p.id === id)!)
                        }
                      />
                      <div className="map-caption">
                        <MapPin size={14} />
                        Curated destination locations · Select a pin to explore
                        <span>No live traffic or routing</span>
                      </div>
                    </div>
                  ) : (
                    <div className="destination-grid explore-grid">
                      {places.map((place) => (
                        <DestinationCard
                          key={place.id}
                          place={place}
                          saved={savedPlaces.includes(place.id)}
                          onSave={() => savePlace(place.id)}
                          onOpen={() => openPlace(place)}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <EmptyState
                    icon={page === "saved" ? Heart : Search}
                    title={
                      page === "saved"
                        ? "Leave a little room for someday."
                        : "A little further off the map."
                    }
                    description={
                      page === "saved"
                        ? "Tap the heart on a place you love. It will be waiting right here."
                        : "We couldn’t find that in our curated collection. Try a country, place, or another category."
                    }
                    action={{
                      label:
                        page === "saved"
                          ? "Discover places"
                          : "Show all places",
                      onClick: () => {
                        setSearch("");
                        setCategory("For you");
                        setExploreMode("Places");
                        setExploreDistrict("All Kerala");
                        navigate("explore");
                      },
                    }}
                  />
                );
              })()}
              <div className="trust-strip">
                <ShieldCheck size={16} />
                <span>
                  A curated starter collection. Crowd labels are illustrative
                  examples. Budgets are planning estimates; verify local
                  conditions before travelling.
                </span>
              </div>
            </>
          )}
          {page === "trips" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">STORIES WAITING TO HAPPEN</span>
                  <h1>Your next chapters.</h1>
                  <p>
                    Big adventures, little escapes, and everything in between.
                  </p>
                </div>
                <button className="button primary" onClick={() => planner()}>
                  <Plus size={17} />
                  Plan a trip
                </button>
              </div>
              {trips.length ? (
                <div className="trips-grid">
                  {trips.map((trip) => (
                    <article className="trip-card panel" key={trip.id}>
                      <button
                        className="trip-cover"
                        onClick={() => openTrip(trip)}
                      >
                        <img
                          src={tripImage(trip) || destinations[0].image}
                          alt={trip.destination}
                        />
                        <span className="tag white">
                          {trip.isExample ? "Example · " : ""}
                          {trip.status || "Upcoming"}
                        </span>
                      </button>
                      <div className="trip-card-content">
                        <span className="place-location">
                          <MapPin size={12} />
                          {trip.country}
                        </span>
                        <h2>{trip.destination}</h2>
                        <div className="trip-meta">
                          <span>
                            <CalendarDays size={14} />
                            {dateLabel(trip.startDate)} · {trip.days} days
                          </span>
                          <span>
                            <Users size={14} />
                            {trip.people} travellers
                          </span>
                        </div>
                        <div className="trip-card-budget">
                          <span>
                            Planned budget
                            <strong>
                              {money(Number(trip.budget), trip.currency)}
                            </strong>
                          </span>
                          <button
                            className="button secondary"
                            onClick={() => openTrip(trip)}
                          >
                            View itinerary
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={MapIcon}
                  title="Every adventure starts with a little idea."
                  description="Choose a place, set your pace, and bring your first trip to life."
                  action={{
                    label: "Plan my first trip",
                    onClick: () => planner(),
                  }}
                />
              )}
              <div className="journey-callout">
                <div className="callout-art">
                  <Mountain size={45} strokeWidth={1} />
                </div>
                <div>
                  <h3>Plans are a starting point. The memories are yours.</h3>
                  <p>
                    Build a fresh plan whenever inspiration strikes. Check
                    opening hours and local conditions before you go.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("explore")}
                >
                  Find inspiration
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === "vehicle" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">FOR EVERY OPEN ROAD</span>
                  <h1>A little care. A long way to go.</h1>
                  <p>
                    Your vehicle, your fuel, and the freedom to keep exploring.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setSelectedVehicle(undefined);
                    openEditor("vehicle");
                  }}
                >
                  <Plus size={17} />
                  Add vehicle
                </button>
              </div>
              {vehicles.length > 0 ? (
                <>
                  <div className="vehicle-grid">
                    {vehicles.map((v) => (
                      <div className="panel vehicle-detail" key={v.id}>
                        <div className="vehicle-detail-top">
                          <IconBox icon={CarFront} />
                          <span className="tag sage">
                            {v.isExample ? "Example · " : ""}
                            {v.type} · {v.fuelType}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${v.name}`}
                            onClick={() => {
                              setSelectedVehicle(v);
                              openEditor("vehicle");
                            }}
                          >
                            <Settings2 size={18} />
                          </button>
                        </div>
                        <div className="vehicle-feature">
                          <div>
                            <p className="eyebrow">YOUR TRUSTY COMPANION</p>
                            <h2>{v.name}</h2>
                            <p>
                              {Number(v.odometer).toLocaleString()} kilometres
                              of stories
                            </p>
                          </div>
                          <CarFront size={110} strokeWidth={0.9} />
                        </div>
                        <div className="vehicle-big-stats">
                          <div>
                            <Fuel size={16} />
                            <strong>
                              {v.fuelLevel}
                              <small>%</small>
                            </strong>
                            <span>Fuel · user input</span>
                          </div>
                          <div>
                            <Navigation size={16} />
                            <strong>
                              {Math.round(
                                remainingRange(
                                  v.tankCapacity,
                                  v.fuelLevel,
                                  v.mileage,
                                ),
                              )}
                              <small>km</small>
                            </strong>
                            <span>Estimated range</span>
                          </div>
                          <div>
                            <Leaf size={16} />
                            <strong>
                              {v.mileage}
                              <small>km/L</small>
                            </strong>
                            <span>Entered efficiency</span>
                          </div>
                        </div>
                        <div className="vehicle-actions">
                          <button
                            className="button primary"
                            onClick={() => {
                              setSelectedVehicle(v);
                              openEditor("fuel");
                            }}
                          >
                            <Plus size={15} />
                            Log a fill-up
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedVehicle(v);
                              openEditor("vehicle");
                            }}
                          >
                            Update details
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`Remove ${v.name}`}
                            onClick={() => {
                              setSelectedVehicle(v);
                              openEditor("deleteVehicle");
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <FuelCalculator
                    key={`${vehicle.id}-${vehicle.mileage}`}
                    vehicle={vehicle}
                    currency={profile.currency || "INR"}
                  />
                  <div className="panel fuel-history">
                    <div className="section-title">
                      <div>
                        <h2>Fuel journal</h2>
                        <p>
                          Measured efficiency appears between two full fill-ups,
                          including any partial fills.
                        </p>
                      </div>
                      <span className="tag sage">User-provided records</span>
                    </div>
                    {fuelRecords.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Vehicle</th>
                              <th>Fuel added</th>
                              <th>Odometer</th>
                              <th>Measured km/L</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fuelRecords.map((r) => (
                              <tr key={r.id}>
                                <td>{dateLabel(r.date)}</td>
                                <td>
                                  {vehicles.find((v) => v.id === r.vehicleId)
                                    ?.name || "Vehicle"}
                                </td>
                                <td>{r.litres} L</td>
                                <td>
                                  {Number(r.odometer).toLocaleString()} km
                                </td>
                                <td>
                                  {r.measuredMileage
                                    ? Number(r.measuredMileage).toFixed(1)
                                    : "—"}
                                </td>
                                <td>
                                  {money(
                                    Number(
                                      r.totalAmount ||
                                        r.litres * r.pricePerLitre,
                                    ),
                                    r.currency || profile.currency,
                                    2,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="empty-inline">
                        Your next fill-up is the first page. Log one above to
                        start your fuel history.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <EmptyState
                    icon={CarFront}
                    title="Meet your road-trip companion."
                    description="Add your vehicle to estimate range, calculate fuel costs, and record your fill-ups."
                    action={{
                      label: "Add my vehicle",
                      onClick: () => {
                        setSelectedVehicle(undefined);
                        openEditor("vehicle");
                      },
                    }}
                  />
                  <FuelCalculator currency={profile.currency || "INR"} />
                </>
              )}
            </>
          )}
          {page === "expenses" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    SPEND ON THE MOMENTS THAT MATTER
                  </span>
                  <h1>More memories. Less mental maths.</h1>
                  <p>
                    Keep the little things in check, and your next adventure in
                    reach.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => openEditor("expense")}
                >
                  <Plus size={17} />
                  Add expense
                </button>
              </div>
              <div className="expense-filters">
                <label>
                  Trip
                  <select
                    value={expenseTrip}
                    onChange={(e) => setExpenseTrip(e.target.value)}
                  >
                    <option value="all">All journeys</option>
                    {trips.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.destination}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  View currency
                  <select
                    value={expenseCurrency}
                    onChange={(e) => setExpenseCurrency(e.target.value)}
                  >
                    {currencies.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <span>
                  <ShieldCheck size={15} />
                  Currencies stay separate. No unverified exchange rates.
                </span>
              </div>
              <div className="expense-stats">
                <div className="panel">
                  <IconBox icon={Wallet} />
                  <p>Total spent</p>
                  <h2>{money(totalExpenses, expenseCurrency, 2)}</h2>
                  <span>{matchingExpenses.length} recorded expenses</span>
                </div>
                <div className="panel">
                  <IconBox icon={Compass} color="sand" />
                  <p>Planned budget</p>
                  <h2>{money(matchingBudget, expenseCurrency)}</h2>
                  <span>Across selected journeys</span>
                </div>
                <div className="panel">
                  <IconBox icon={Leaf} />
                  <p>
                    {totalExpenses > matchingBudget
                      ? "Over planned budget"
                      : "Room for more memories"}
                  </p>
                  <h2>
                    {money(
                      Math.abs(matchingBudget - totalExpenses),
                      expenseCurrency,
                      2,
                    )}
                  </h2>
                  <span>
                    {matchingBudget
                      ? "Compared with your plan"
                      : "Add a trip to set a budget"}
                  </span>
                </div>
              </div>
              <div className="panel expense-table">
                <div className="section-title">
                  <div>
                    <h2>The little things, together</h2>
                    <p>Your travel expense journal.</p>
                  </div>
                  <span className="tag sage">{expenseCurrency}</span>
                </div>
                {matchingExpenses.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Expense</th>
                          <th>Category</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Per person</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {matchingExpenses.map((e) => (
                          <tr key={e.id}>
                            <td>
                              <strong>{e.title}</strong>
                              <small>
                                {e.isExample ? "Example · " : ""}
                                {trips.find((t) => t.id === e.tripId)
                                  ?.destination || "Everyday travels"}
                              </small>
                            </td>
                            <td>
                              <span className="category-label">
                                {e.category}
                              </span>
                            </td>
                            <td>{dateLabel(e.date)}</td>
                            <td className="amount-cell">
                              {money(Number(e.amount), e.currency, 2)}
                            </td>
                            <td>
                              {money(
                                Number(e.amount) / (e.people || 1),
                                e.currency,
                                2,
                              )}
                              <small>
                                {e.people || 1}{" "}
                                {(e.people || 1) === 1 ? "person" : "people"}
                              </small>
                            </td>
                            <td>
                              <button
                                className="icon-button danger"
                                aria-label={`Delete expense ${e.title}`}
                                onClick={async () => {
                                  try {
                                    await api(
                                      `/expenses/${e.id}`,
                                      undefined,
                                      "DELETE",
                                    );
                                    await refresh();
                                    notify("Expense removed.");
                                  } catch (error) {
                                    notify((error as Error).message, "error");
                                  }
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={Wallet}
                    title="A fresh page in your travel journal."
                    description={`No expenses in ${expenseCurrency} for this selection. Add one when your journey begins.`}
                    action={{
                      label: "Add an expense",
                      onClick: () => openEditor("expense"),
                    }}
                  />
                )}
              </div>
            </>
          )}
          {page === "profile" && !user.isGuest && (
            <ProfilePage
              session={session}
              onSaved={async () => {
                await refresh();
                notify("Your travel style, updated.");
              }}
              onAuth={() => setModal("auth")}
              onLogout={async () => {
                try {
                  await api("/auth/logout", {});
                  await refresh();
                  navigate("home");
                  notify("Signed out. You’re in a fresh guest space.");
                } catch (e) {
                  notify((e as Error).message, "error");
                }
              }}
              onDelete={() => setModal("deleteAccount")}
              notify={notify}
            />
          )}
          {(page === "ai" || page === "social") && (
            <div className="future-page">
              <span className="tag sage">
                {page === "ai"
                  ? "PHASE 2 · ON OUR HORIZON"
                  : "PHASE 4 · ON OUR HORIZON"}
              </span>
              <div className="future-illustration">
                {page === "ai" ? (
                  <Sparkles size={65} strokeWidth={1} />
                ) : (
                  <Users size={65} strokeWidth={1} />
                )}
                <div />
                <span />
              </div>
              <h1>
                {page === "ai"
                  ? "A little local wisdom.\nA lot more you."
                  : "Good company.\nOn your terms."}
              </h1>
              <p>
                {page === "ai"
                  ? "A personal travel assistant that brings your preferences, journey, and the world around you into one conversation."
                  : "Find people who share your destination, your pace, and your sense of adventure. A thoughtful travel community is on the way."}
              </p>
              <div className="future-features">
                {(page === "ai"
                  ? [
                      [Leaf, "Your preferences, understood"],
                      [MapIcon, "Plans that adapt to the journey"],
                      [ShieldCheck, "Clear sources, honest answers"],
                    ]
                  : [
                      [Compass, "Shared journeys and interests"],
                      [ShieldCheck, "Privacy and safety from the start"],
                      [MessageCircle, "Connect when you choose"],
                    ]
                ).map(([Icon, label]) => {
                  const FeatureIcon = Icon as typeof Leaf;
                  return (
                    <span key={String(label)}>
                      <FeatureIcon size={17} />
                      {String(label)}
                    </span>
                  );
                })}
              </div>
              <div className="future-current">
                <h3>
                  {page === "ai"
                    ? "Your next trip doesn’t have to wait."
                    : "Start with a journey of your own."}
                </h3>
                <p>
                  {page === "ai"
                    ? "Our starter planner is ready now. Pick your destination and travel style to create a suggested itinerary."
                    : "Explore a new place and build a trip. Social discovery and messaging will arrive in a later release."}
                </p>
                <button
                  className="button primary"
                  onClick={() =>
                    page === "ai" ? planner() : navigate("explore")
                  }
                >
                  {page === "ai"
                    ? "Try the trip planner"
                    : "Find your next place"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          <footer className="photo-credit">
            Kochi skyline photo: {" "}
            <a href="https://commons.wikimedia.org/wiki/File:Kochi_Skyline.jpg" target="_blank" rel="noreferrer">
              Fsquares (The Ibrahims)
            </a>{" · "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
            {" · Cropped to fit."}
          </footer>
        </main>
        {user.isGuest && (
          <div className="guest-bar">
            <span>
              <Compass size={15} />
              <strong>A little taste of Roamly.</strong> Browse freely, then
              sign in to save trips, places, and preferences.
            </span>
            <button onClick={() => setModal("auth")}>
              Make it yours
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      {toast && (
        <div
          className={`toast ${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? <CircleAlert size={17} /> : <Check size={17} />}
          {toast.message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "auth" && (
        <AuthModal
          key={authMode || "default"}
          initialMode={authMode}
          onClose={() => {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("resetToken");
            cleanUrl.searchParams.delete("recovery");
            cleanUrl.searchParams.delete("code");
            cleanUrl.hash = "";
            window.history.replaceState({}, "", cleanUrl);
            setAuthMode(undefined);
            closeModal();
          }}
          onSuccess={(s) => {
            setAuthMode(undefined);
            setSession(s);
            if (s.profile.onboarded === true) {
              closeModal();
              notify("Welcome to your Roamly.");
            } else {
              setModal("onboarding");
            }
          }}
        />
      )}
      {modal === "onboarding" && !user.isGuest && (
        <OnboardingModal
          profile={profile}
          onComplete={async () => {
            await refresh();
            closeModal();
            notify("Your Roamly is ready for you.");
          }}
        />
      )}
      {modal === "planner" && (
        <PlannerModal
          profile={profile}
          vehicles={vehicles}
          initial={selectedPlace}
          onClose={closeModal}
          onCreated={() => {
            handleSaved();
            navigate("trips");
            notify("Your next chapter is ready.");
          }}
        />
      )}
      {modal === "vehicle" && (
        <VehicleModal
          vehicle={selectedVehicle}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
      {modal === "expense" && (
        <ExpenseModal
          trips={trips}
          currency={profile.currency || "INR"}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
      {modal === "fuel" && selectedVehicle && (
        <FuelModal
          vehicle={selectedVehicle}
          currency={profile.currency || "INR"}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
      {modal === "place" && selectedPlace && (
        <Modal
          title={selectedPlace.name}
          subtitle={`${selectedPlace.region} · ${selectedPlace.country}`}
          onClose={closeModal}
          wide
        >
          <img
            className="place-detail-image"
            src={selectedPlace.image}
            alt={selectedPlace.name}
          />
          <div className="place-detail-header">
            <span className="tag sage">
              <Leaf size={13} />
              {selectedPlace.category}
            </span>
            <button
              className="text-button"
              onClick={() => savePlace(selectedPlace.id)}
            >
              <Heart
                size={16}
                fill={
                  savedPlaces.includes(selectedPlace.id)
                    ? "currentColor"
                    : "none"
                }
              />
              {savedPlaces.includes(selectedPlace.id)
                ? "Saved to your places"
                : "Save for someday"}
            </button>
          </div>
          <p className="place-detail-description">
            {selectedPlace.description}
          </p>
          <div className="place-detail-stats">
            <div>
              <Users size={17} />
              <strong>{selectedPlace.crowd} crowds</strong>
              <span>Illustrative crowd example</span>
            </div>
            <div>
              <Sun size={17} />
              <strong>{selectedPlace.quietTime}</strong>
              <span>Suggested quiet time</span>
            </div>
            <div>
              <Wallet size={17} />
              <strong>
                {money(
                  selectedPlace.costPerDay,
                  selectedPlace.costCurrency || "INR",
                )}{" "}
                / day
              </strong>
              <span>Illustrative local budget</span>
            </div>
          </div>
          <div className="place-interests">
            {selectedPlace.tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="detail-map">
            <DestinationMap places={[selectedPlace]} />
          </div>
          <p className="data-note">
            Curated destination information. Crowd levels, visiting times, and
            budgets are estimates, not live data. Accommodation availability,
            weather, and opening hours are not connected.
          </p>
          <button
            className="button primary full"
            onClick={() => planner(selectedPlace)}
          >
            Make this my next chapter
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {modal === "trip" && selectedTrip && (
        <Modal
          title={`A little ${selectedTrip.destination}. A lot of possibility.`}
          subtitle={`${dateLabel(selectedTrip.startDate)} · ${selectedTrip.days} days · ${selectedTrip.people} travellers · ${selectedTrip.group}`}
          onClose={closeModal}
          wide
        >
          <div className="plan-summary">
            <img
              src={tripImage(selectedTrip) || destinations[0].image}
              alt={selectedTrip.destination}
            />
            <div>
              <span className="eyebrow">
                {selectedTrip.isExample
                  ? "EXAMPLE TRIP PLAN"
                  : "YOUR PERSONAL TRIP PLAN"}
              </span>
              <h3>{selectedTrip.destination}</h3>
              <p>
                {money(Number(selectedTrip.budget), selectedTrip.currency)}{" "}
                budget · {selectedTrip.transport}
              </p>
            </div>
            <span className="tag sage">{selectedTrip.personality}</span>
          </div>
          {selectedTrip.fuelEstimate && (
            <div className="soft-notice fuel-preview">
              <CarFront size={18} />
              <span>
                <strong>
                  {money(
                    selectedTrip.fuelEstimate.cost,
                    selectedTrip.fuelEstimate.currency,
                    2,
                  )}{" "}
                  estimated fuel
                </strong>
                <br />
                {selectedTrip.distanceKm} entered km ·{" "}
                {selectedTrip.fuelEstimate.mileage} km/L ·{" "}
                {selectedTrip.fuelEstimate.litres.toFixed(1)} L<br />A planning
                snapshot based on entered values, not a recorded expense.
              </span>
            </div>
          )}
          <div className="itinerary detailed-itinerary">
            {selectedTrip.itinerary?.length ? (
              selectedTrip.itinerary.map((day, i) => (
                <div className="itinerary-day" key={i}>
                  <div className="day-number">
                    {String(day.day || i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h4>{day.title || `Day ${i + 1}`}</h4>
                    {day.note && <p className="data-note">{day.note}</p>}
                    {day.activities?.map((a, j) => (
                      <div className="activity" key={j}>
                        <time>{a.time}</time>
                        <div>
                          <strong>{a.title}</strong>
                          <p>{a.description}</p>
                          <span className="activity-meta">
                            {a.crowd
                              ? `Crowd example: ${a.crowd}`
                              : "Crowd data unavailable"}
                            {a.cost !== undefined
                              ? ` · ${money(a.cost, selectedTrip.currency)} budget allocation`
                              : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p>
                Your starter itinerary will appear here when you create a new
                trip.
              </p>
            )}
          </div>
          <p className="data-note">
            Suggested itinerary. Budgets are estimates; crowd labels are
            illustrative examples. Confirm access, actual prices, transport
            distances, opening hours, and conditions before travelling.
          </p>
          <div className="modal-actions">
            {destinations.find(
              (place) => place.name === selectedTrip.destination,
            ) && (
              <button
                className="button secondary"
                onClick={() => {
                  const place = destinations.find(
                    (candidate) => candidate.name === selectedTrip.destination,
                  );
                  setExploreDistrict(place?.district || "All Kerala");
                  setExploreMode("Activities");
                  closeModal();
                  navigate("explore");
                }}
              >
                <Compass size={15} />
                Explore around this trip
              </button>
            )}
            <button
              className="button danger-plain"
              onClick={() => openEditor("deleteTrip")}
            >
              <Trash2 size={15} />
              Delete trip
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  const { trip } = await api(
                    `/trips/${selectedTrip.id}`,
                    {
                      status:
                        selectedTrip.status?.toLowerCase() === "completed"
                          ? "Upcoming"
                          : "Completed",
                    },
                    "PATCH",
                  );
                  setSelectedTrip(trip);
                  await refresh();
                  notify("Trip status updated.");
                } catch (e) {
                  notify((e as Error).message, "error");
                }
              }}
            >
              <Check size={16} />
              {selectedTrip.status?.toLowerCase() === "completed"
                ? "Mark as upcoming"
                : "Mark as completed"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal
          title="A little heads-up."
          subtitle="The useful things, when you need them."
          onClose={closeModal}
        >
          <div className="notification-item">
            <IconBox icon={Compass} />
            <div>
              <h4>Your space is ready to explore</h4>
              <p>
                Plan a journey, add your vehicle, and save places for someday.
              </p>
              <span>Roamly · Getting started</span>
            </div>
          </div>
          {vehicle && vehicle.fuelLevel < 25 && (
            <div className="notification-item">
              <IconBox icon={Fuel} color="sand" />
              <div>
                <h4>A fuel stop could be a good idea</h4>
                <p>
                  Your entered fuel level is {vehicle.fuelLevel}%, with
                  approximately {Math.round(range)} km of estimated range.
                </p>
                <span>Estimate from your vehicle inputs</span>
              </div>
            </div>
          )}
          <div className="soft-notice">
            <Bell size={19} />
            <span>
              Live travel alerts and push notifications are planned for Phase 2.
              You can set your preferences now.
            </span>
          </div>
          <button
            className="button secondary full"
            onClick={() => {
              closeModal();
              navigate("profile");
            }}
          >
            Notification preferences
            <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      {modal === "deleteTrip" && selectedTrip && (
        <ConfirmDelete
          title="Leave this chapter behind?"
          text={`Delete your ${selectedTrip.destination} trip? This also removes its linked expenses and cannot be undone.`}
          onClose={closeModal}
          busy={busy}
          onConfirm={() => removeEntity("trips", selectedTrip.id)}
        />
      )}
      {modal === "deleteVehicle" && selectedVehicle && (
        <ConfirmDelete
          title="Say goodbye to this ride?"
          text={`Remove ${selectedVehicle.name} and its fuel history? This cannot be undone.`}
          onClose={closeModal}
          busy={busy}
          onConfirm={() => removeEntity("vehicles", selectedVehicle.id)}
        />
      )}
      {modal === "deleteAccount" && (
        <ConfirmDelete
          title="Delete your Roamly space?"
          text="This permanently deletes your profile, trips, vehicles, saved places, and expenses. You can export a copy from your profile first."
          onClose={closeModal}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api("/account", undefined, "DELETE");
              await refresh();
              closeModal();
              navigate("home");
              notify("Your previous Roamly space has been deleted.");
            } catch (e) {
              notify((e as Error).message, "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
function ConfirmDelete({
  title,
  text,
  onClose,
  onConfirm,
  busy,
}: {
  title: string;
  text: string;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Modal title={title} subtitle={text} onClose={onClose}>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Keep it
        </button>
        <button
          className="button danger-solid"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Trash2 size={15} />
          )}
          Yes, delete
        </button>
      </div>
    </Modal>
  );
}
function ProfilePage({
  session,
  onSaved,
  onAuth,
  onLogout,
  onDelete,
  notify,
}: {
  session: Session;
  onSaved: () => Promise<void>;
  onAuth: () => void;
  onLogout: () => void;
  onDelete: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const { profile, user } = session;
  const [interests, setInterests] = useState(profile.interests || []);
  const [personality, setPersonality] = useState(
    normalizePersonality(profile.personality),
  );
  const [homeCity, setHomeCity] = useState(profile.city || "");
  useEffect(() => { setHomeCity(profile.city || ""); }, [profile.city]);
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    typeof profile.notifications === "object"
      ? profile.notifications
      : { trips: true, vehicle: true, weather: false, social: false },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const savedPhone =
    typeof profile.phone === "string" ? profile.phone : "";
  const initialPhone = savedPhone
    ? parsePhoneNumberFromString(savedPhone)
    : undefined;
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(
    initialPhone?.country || "IN",
  );
  const [phoneNationalNumber, setPhoneNationalNumber] = useState(
    initialPhone?.nationalNumber || "",
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (phoneNationalNumber) {
      const parsedPhone = parsePhoneNumberFromString(
        phoneNationalNumber,
        phoneCountry,
      );
      if (!parsedPhone?.isValid()) {
        setError("Enter a valid mobile number for the selected country.");
        setBusy(false);
        return;
      }
      data.phone = parsedPhone.number;
    } else {
      data.phone = "";
    }
    try {
      await api(
        "/profile",
        { ...data, personality, interests, notifications },
        "PUT",
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE JOURNEY STARTS WITH YOU</span>
          <h1>Your pace. Your preferences. Your world.</h1>
          <p>Tell us what a good day looks like. We’ll start there.</p>
        </div>
        <span className="tag sage">
          <ShieldCheck size={14} />
          Private by default
        </span>
      </div>
      <form onSubmit={submit} className="profile-form">
        <div className="profile-main">
          <div className="panel settings-panel">
            <div className="panel-heading">
              <IconBox icon={Compass} />
              <div>
                <h3>A little about you</h3>
                <p>Only the details that make your travels feel personal.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Your name
                <input
                  name="name"
                  defaultValue={profile.name || user.name}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Home city
                <select name="city" value={homeCity} onChange={(event) => setHomeCity(event.target.value)} required>
                  <option value="" disabled>
                    Select your hometown
                  </option>
                  {keralaHometowns.map(([city]) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Country
                <input
                  name="country"
                  defaultValue={profile.country}
                  maxLength={100}
                  placeholder="Your country"
                />
              </label>
              <label>
                Preferred currency
                <select name="currency" defaultValue={profile.currency}>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="profile-phone-field">
                <span className="profile-field-label">
                  Mobile number <small>Optional</small>
                </span>
                <div className="phone-number-fields">
                  <select
                    value={phoneCountry}
                    onChange={(e) =>
                      setPhoneCountry(e.target.value as CountryCode)
                    }
                    aria-label="Country calling code"
                  >
                    {phoneCountries.map((option) => (
                      <option key={option.country} value={option.country}>
                        {option.name} (+{option.callingCode})
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phoneNationalNumber}
                    onChange={(e) =>
                      setPhoneNationalNumber(
                        e.target.value.replace(/\D/g, ""),
                      )
                    }
                    placeholder="Mobile number"
                    aria-label="Mobile number without country code"
                  />
                </div>
                <small>
                  Private account information. No verification message will be
                  sent.
                </small>
              </div>
              <label>
                Language
                <select name="language" defaultValue="English">
                  <option>English</option>
                </select>
                <small>More languages are on the horizon.</small>
              </label>
              <label>
                Usually travelling
                <select name="group" defaultValue={profile.group}>
                  {[
                    "Solo",
                    "Couple",
                    "Family",
                    "Friends",
                    "Group",
                    "Business",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="panel settings-panel">
            <div className="panel-heading">
              <IconBox icon={Leaf} />
              <div>
                <h3>How do you like to wander?</h3>
                <p>
                  A preference, never a label. Change it whenever you feel like
                  it.
                </p>
              </div>
            </div>
            <div className="personality-grid">
              {[
                {
                  name: "Peace-seeking",
                  icon: Leaf,
                  text: "Quiet corners, unhurried days",
                },
                {
                  name: "Adventure-seeking",
                  icon: Mountain,
                  text: "A little thrill, a new trail",
                },
                {
                  name: "Ambivert",
                  icon: Sun,
                  text: "A thoughtful mix of both",
                },
                {
                  name: "Extrovert",
                  icon: Users,
                  text: "Lively places, shared moments",
                },
                {
                  name: "Introvert",
                  icon: Sprout,
                  text: "Space to slow down and recharge",
                },
                {
                  name: "Flexible",
                  icon: Compass,
                  text: "Follow the day wherever it goes",
                },
              ].map(({ name, icon: Icon, text }) => (
                <button
                  type="button"
                  className={`personality-option ${personality === name ? "selected" : ""}`}
                  key={name}
                  onClick={() => setPersonality(name)}
                  aria-pressed={personality === name}
                >
                  <Icon size={23} />
                  <strong>{name}</strong>
                  <span>{text}</span>
                  {personality === name && (
                    <Check className="preference-check" size={15} />
                  )}
                </button>
              ))}
            </div>
            <label className="field-title">A few things you love</label>
            <div className="interest-options">
              {[
                "Nature",
                "Adventure",
                "Culture",
                "Food",
                "Coast",
                "Photography",
                "Wellness",
                "City",
                "Art",
                "Wildlife",
              ].map((i) => (
                <button
                  type="button"
                  key={i}
                  className={interests.includes(i) ? "selected" : ""}
                  aria-pressed={interests.includes(i)}
                  onClick={() =>
                    setInterests((v) =>
                      v.includes(i) ? v.filter((x) => x !== i) : [...v, i],
                    )
                  }
                >
                  {interests.includes(i) ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}{" "}
                  {i}
                </button>
              ))}
            </div>
            <div className="form-grid spaced-fields">
              <label>
                Preferred transport
                <select name="transport" defaultValue={profile.transport}>
                  {[
                    "Car",
                    "Motorcycle",
                    "Public transport",
                    "Walking",
                    "Bicycle",
                    "Mixed",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Budget style
                <select
                  name="budget"
                  defaultValue={profile.budget || "Balanced"}
                >
                  {["Budget", "Balanced", "Comfort", "Luxury"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
        <div className="profile-side">
          <div className="panel settings-panel">
            <div className="panel-heading">
              <IconBox icon={ShieldCheck} />
              <div>
                <h3>Your space. Your say.</h3>
                <p>Privacy is part of the journey.</p>
              </div>
            </div>
            <label>
              Profile visibility
              <select name="visibility" defaultValue="private">
                <option value="private">Only me</option>
              </select>
            </label>
            <p className="data-note">
              Your profile is private. No public profile, location sharing, or
              social discovery is enabled in this release.
            </p>
            <div className="settings-divider" />
            <h4>A little heads-up about…</h4>
            <p className="tiny-muted">Preferences saved for future alerts.</p>
            {[
              {
                key: "trips",
                title: "My trips",
                detail: "Departures and helpful reminders",
              },
              {
                key: "vehicle",
                title: "My vehicle",
                detail: "Fuel and maintenance reminders",
              },
              {
                key: "weather",
                title: "The forecast",
                detail: "Changes that affect your plans",
              },
              {
                key: "social",
                title: "Travel connections",
                detail: "Groups and companion updates",
              },
            ].map((x) => (
              <label className="toggle-row" key={x.key}>
                <span>
                  <strong>{x.title}</strong>
                  <small>{x.detail}</small>
                </span>
                <input
                  type="checkbox"
                  checked={notifications[x.key] ?? false}
                  onChange={(e) =>
                    setNotifications((n) => ({
                      ...n,
                      [x.key]: e.target.checked,
                    }))
                  }
                />
                <span className="toggle-switch" />
              </label>
            ))}
          </div>
          <div className="panel account-panel">
            <h3>{user.isGuest ? "Make this space yours." : "Your account"}</h3>
            <p>
              {user.isGuest
                ? "Create an account to keep your guest journeys, vehicle, and saved places together."
                : user.email}
            </p>
            {user.isGuest ? (
              <button
                type="button"
                className="button secondary full"
                onClick={onAuth}
              >
                Create an account
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="button secondary full"
                onClick={onLogout}
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
            <button
              type="button"
              className="account-action"
              onClick={async () => {
                try {
                  const data = await api("/account/export");
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "roamly-my-data.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  notify("Your personal data export is ready.");
                } catch (e) {
                  notify((e as Error).message, "error");
                }
              }}
            >
              <ArrowDownToLine size={15} />
              Export my data
            </button>
            <button
              type="button"
              className="account-action danger"
              onClick={onDelete}
            >
              <Trash2 size={15} />
              Delete my {user.isGuest ? "guest space" : "account"}
            </button>
          </div>
        </div>
        <div className="profile-save">
          <ErrorMessage error={error} />
          <span>
            <ShieldCheck size={14} />
            These preferences stay in your private space.
          </span>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Save my preferences
          </button>
        </div>
      </form>
    </>
  );
}
export default App;
