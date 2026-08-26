import { useCallback, useEffect, useState } from "react";
import { AppError, dogSexes } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import * as dogsData from "./dogsData.js";
import { PhotoGallery } from "./PhotoGallery.js";
import { photoSignedUrl } from "./dogsData.js";
import { ScreeningQuestionsEditor } from "./ScreeningEditor.js";
import { ProfileSectionsEditor } from "./ProfileSections.js";

export function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}

export function MyDogs({ onActiveChanged }: { onActiveChanged: () => Promise<void> }) {
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
            <DogCard dog={dog} onChanged={() => { void act(async () => {}, "Updated.").then(() => onActiveChanged()); }} />
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
  const [photoPaths, setPhotoPaths] = useState<string[] | null>(null);
  const complete = dog.profile_status === "COMPLETE";

  useEffect(() => {
    void dogsData.listPhotos(dog.id).then((rows) => {
      // cover first, then sort order
      const sorted = [...rows].sort((a, b) => Number(b.is_cover) - Number(a.is_cover));
      setPhotoPaths(sorted.map((p) => p.storage_path));
    }).catch(() => setPhotoPaths([]));
  }, [dog.id]);

  return (
    <article data-dog-id={dog.id}>
      <strong>{dog.name}</strong> · {dog.breed} · {dog.sex.toLowerCase()} ·{" "}
      <span data-status={complete ? "complete" : "incomplete"}>{complete ? "profile complete" : "profile incomplete"}</span> ·{" "}
      <span data-status={dog.availability_status.toLowerCase()}>{dog.availability_status.toLowerCase()}</span>{" "}
      <button onClick={() => setOpen(!open)}>{open ? "Close" : "Manage"}</button>
      {photoPaths !== null && photoPaths.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <PhotoGallery paths={photoPaths} />
        </div>
      )}
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
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {photos.map((photo) => (
            <li key={photo.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PhotoThumb path={photo.storage_path} />
              <div>
                {photo.is_cover && <span style={{ background: "var(--ink)", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: "0.7rem", marginRight: 6 }}>COVER</span>}
                {!photo.is_cover && <button disabled={busy} onClick={() => void run(() => dogsData.setCover(photo.id), "Cover updated.")}>Set cover</button>}
                {" "}
                <button disabled={busy} onClick={() => void run(() => dogsData.movePhoto(photo.id, -1), "Moved up.")}>←</button>
                <button disabled={busy} onClick={() => void run(() => dogsData.movePhoto(photo.id, 1), "Moved down.")}>→</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input type="file" accept="image/*" aria-label="Add photo" disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => dogsData.uploadPhoto(dog.id, file), "Photo added."); }} />

      <ProfileSectionsEditor dogId={dog.id} />

      <h4>Screening questions</h4>
      <p><small>The other side must answer these before you can both confirm proceeding. Keep it to the essentials (max 5).</small></p>
      <ScreeningQuestionsEditor dogId={dog.id} />


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
          <button disabled={busy} onClick={() => void run(() => dogsData.savePreferences(dog.id, prefs), "Preferences saved.")}>Save preferences</button>
        </div>
      )}

      <h4>Danger zone</h4>
      <button disabled={busy} onClick={() => void run(() => dogsData.archiveDog(dog.id), `${dog.name} archived.`)}>Archive {dog.name}</button>
    </div>
  );
}

export function PhotoThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { void photoSignedUrl(path).then(setUrl); }, [path]);
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
