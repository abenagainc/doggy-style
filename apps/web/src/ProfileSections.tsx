import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import * as profile from "./profileData.js";

/** Collapsible editor for a dog's health / vaccinations / pedigree / temperament. */
export function ProfileSectionsEditor({ dogId }: { dogId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <h4>Profile details</h4>
      <p><small>These appear on your dog's public candidate profile.</small></p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        <li><SectionToggle label="Health" id="health" open={open} setOpen={setOpen} /><Section name="health" open={open} dogId={dogId} /></li>
        <li><SectionToggle label="Vaccinations" id="vaccinations" open={open} setOpen={setOpen} /><Section name="vaccinations" open={open} dogId={dogId} /></li>
        <li><SectionToggle label="Pedigree" id="pedigree" open={open} setOpen={setOpen} /><Section name="pedigree" open={open} dogId={dogId} /></li>
        <li><SectionToggle label="Temperament" id="temperament" open={open} setOpen={setOpen} /><Section name="temperament" open={open} dogId={dogId} /></li>
      </ul>
    </div>
  );
}

function SectionToggle({ label, id, open, setOpen }: { label: string; id: string; open: string | null; setOpen: (v: string | null) => void }) {
  const isOpen = open === id;
  return (
    <button onClick={() => setOpen(isOpen ? null : id)} style={{ width: "100%", textAlign: "left" }}>
      {isOpen ? "▾" : "▸"} {label}
    </button>
  );
}

function Section({ name, open, dogId }: { name: string; open: string | null; dogId: string }) {
  if (open !== name) return null;
  if (name === "health") return <HealthEditor dogId={dogId} />;
  if (name === "vaccinations") return <VaccinationsEditor dogId={dogId} />;
  if (name === "pedigree") return <PedigreeEditor dogId={dogId} />;
  return <TemperamentEditor dogId={dogId} />;
}

function useSection<T>(loader: (dogId: string) => Promise<T>, dogId: string) {
  const [value, setValue] = useState<T | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setValue(await loader(dogId)); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Load failed."); }
  }, [dogId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [dogId]);
  const save = async (action: () => Promise<void>) => {
    setBusy(true); setErrorText(null); setNote(null);
    try { await action(); setNote("Saved ✓"); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Save failed."); }
    finally { setBusy(false); }
  };
  return { value, setValue, errorText, note, busy, save };
}

const field = { marginBottom: 8 };
const input = { width: "100%" };

function HealthEditor({ dogId }: { dogId: string }) {
  const sec = useSection<profile.HealthSection>(profile.loadHealth, dogId);
  if (!sec.value) return <LoadingRow error={sec.errorText} />;
  const v = sec.value;
  const set = (patch: Partial<profile.HealthSection>) => sec.setValue({ ...v, ...patch });
  return (
    <fieldset disabled={sec.busy}>
      {sec.note && <p role="status">{sec.note}</p>}
      {sec.errorText && <p role="alert">{sec.errorText}</p>}
      <label>Height (cm)<input style={input} value={v.height_cm ?? ""} onChange={(e) => set({ height_cm: e.target.value })} /></label>
      <label>Weight (kg)<input style={input} value={v.weight_kg ?? ""} onChange={(e) => set({ weight_kg: e.target.value })} /></label>
      <label>General health<textarea style={input} maxLength={2000} value={v.general_health ?? ""} onChange={(e) => set({ general_health: e.target.value })} /></label>
      <label>Known health issues<textarea style={input} maxLength={2000} value={v.health_issues ?? ""} onChange={(e) => set({ health_issues: e.target.value })} /></label>
      <button onClick={() => void sec.save(() => profile.saveHealth(dogId, v))}>Save health</button>
    </fieldset>
  );
}

function VaccinationsEditor({ dogId }: { dogId: string }) {
  const [list, setList] = useState<profile.Vaccination[] | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [form, setForm] = useState({ vaccine_name: "", date_given: "", next_due: "", notes: "" });
  const load = useCallback(async () => {
    try { setList(await profile.loadVaccinations(dogId)); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Load failed."); }
  }, [dogId]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setErrorText(null);
    try { await profile.addVaccination(dogId, form); setForm({ vaccine_name: "", date_given: "", next_due: "", notes: "" }); await load(); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Add failed."); }
  };
  const remove = async (id: string) => {
    try { await profile.deleteVaccination(id); await load(); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Delete failed."); }
  };

  if (list === null) return <LoadingRow error={errorText} />;
  return (
    <fieldset>
      {errorText && <p role="alert">{errorText}</p>}
      {(list).length === 0 ? <p>No vaccinations recorded.</p> : (
        <ul>{list.map((v) => (
          <li key={v.id}>
            <strong>{v.vaccine_name}</strong> — given {v.date_given}{v.next_due ? `, next due ${v.next_due}` : ""}{v.notes ? ` · ${v.notes}` : ""}{" "}
            <button onClick={() => void remove(v.id!)}>Remove</button>
          </li>
        ))}</ul>
      )}
      <label>Vaccine<input style={input} required value={form.vaccine_name} onChange={(e) => setForm({ ...form, vaccine_name: e.target.value })} /></label>
      <label>Date given<input type="date" style={input} value={form.date_given} onChange={(e) => setForm({ ...form, date_given: e.target.value })} /></label>
      <label>Next due (optional)<input type="date" style={input} value={form.next_due ?? ""} onChange={(e) => setForm({ ...form, next_due: e.target.value })} /></label>
      <button onClick={() => void add()}>Add vaccination</button>
    </fieldset>
  );
}

function PedigreeEditor({ dogId }: { dogId: string }) {
  const sec = useSection<profile.PedigreeSection>(profile.loadPedigree, dogId);
  if (!sec.value) return <LoadingRow error={sec.errorText} />;
  const v = sec.value;
  const set = (patch: Partial<profile.PedigreeSection>) => sec.setValue({ ...v, ...patch });
  return (
    <fieldset disabled={sec.busy}>
      {sec.note && <p role="status">{sec.note}</p>}
      {sec.errorText && <p role="alert">{sec.errorText}</p>}
      <label>Sire (father)<input style={input} maxLength={100} value={v.sire_name ?? ""} onChange={(e) => set({ sire_name: e.target.value })} /></label>
      <label>Dam (mother)<input style={input} maxLength={100} value={v.dam_name ?? ""} onChange={(e) => set({ dam_name: e.target.value })} /></label>
      <label>Registration number<input style={input} maxLength={100} value={v.registration_number ?? ""} onChange={(e) => set({ registration_number: e.target.value })} /></label>
      <label>Lineage notes<textarea style={input} maxLength={2000} value={v.lineage_notes ?? ""} onChange={(e) => set({ lineage_notes: e.target.value })} /></label>
      <button onClick={() => void sec.save(() => profile.savePedigree(dogId, v))}>Save pedigree</button>
    </fieldset>
  );
}

const ENERGY = ["LOW", "MODERATE", "HIGH", "VERY_HIGH"];
const TRAINABILITY = ["LOW", "MODERATE", "HIGH"];

function TemperamentEditor({ dogId }: { dogId: string }) {
  const sec = useSection<profile.TemperamentSection>(profile.loadTemperament, dogId);
  if (!sec.value) return <LoadingRow error={sec.errorText} />;
  const v = sec.value;
  const set = (patch: Partial<profile.TemperamentSection>) => sec.setValue({ ...v, ...patch });
  const tri = (label: string, key: "good_with_children" | "good_with_dogs" | "good_with_cats") => (
    <div>
      <span>{label}: </span>
      {[
        ["yes", true], ["no", false], ["unknown", null],
      ].map(([label2, val]) => (
        <label key={String(label2)} style={{ marginRight: 8 }}>
          <input type="radio" name={`${dogId}-${key}`} checked={v[key] === (val as boolean | null)} onChange={() => set({ [key]: val } as Partial<profile.TemperamentSection>)} /> {label2}
        </label>
      ))}
    </div>
  );
  return (
    <fieldset disabled={sec.busy}>
      {sec.note && <p role="status">{sec.note}</p>}
      {sec.errorText && <p role="alert">{sec.errorText}</p>}
      <label>Energy level
        <select style={input} value={v.energy_level ?? ""} onChange={(e) => set({ energy_level: e.target.value })}>
          <option value="">—</option>
          {ENERGY.map((o) => <option key={o} value={o}>{o.replace("_", " ").toLowerCase()}</option>)}
        </select>
      </label>
      {tri("Good with children", "good_with_children")}
      {tri("Good with dogs", "good_with_dogs")}
      {tri("Good with cats", "good_with_cats")}
      <label>Trainability
        <select style={input} value={v.trainability ?? ""} onChange={(e) => set({ trainability: e.target.value })}>
          <option value="">—</option>
          {TRAINABILITY.map((o) => <option key={o} value={o}>{o.toLowerCase()}</option>)}
        </select>
      </label>
      <label>Notes<textarea style={input} maxLength={2000} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></label>
      <button onClick={() => void sec.save(() => profile.saveTemperament(dogId, v))}>Save temperament</button>
    </fieldset>
  );
}

function LoadingRow({ error }: { error: string | null }) {
  return error ? <p role="alert">{error}</p> : <p>Loading…</p>;
}
