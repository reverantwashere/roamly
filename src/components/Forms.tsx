import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  Compass,
  Eye,
  EyeOff,
  Leaf,
  LoaderCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import Modal from "./Modal";
import { destinations, type Destination } from "../lib/data";
import { buildItinerary, fuelCost } from "../lib/planner";
import { supabase } from "../lib/supabase";
import {
  api,
  currencies,
  money,
  type Profile,
  type Session,
  type Trip,
  type Vehicle,
} from "../types";
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (s: Session) => void;
}) {
  const [mode, setMode] = useState<"signup" | "login" | "forgot" | "reset">(
    new URLSearchParams(window.location.search).has("resetToken")
      ? "reset"
      : "signup",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "forgot") {
        if (supabase) {
          const { error } = await supabase.auth.resetPasswordForEmail(String(data.email), { redirectTo: window.location.origin });
          if (error) throw error;
          setNotice("If that account exists, password reset instructions are on their way.");
        } else {
          const result = await api("/auth/forgot-password", data);
          setNotice(result.message || "If that account exists, reset instructions have been prepared.");
        }
      } else if (mode === "reset") {
        if (!supabase) throw new Error("Authentication is still being configured.");
        const { error } = await supabase.auth.updateUser({ password: String(data.password) });
        if (error) throw error;
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("resetToken");
        window.history.replaceState({}, "", cleanUrl);
        setMode("login");
        setNotice("Password updated. Sign in with your new password.");
      } else {
        if (!supabase) {
          const result = await api<Session>(`/auth/${mode}`, data);
          onSuccess(result);
        } else if (mode === "signup") {
          const { data: signedUp, error } = await supabase.auth.signUp({
            email: String(data.email), password: String(data.password),
            options: { data: { name: String(data.name) }, emailRedirectTo: window.location.origin },
          });
          if (error) throw error;
          if (!signedUp.session) {
            setNotice("Check your email to confirm your Roamly account, then sign in.");
            setMode("login");
          } else {
            onSuccess(await api<Session>("/session"));
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: String(data.email), password: String(data.password) });
          if (error) throw error;
          onSuccess(await api<Session>("/session"));
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "signup"
          ? "A world of your own."
          : mode === "login"
            ? "Welcome back."
            : mode === "forgot"
              ? "Find your way back."
              : "Set a new password."
      }
      subtitle={
        mode === "signup"
          ? "Create your Roamly account and keep your journeys together."
          : mode === "login"
            ? "Your next journey is right where you left it."
            : "Secure access to your travel space."
      }
      onClose={onClose}
    >
      <div className="auth-brand">
        <Compass size={30} />
        <span>
          roamly<span>YOUR KIND OF JOURNEY</span>
        </span>
      </div>
      {(mode === "signup" || mode === "login") && (
        <div className="segmented auth-tabs">
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Create account
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
        </div>
      )}
      <form onSubmit={submit} className="form-stack">
        {mode === "signup" && (
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              placeholder="How should we call you?"
              required
              maxLength={80}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>
        )}
        {mode === "reset" && (
          <label>
            Reset token
            <input
              name="token"
              defaultValue={
                new URLSearchParams(window.location.search).get("resetToken") ||
                ""
              }
              placeholder="Token from your reset link"
              required
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            Password
            <div className="password-input">
              <input
                name="password"
                type={show ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                required
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        )}
        <ErrorMessage error={error} />
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {mode === "signup"
            ? "Create my account"
            : mode === "login"
              ? "Sign in"
              : mode === "forgot"
                ? "Send reset link"
                : "Update password"}
          <ArrowRight size={17} />
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
          >
            Forgot your password?
          </button>
        )}
        {mode === "forgot" && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode("reset");
              setNotice("");
            }}
          >
            I have a reset token
          </button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("login")}
          >
            Back to sign in
          </button>
        )}
      </form>
      <p className="privacy-footnote">
        <ShieldCheck size={14} />
        Your profile is private by default.
      </p>
    </Modal>
  );
}

export function OnboardingModal({
  profile,
  onComplete,
}: {
  profile: Profile;
  onComplete: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [personality, setPersonality] = useState(profile.personality || "Peace-seeking");
  const [interests, setInterests] = useState<string[]>(profile.interests || ["Nature"]);
  const [group, setGroup] = useState(profile.group || "Solo");
  const [transport, setTransport] = useState(profile.transport || "Car");
  const [budget, setBudget] = useState(profile.budget || "Balanced");
  const [city, setCity] = useState(profile.city || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choices = (items: string[], value: string, setValue: (v: string) => void) => (
    <div className="onboarding-choices">
      {items.map((item) => <button type="button" key={item} className={value === item ? "selected" : ""} onClick={() => setValue(item)} aria-pressed={value === item}>{value === item && <Check size={14} />}{item}</button>)}
    </div>
  );
  async function finish() {
    setBusy(true); setError("");
    try {
      await api("/profile", { ...profile, city, country: profile.country || "India", personality, interests, group, transport, budget, currency: profile.currency || "INR" }, "PUT");
      await onComplete();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Make Roamly yours." subtitle={`A few quick choices so every suggestion feels more like you. Step ${step} of 3.`} onClose={() => {}} wide>
      <div className="onboarding-progress"><span className={step >= 1 ? "active" : ""} /><span className={step >= 2 ? "active" : ""} /><span className={step >= 3 ? "active" : ""} /></div>
      {step === 1 && <div className="onboarding-step"><h3>What kind of journey feels right?</h3><p>Pick the pace you reach for most often.</p>{choices(["Peace-seeking", "Adventure-seeking", "A thoughtful mix", "Lively and social", "Flexible"], personality, setPersonality)}<label>Home city<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kochi" maxLength={100} /></label></div>}
      {step === 2 && <div className="onboarding-step"><h3>What draws you in?</h3><p>Choose as many as you like.</p><div className="onboarding-choices">{["Nature", "Adventure", "Culture", "Food", "Coast", "Photography", "Wellness", "Wildlife"].map((item) => <button type="button" key={item} className={interests.includes(item) ? "selected" : ""} onClick={() => setInterests((v) => v.includes(item) ? v.filter((x) => x !== item) : [...v, item])}>{interests.includes(item) && <Check size={14} />}{item}</button>)}</div></div>}
      {step === 3 && <div className="onboarding-step"><h3>How do you usually travel?</h3><p>We’ll shape practical suggestions around this.</p><label>Usually travelling with{choices(["Solo", "Couple", "Family", "Friends", "Group"], group, setGroup)}</label><label>Preferred transport{choices(["Car", "Motorcycle", "Public transport", "Walking", "Mixed"], transport, setTransport)}</label><label>Budget style{choices(["Budget", "Balanced", "Comfort", "Luxury"], budget, setBudget)}</label></div>}
      <ErrorMessage error={error} />
      <div className="modal-actions onboarding-actions">{step > 1 && <button className="button secondary" onClick={() => setStep(step - 1)}>Back</button>}<button className="button primary" disabled={busy || (step === 2 && !interests.length)} onClick={() => step < 3 ? setStep(step + 1) : finish()}>{busy ? <LoaderCircle className="spin" size={17} /> : step === 3 ? "Start exploring" : "Continue"}<ArrowRight size={16} /></button></div>
    </Modal>
  );
}
export function PlannerModal({
  profile,
  vehicles,
  initial,
  onClose,
  onCreated,
}: {
  profile: Profile;
  vehicles: Vehicle[];
  initial?: Destination;
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}) {
  const [destinationId, setDestinationId] = useState(
    initial?.id || destinations[0].id,
  );
  const [days, setDays] = useState(3);
  const [people, setPeople] = useState(2);
  const [budget, setBudget] = useState(12000);
  const [currency, setCurrency] = useState(profile.currency || "INR");
  const [personality, setPersonality] = useState(
    profile.personality || "Peace-seeking",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(1);
  const [group, setGroup] = useState(profile.group || "Couple");
  const [transport, setTransport] = useState(profile.transport || "Car");
  const [includeFuel, setIncludeFuel] = useState(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || "");
  const [distanceKm, setDistanceKm] = useState(0);
  const [fuelPrice, setFuelPrice] = useState(
    profile.currency === "INR" ? 105 : 0,
  );
  const tripVehicle = vehicles.find((v) => v.id === vehicleId);
  const useFuel =
    includeFuel &&
    ["Car", "Motorcycle", "Mixed"].includes(transport) &&
    !!tripVehicle;
  const estimatedFuel =
    useFuel &&
    Number.isFinite(distanceKm) &&
    distanceKm > 0 &&
    Number.isFinite(fuelPrice) &&
    fuelPrice > 0
      ? fuelCost(distanceKm, tripVehicle!.mileage, fuelPrice)
      : 0;
  const [startDate, setStartDate] = useState(
    new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  );
  const destination =
    destinations.find((d) => d.id === destinationId) || destinations[0];
  const itinerary =
    Number.isInteger(days) &&
    days >= 1 &&
    days <= 14 &&
    Number.isInteger(people) &&
    people >= 1 &&
    Number.isFinite(budget) &&
    budget > 0
      ? buildItinerary(
          destination,
          days,
          personality,
          Math.max(0, budget - estimatedFuel) / (days * people),
          people,
          currency,
          group,
        )
      : [];
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { trip } = await api<{ trip: Trip }>("/trips", {
        destination: destination.name,
        country: destination.country,
        image: destination.image,
        startDate,
        days,
        people,
        budget,
        currency,
        group,
        personality,
        transport,
        status: "Upcoming",
        itinerary,
        ...(useFuel
          ? { vehicleId, distanceKm, fuelPricePerLitre: fuelPrice }
          : {}),
      });
      onCreated(trip);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        stage === 1
          ? "A new adventure starts here."
          : "Your journey, taking shape."
      }
      subtitle={
        stage === 1
          ? "A few details. A trip that feels like you."
          : "A suggested starting point. Make room for the unexpected."
      }
      onClose={onClose}
      wide
    >
      <div className="stepper">
        <span className="active">
          <i>{stage === 2 ? <Check size={12} /> : 1}</i>Your trip
        </span>
        <div />
        <span className={stage === 2 ? "active" : ""}>
          <i>2</i>Your itinerary
        </span>
      </div>
      {stage === 1 ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (estimatedFuel > budget) {
              setError(
                "The fuel estimate exceeds your trip budget. Adjust your budget or journey inputs.",
              );
              return;
            }
            setError("");
            setStage(2);
          }}
        >
          <label>
            Where are you dreaming of?
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}, {d.country}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Departure date
              <input
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              Number of days
              <input
                type="number"
                min="1"
                max="14"
                required
                value={days}
                onChange={(e) => setDays(+e.target.value)}
              />
            </label>
            <label>
              Who's coming?
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  if (e.target.value === "Solo") setPeople(1);
                }}
              >
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
            <label>
              Number of travellers
              <input
                type="number"
                min="1"
                max="50"
                required
                value={people}
                onChange={(e) => setPeople(+e.target.value)}
              />
            </label>
            <label>
              Total trip budget
              <input
                type="number"
                min="1"
                max="10000000"
                required
                value={budget}
                onChange={(e) => setBudget(+e.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setFuelPrice(0);
                }}
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Your travel mood
              <select
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              >
                {[
                  "Peace-seeking",
                  "Adventure-seeking",
                  "Ambivert",
                  "Introvert",
                  "Extrovert",
                  "Social",
                  "Flexible",
                  "Luxury traveller",
                  "Budget traveller",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Getting around
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
              >
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
          </div>
          {vehicles.length > 0 &&
            ["Car", "Motorcycle", "Mixed"].includes(transport) && (
              <div className="trip-fuel-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeFuel}
                    onChange={(e) => setIncludeFuel(e.target.checked)}
                  />{" "}
                  Include my vehicle’s fuel in the plan
                </label>
                {includeFuel && (
                  <>
                    <label>
                      Vehicle for this trip
                      <select
                        value={vehicleId}
                        onChange={(e) => setVehicleId(e.target.value)}
                      >
                        {vehicles.map((v) => (
                          <option value={v.id} key={v.id}>
                            {v.name}
                            {v.isExample ? " (example)" : ""} · {v.mileage} km/L
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="form-grid">
                      <label>
                        Total journey distance (km)
                        <input
                          type="number"
                          min="1"
                          max="100000"
                          required
                          value={distanceKm}
                          onChange={(e) => setDistanceKm(+e.target.value)}
                        />
                      </label>
                      <label>
                        Fuel price per litre ({currency})
                        <input
                          type="number"
                          min="0.01"
                          max="100000"
                          step="0.01"
                          required
                          value={fuelPrice}
                          onChange={(e) => setFuelPrice(+e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="data-note">
                      Enter the complete journey distance, including your return
                      if needed. This is not a routed distance. The starting
                      fuel price is illustrative; replace it with your current
                      quote.
                    </p>
                    {estimatedFuel > 0 && (
                      <div className="fuel-plan-estimate">
                        <CarFront size={16} />
                        <span>Estimated trip fuel</span>
                        <strong>{money(estimatedFuel, currency, 2)}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          <div className="soft-notice">
            <Leaf size={18} />
            <span>
              We’ll use your travel mood to suggest a comfortable pace and
              visiting times.
            </span>
          </div>
          <ErrorMessage error={error} />
          <button className="button primary full" type="submit">
            Build my itinerary
            <ArrowRight size={17} />
          </button>
        </form>
      ) : (
        <>
          <div className="plan-summary">
            <img src={destination.image} alt={destination.name} />
            <div>
              <span className="eyebrow">YOUR NEXT CHAPTER</span>
              <h3>{destination.name}</h3>
              <p>
                {days} days · {people} travellers · {money(budget, currency)}{" "}
                budget
              </p>
            </div>
            <span className="tag sage">Suggested plan</span>
          </div>
          {useFuel && (
            <div className="soft-notice fuel-preview">
              <CarFront size={18} />
              <span>
                <strong>
                  {money(estimatedFuel, currency, 2)} estimated fuel
                </strong>
                <br />
                {distanceKm} entered km · {tripVehicle!.mileage} km/L ·{" "}
                {money(fuelPrice, currency, 2)}/L
                <br />
                The remaining{" "}
                {money(Math.max(0, budget - estimatedFuel), currency)} is
                available for your stay, food, and experiences.
              </span>
            </div>
          )}
          <div className="itinerary preview-itinerary">
            {itinerary.map((day) => (
              <div className="itinerary-day" key={day.day}>
                <div className="day-number">
                  {String(day.day).padStart(2, "0")}
                </div>
                <div>
                  <h4>{day.title}</h4>
                  {day.activities.map((a, i) => (
                    <p key={i}>
                      <time>{a.time}</time>
                      {a.title}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="data-note">
            Template-based suggestions and estimated costs. Check access,
            opening hours, route distances, and conditions before travel.
            Weather and traffic aren’t connected.
          </p>
          <ErrorMessage error={error} />
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setStage(1)}>
              Edit details
            </button>
            <button className="button primary" onClick={save} disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              Save my trip
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function VehicleModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle?: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fuelType, setFuelType] = useState(vehicle?.fuelType || "Petrol");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(
        vehicle ? `/vehicles/${vehicle.id}` : "/vehicles",
        {
          ...data,
          fuelType,
          ...Object.fromEntries(
            ["tankCapacity", "mileage", "odometer", "fuelLevel"].map((k) => [
              k,
              Number(data[k]),
            ]),
          ),
        },
        vehicle ? "PATCH" : "POST",
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        vehicle ? "Keep your ride up to date." : "Meet your travel companion."
      }
      subtitle="Your vehicle details connect every kilometre to your budget."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Vehicle name
          <input
            name="name"
            required
            defaultValue={vehicle?.name}
            placeholder="e.g. My Toyota RAV4"
            maxLength={100}
          />
        </label>
        <div className="form-grid">
          <label>
            Vehicle type
            <select name="type" defaultValue={vehicle?.type || "Car"}>
              {["Car", "Motorcycle", "Scooter", "Van", "Other"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Fuel type
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value)}
            >
              {["Petrol", "Diesel", "Hybrid"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Tank capacity (litres)
            <input
              name="tankCapacity"
              type="number"
              min="1"
              max="1000"
              step="0.1"
              required
              defaultValue={vehicle?.tankCapacity || 50}
            />
          </label>
          <label>
            Fuel efficiency (km/L)
            <input
              name="mileage"
              type="number"
              min="0.1"
              max="200"
              step="0.1"
              required
              defaultValue={vehicle?.mileage || 18}
            />
          </label>
          <label>
            Odometer (km)
            <input
              name="odometer"
              type="number"
              min="0"
              max="10000000"
              required
              defaultValue={vehicle?.odometer || 0}
            />
          </label>
          <label>
            Current fuel level (%)
            <input
              name="fuelLevel"
              type="number"
              min="0"
              max="100"
              required
              defaultValue={vehicle?.fuelLevel ?? 60}
            />
          </label>
        </div>
        <p className="data-note">
          Fuel level is user-provided. Range is an estimate based on these
          values. Electric vehicle energy tracking is planned for a later phase.
        </p>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <CarFront size={16} />
          )}
          Save vehicle
        </button>
      </form>
    </Modal>
  );
}
export function ExpenseModal({
  trips,
  currency,
  onClose,
  onSaved,
}: {
  trips: Trip[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tripId, setTripId] = useState(trips[0]?.id || "");
  const trip = trips.find((t) => t.id === tripId);
  const [selectedCurrency, setSelectedCurrency] = useState(
    trip?.currency || currency,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/expenses", {
        ...data,
        tripId,
        amount: Number(data.amount),
        people: Number(data.people),
        currency: selectedCurrency,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Little moments. All accounted for."
      subtitle="Add an expense to keep your trip budget in view."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          What was it for?
          <input
            name="title"
            required
            placeholder="e.g. Lunch at the little café"
            maxLength={120}
          />
        </label>
        <div className="form-grid">
          <label>
            Amount
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max="10000000"
              required
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
            >
              {currencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select name="category">
              {[
                "Food",
                "Fuel",
                "Hotel",
                "Activities",
                "Parking",
                "Tolls",
                "Tickets",
                "Shopping",
                "Public transport",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Trip
            <select
              value={tripId}
              onChange={(e) => {
                setTripId(e.target.value);
                const selected = trips.find((t) => t.id === e.target.value);
                if (selected) setSelectedCurrency(selected.currency);
              }}
            >
              <option value="">Everyday travels</option>
              {trips.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.destination}
                </option>
              ))}
            </select>
          </label>
          <label>
            Split between
            <input
              name="people"
              type="number"
              key={tripId}
              defaultValue={trip?.people || 1}
              required
              min="1"
              max="100"
            />
          </label>
        </div>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Plus size={16} />
          )}
          Add expense
        </button>
      </form>
    </Modal>
  );
}
export function FuelModal({
  vehicle,
  currency,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [litres, setLitres] = useState(25);
  const [price, setPrice] = useState(currency === "INR" ? 105 : 1.5);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/fuel-records", {
        vehicleId: vehicle.id,
        date: f.date,
        litres,
        pricePerLitre: price,
        totalAmount: litres * price,
        odometer: Number(f.odometer),
        fullTank: f.fullTank === "on",
        fuelType: vehicle.fuelType,
        currency,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ready for a few more miles."
      subtitle={`Record a fill-up for ${vehicle.name}.`}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            Odometer (km)
            <input
              name="odometer"
              type="number"
              min={vehicle.odometer}
              required
              defaultValue={vehicle.odometer}
            />
          </label>
          <label>
            Fuel added (litres)
            <input
              type="number"
              min="0.1"
              max={vehicle.tankCapacity}
              step="0.01"
              required
              value={litres}
              onChange={(e) => setLitres(+e.target.value)}
            />
          </label>
          <label>
            Entered price per litre ({currency})
            <input
              type="number"
              min="0.01"
              max="10000"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(+e.target.value)}
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" name="fullTank" />I filled the tank completely
        </label>
        <div className="calculation-result">
          <span>Total fill-up cost</span>
          <strong>{money(litres * price, currency, 2)}</strong>
        </div>
        <p className="data-note">
          Enter the price on your receipt. The initial price is illustrative,
          not a current quote. No live fuel prices are connected. After a
          partial fill-up, update your entered fuel percentage to refresh the
          range estimate. A full fill-up sets it to 100%.
        </p>
        <ErrorMessage error={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? <LoaderCircle size={16} className="spin" /> : null}Save
          fill-up
        </button>
      </form>
    </Modal>
  );
}
export function FuelCalculator({
  vehicle,
  currency,
}: {
  vehicle?: Vehicle;
  currency: string;
}) {
  const [distance, setDistance] = useState(240);
  const [mileage, setMileage] = useState(vehicle?.mileage || 18);
  const [price, setPrice] = useState(currency === "INR" ? 105 : 1.5);
  const result =
    [distance, mileage, price].every(Number.isFinite) &&
    distance >= 0 &&
    mileage > 0 &&
    price >= 0
      ? fuelCost(distance, mileage, price)
      : null;
  return (
    <div className="panel fuel-calculator">
      <div className="panel-heading">
        <div className="section-icon sand">
          <Wallet size={18} />
        </div>
        <div>
          <h3>What will the journey cost?</h3>
          <p>A little planning goes a long way.</p>
        </div>
      </div>
      <div className="form-grid calculator-fields">
        <label>
          Distance (km)
          <input
            type="number"
            min="0"
            value={distance}
            onChange={(e) => setDistance(+e.target.value)}
          />
        </label>
        <label>
          Efficiency (km/L)
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={mileage}
            onChange={(e) => setMileage(+e.target.value)}
          />
        </label>
        <label>
          Price / litre ({currency})
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(+e.target.value)}
          />
        </label>
      </div>
      <div className="calculation-result">
        <span>Estimated fuel cost</span>
        <strong>{result === null ? "—" : money(result, currency, 2)}</strong>
      </div>
      <p className="data-note">
        The starting price is illustrative. Enter your actual fuel price. Actual
        consumption varies with route and driving conditions.
      </p>
    </div>
  );
}
