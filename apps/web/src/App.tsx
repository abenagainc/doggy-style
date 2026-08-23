import { useCallback, useEffect, useState } from "react";
import { AppError, dogSexes, type AvailabilityStatus } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { supabase } from "./supabase.js";
import { restoreActiveDog } from "./dogs.js";
import { Discover } from "./Discover.js";
import { Connections } from "./Connections.js";
import { AuthGate } from "./AuthGate.js";
import * as dogsData from "./dogsData.js";
import * as interestsData from "./interestsData.js";

type Tab = "dogs" | "discover" | "interests" | "connections";

export function App() {
  return <AuthGate><Shell /></AuthGate>;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("dogs");
  const [activeDogId, setActiveDogId] = useState<string | null>(null);
  const [activeDogName, setActiveDogName] = useState<string>("");

  const refreshActiveDog = useCallback(async () => {
    const id = await restoreActiveDog();
    setActiveDogId(id);
    if (!id) { setActiveDogName(""); return; }
    const { data } = await supabase.from("dogs").select("name").eq("id", id).single();
    setActiveDogName((data as { name: string } | null)?.name ?? "");
  }, []);

  useEffect(() => { void refreshActiveDog(); }, [refreshActiveDog]);

  const needsDog = tab !== "dogs" && !activeDogId;
  return (
    <main>
      <header>
        <h1>Doggy Style 🐾</h1>
        <nav role="tablist">
          {(["dogs", "discover", "interests", "connections"] as const).map((entry) => (
            <button key={entry} role="tab" aria-selected={tab === entry} onClick={() => setTab(entry)}>{(entry[0] ?? "").toUpperCase() + entry.slice(1)}</button>
          ))}
        </nav>
        {activeDogId && <p>Active dog: <strong>{activeDogName}</strong></p>}
      </header>
      {needsDog ? (
        <EmptyState>Create and select a dog first — everything else is dog-scoped.</EmptyState>
      ) : tab === "dogs" ? (
        <MyDogs onActiveChanged={refreshActiveDog} />
      ) : tab === "discover" && activeDogId ? (
        <Discover />
      ) : tab === "interests" && activeDogId ? (
        <Interests activeDogId={activeDogId} />
      ) : (
        <Connections />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// My Dogs
// ---------------------------------------------------------------------------

function MyDogs({ onActiveChanged }: { onActiveChanged: () => Promise<void> }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [dogs, setDogs] = useState<dogsData.DogRow[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setErrorText(null);
    try { setDogs(await dogsData.listMyDogs()); setState("ready"); }
    catch (caught) { setErrorText(describe(caught)); setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: () => Promise<void>, note: string) => {
    setMessage(null); setErrorText(null);
    try { await action(); setMessage(note); await load(); await onActiveChanged(); }
    catch (caught) { setErrorText(describe(caught)); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={errorText ?? "Something went wrong."} retry={() => void load()} />;

  return (
    <section>
      <h2>My Dogs</h2>
      {message && <p role="status">{message}</p>}
      {(dogs ?? []).length === 0 && !adding && <EmptyState>No dogs yet. Add your first dog to get started.</EmptyState>}
      <ul>
        {(dogs ?? []).map((dog) => (
          <li key={dog.id}>
            <DogCard dog={dog} onChanged={() => void act(async () => {}, "Updated.").then(() => onActiveChanged)} />
          </li>
        ))}
      </ul>
      {!adding ? (
        <button onClick={() => setAdding(true)}>+ Add dog</button>
      ) : (
        <AddDogForm onDone={(note) => { setAdding(false); void act(async () => {}, note); }} onCancel={() => setAdding(false)} />
      )}
    </section>
  );
}

function DogCard({ dog, onChanged }: { dog: dogsData.DogRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const complete = dog.profile_status === "COMPLETE";
  return (
    <article data-dog-id={dog.id}>
      <strong>{dog.name}</strong> · {dog.breed} · {dog.sex.toLowerCase()} ·{" "}
      <span data-status={complete ? "complete" : "incomplete"}>{complete ? "profile complete" : "profile incomplete"}</span> ·{" "}
      <span data-status={dog.availability_status.toLowerCase()}>{dog.availability_status.toLowerCase()}</span>{" "}
      <button onClick={() => setOpen(!open)}>{open ? "Close" : "Manage"}</button>
      {open && <DogEditor dog={dog} onChanged={onChanged} />}
    </article>
  );
}

function DogEditor({ dog, onChanged }: { dog: dogsData.DogRow; onChanged: () => void }) {
  const [location, setLocation] = useState(dog.location ?? "");
  const [breedingEnabled, setBreedingEnabled] = useState(dog.breeding_enabled);
  const [photos, setPhotos] = useState<dogsData.PhotoRow[] | null>(null);
  const [prefs, setPrefs] = useState<dogsData.PrefsShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const loadExtras = useCallback(async () => {
    try {
      setPhotos(await dogsData.listPhotos(dog.id));
      const rawPrefs = await dogsData.loadPreferences(dog.id);
      setPrefs(rawPrefs ? {
        requiredBreeds: rawPrefs.required_breeds.join(", "),
        preferredBreeds: rawPrefs.preferred_breeds.join(", "),
        ageMinMonths: String(rawPrefs.age_min_months),
        ageMaxMonths: String(rawPrefs.age_max_months),
        maxDistanceKm: String(rawPrefs.max_distance_km),
      } : { requiredBreeds: "", preferredBreeds: "", ageMinMonths: "12", ageMaxMonths: "96", maxDistanceKm: "50" });
    } catch (caught) { setErrorText(describe(caught)); }
  }, [dog.id]);
  useEffect(() => { void loadExtras(); }, [loadExtras]);

  const run = async (action: () => Promise<void>, note: string) => {
    setBusy(true); setErrorText(null); setSavedNote(null);
    try { await action(); setSavedNote(note); onChanged(); await loadExtras(); }
    catch (caught) { setErrorText(describe(caught)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ borderLeft: "2px solid #ccc", paddingLeft: 12 }}>
      {errorText && <p role="alert">{errorText}</p>}
      {savedNote && <p role="status">{savedNote}</p>}

      <h4>Profile completion</h4>
      <label>Location (lat,lon — e.g. 30.05,31.23)<br /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="30.05,31.23" /></label><br />
      <label><input type="checkbox" checked={breedingEnabled} onChange={(event) => setBreedingEnabled(event.target.checked)} /> Breeding enabled</label><br />
      <button disabled={busy} onClick={() => void run(async () => {
        const trimmed = location.trim();
        if (trimmed && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(trimmed)) throw new AppError("VALIDATION_ERROR", "Location must be lat,lon.");
        await dogsData.updateDogBasics(dog.id, { location: trimmed || null, breeding_enabled: breedingEnabled });
      }, "Profile saved.")}>Save profile</button>

      <h4>Photos</h4>
      {photos === null ? <LoadingState /> : photos.length === 0 ? <p>No photos yet — at least one is required.</p> : (
        <ul>{photos.map((photo) => <li key={photo.id}><PhotoThumb path={photo.storage_path} /></li>)}</ul>
      )}
      <input type="file" accept="image/*" aria-label="Add photo" disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => dogsData.uploadPhoto(dog.id, file), "Photo added."); }} />

      <h4>Availability</h4>
      <button disabled={busy} onClick={() => void run(() => dogsData.setAvailability(dog.id, dog.availability_status === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE"), dog.availability_status === "AVAILABLE" ? "Marked unavailable." : "Marked available.")}>
        {dog.availability_status === "AVAILABLE" ? "Set unavailable" : "Set available"}
      </button>

      <h4>Matching preferences</h4>
      {prefs === null ? <LoadingState /> : (
        <div>
          <label>Required breeds (comma-separated)<br /><input value={prefs.requiredBreeds} onChange={(event) => setPrefs({ ...prefs, requiredBreeds: event.target.value })} /></label><br />
          <label>Preferred breeds<br /><input value={prefs.preferredBreeds} onChange={(event) => setPrefs({ ...prefs, preferredBreeds: event.target.value })} /></label><br />
          <label>Age min (months)<br /><input type="number" min={0} value={prefs.ageMinMonths} onChange={(event) => setPrefs({ ...prefs, ageMinMonths: event.target.value })} /></label>
          <label>Age max<br /><input type="number" min={0} value={prefs.ageMaxMonths} onChange={(event) => setPrefs({ ...prefs, ageMaxMonths: event.target.value })} /></label>
          <label>Max distance (km)<br /><input type="number" min={1} value={prefs.maxDistanceKm} onChange={(event) => setPrefs({ ...prefs, maxDistanceKm: event.target.value })} /></label><br />
          <button disabled={busy} onClick={() => void run(() => dogsData.savePreferences(dog.id, {
            requiredBreeds: prefs.requiredBreeds, preferredBreeds: prefs.preferredBreeds,
            ageMinMonths: prefs.ageMinMonths, ageMaxMonths: prefs.ageMaxMonths, maxDistanceKm: prefs.maxDistanceKm,
          }), "Preferences saved.")}>Save preferences</button>
        </div>
      )}

      <h4>Danger zone</h4>
      <button disabled={busy} onClick={() => void run(() => dogsData.archiveDog(dog.id), `${dog.name} archived.`)}>Archive {dog.name}</button>
    </div>
  );
}

function PhotoThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { void dogsData.photoSignedUrl(path).then(setUrl); }, [path]);
  return url ? <img src={url} alt="Dog photo" style={{ maxWidth: 96, maxHeight: 96 }} /> : <span>photo</span>;
}

function AddDogForm({ onDone, onCancel }: { onDone: (note: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [sex, setSex] = useState<(typeof dogSexes)[number]>("FEMALE");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [breed, setBreed] = useState("");
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setErrorText(null);
    try {
      const dog = await dogsData.createDog({ name, sex, dateOfBirth, breed });
      if (makeActive) await dogsData.setActiveDog(dog.id);
      onDone(`${dog.name} created!`);
    } catch (caught) { setErrorText(describe(caught)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <h3>Add a dog</h3>
      {errorText && <p role="alert">{errorText}</p>}
      <label>Name<br /><input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><br />
      <label>Sex<br />
        <select value={sex} onChange={(event) => setSex(event.target.value as (typeof dogSexes)[number])}>
          {dogSexes.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label><br />
      <label>Date of birth<br /><input type="date" required max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></label><br />
      <label>Breed<br /><input required maxLength={100} value={breed} onChange={(event) => setBreed(event.target.value)} /></label><br />
      <label><input type="checkbox" checked={makeActive} onChange={(event) => setMakeActive(event.target.checked)} /> Make active dog</label><br />
      <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create dog"}</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

function Interests({ activeDogId }: { activeDogId: string }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [views, setViews] = useState<{ received: interestsData.InterestView[]; sent: interestsData.InterestView[] } | null>(null);

  const load = useCallback(async () => {
    setState("loading"); setErrorText(null);
    try { setViews(await interestsData.listInterests(activeDogId)); setState("ready"); }
    catch (caught) { setErrorText(describe(caught)); setState("error"); }
  }, [activeDogId]);
  useEffect(() => { void load(); }, [load]);

  const accept = async (sourceDogId: string) => {
    try {
      await interestsData.acceptInterest(activeDogId, sourceDogId, "NORMAL");
      setNote("Interest accepted — it's a connection! Check the Connections tab.");
      await load();
    } catch (caught) { setErrorText(describe(caught)); }
  };

  const decline = async (interestId: string) => {
    try { await interestsData.declineInterest(interestId); setNote("Interest declined."); await load(); }
    catch (caught) { setErrorText(describe(caught)); }
  };

  const withdraw = async (interestId: string) => {
    try { await interestsData.withdrawInterest(interestId); setNote("Interest withdrawn."); await load(); }
    catch (caught) { setErrorText(describe(caught)); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={errorText ?? "Something went wrong."} retry={() => void load()} />;

  return (
    <section>
      <h2>Interests for your active dog</h2>
      {note && <p role="status">{note}</p>}
      {errorText && <p role="alert">{errorText}</p>}
      <h3>Received ({(views?.received ?? []).length})</h3>
      {(views?.received ?? []).length === 0 ? <EmptyState>No pending received interests.</EmptyState> : (
        <ul>{(views?.received ?? []).map((view) => (
          <li key={view.id}>
            <strong>{view.otherDogName}</strong> sent {view.strength === "STRONG" ? "Strong Interest" : "Interest"}{" "}
            <button onClick={() => void accept(view.otherDogId)}>Accept</button>{" "}
            <button onClick={() => void decline(view.id)}>Decline</button>
          </li>
        ))}</ul>
      )}
      <h3>Sent ({(views?.sent ?? []).length})</h3>
      {(views?.sent ?? []).length === 0 ? <EmptyState>No pending sent interests.</EmptyState> : (
        <ul>{(views?.sent ?? []).map((view) => (
          <li key={view.id}>
            You sent {view.strength === "STRONG" ? "Strong Interest" : "Interest"} to <strong>{view.otherDogName}</strong>{" "}
            <button onClick={() => void withdraw(view.id)}>Withdraw</button>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}

export type { AvailabilityStatus };
