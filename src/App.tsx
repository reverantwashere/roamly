import { useState, useEffect, useCallback, type FormEvent } from "react";
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
  CalendarDays,
  CarFront,
  Check,
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
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Users,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import { destinations, distanceFromHometown, keralaHometowns, type Destination } from "./lib/data";
import { remainingRange } from "./lib/planner";
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
];
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
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [modal, setModal] = useState<ModalType>(
    new URLSearchParams(window.location.search).has("resetToken")
      ? "auth"
      : null,
  );
  const [selectedPlace, setSelectedPlace] = useState<Destination>();
  const [selectedTrip, setSelectedTrip] = useState<Trip>();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle>();
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("For you");
  const [mapView, setMapView] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expenseTrip, setExpenseTrip] = useState("all");
  const [expenseCurrency, setExpenseCurrency] = useState("INR");
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback((message: string) => setToast(message), []);
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
    if (session && !session.user.isGuest && session.profile.onboarded !== true && modal === null) {
      setModal("onboarding");
    }
  }, [session, modal]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (page === "vehicle")
      api("/fuel-records")
        .then((data) => setFuelRecords(data.fuelRecords || []))
        .catch((e) => notify(e.message));
  }, [page, session, notify]);
  function navigate(next: Page) {
    if (next === "profile" && session?.user.isGuest) {
      setSidebarOpen(false);
      setModal("auth");
      return;
    }
    setPage(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (next !== "explore") setSearch("");
  }
  function planner(place?: Destination) {
    setSelectedPlace(place);
    setModal("planner");
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
    try {
      const data = await api("/saved-places", { placeId: id });
      setSession((s) => (s ? { ...s, savedPlaces: data.savedPlaces } : s));
      notify(
        data.savedPlaces.includes(id)
          ? "A little inspiration, saved."
          : "Place removed from your collection.",
      );
    } catch (e) {
      notify((e as Error).message);
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
      notify((e as Error).message);
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
      notify((e as Error).message);
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
        <div className="brand">
          <span className="brand-icon">
            <Navigation size={25} />
          </span>
          roamly<span className="brand-dot">.</span>
        </div>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button
              className="button primary"
              onClick={() => refresh().catch(() => {})}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={25} />
            <p>Finding a little room to wander…</p>
          </>
        )}
      </div>
    );
  const { profile, user, trips, vehicles, expenses, savedPlaces } = session;
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
  ).filter(
    (p) =>
      (category === "For you" || p.category === category) &&
      (!search ||
        `${p.name} ${p.country} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
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
                  ? "Your personal travel space"
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
                    setPage("explore");
                    setCategory("For you");
                  }
                }}
              />
            </div>
            <div className={`location-picker ${locationOpen ? "open" : ""}`}>
              <button
                className="location-button"
                onClick={() => setLocationOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={locationOpen}
              >
                <MapPin size={15} />
                <span>{profile.city || "Set your city"}</span>
                <ChevronDown size={12} />
              </button>
              {locationOpen && (
                <div className="location-dropdown" role="listbox" aria-label="Choose your Kerala location">
                  <span>YOUR AREA</span>
                  {keralaHometowns.map(([city]) => (
                    <button key={city} role="option" aria-selected={profile.city === city} onClick={() => chooseLocation(city)}>
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
                            src={upcoming.image || destinations[1].image}
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
                            setModal("vehicle");
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
                      onClick={() => setModal("expense")}
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
                      : "Discover a peaceful corner, a new perspective, or your next great story."}
                  </p>
                </div>
                <button className="button primary" onClick={() => planner()}>
                  <Plus size={17} />
                  Plan a trip
                </button>
              </div>
              <div className="explore-search">
                <Search size={17} />
                <input
                  aria-label="Search places in Kerala"
                  placeholder="Find a place, an experience, a little inspiration…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span>KERALA, INDIA</span>
              </div>
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
              {search && (
                <p className="search-summary">
                  Results for “{search}”
                  <button className="text-button" onClick={() => setSearch("")}>
                    Clear search
                    <X size={13} />
                  </button>
                </p>
              )}
              {(() => {
                const places = matchedPlaces.filter(
                  (p) => page !== "saved" || savedPlaces.includes(p.id),
                );
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
                          src={trip.image || destinations[0].image}
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
                    setModal("vehicle");
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
                              setModal("vehicle");
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
                              setModal("fuel");
                            }}
                          >
                            <Plus size={15} />
                            Log a fill-up
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedVehicle(v);
                              setModal("vehicle");
                            }}
                          >
                            Update details
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`Remove ${v.name}`}
                            onClick={() => {
                              setSelectedVehicle(v);
                              setModal("deleteVehicle");
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
                        setModal("vehicle");
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
                  onClick={() => setModal("expense")}
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
                                    notify((error as Error).message);
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
                      onClick: () => setModal("expense"),
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
                  notify((e as Error).message);
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
        </main>
        {user.isGuest && (
          <div className="guest-bar">
            <span>
              <Compass size={15} />
              <strong>A little taste of Roamly.</strong> You’re exploring a
              private guest space with sample data.
            </span>
            <button onClick={() => setModal("auth")}>
              Make it yours
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "auth" && (
        <AuthModal
          onClose={closeModal}
          onSuccess={(s) => {
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
              src={selectedTrip.image || destinations[0].image}
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
            <button
              className="button danger-plain"
              onClick={() => setModal("deleteTrip")}
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
                  notify((e as Error).message);
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
              notify((e as Error).message);
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
  notify: (s: string) => void;
}) {
  const { profile, user } = session;
  const [interests, setInterests] = useState(profile.interests || []);
  const [personality, setPersonality] = useState(
    profile.personality || "Peace-seeking",
  );
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
                <select name="city" defaultValue={profile.city} required>
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
                  notify((e as Error).message);
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
