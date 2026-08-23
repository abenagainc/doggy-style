import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { loadCandidateProfile, type CandidateProfile } from "./profileData.js";
import { photoSignedUrl } from "./dogsData.js";

function DogPhoto({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { if (path) void photoSignedUrl(path).then(setUrl); }, [path]);
  return url
    ? <img src={url} alt="Dog" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
    : <div style={{ width: "100%", height: 200, background: "#eee", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🐶</div>;
}

function ageFrom(dob: string): string {
  const months = Math.floor((Date.now() - new Date(`${dob}T00:00:00Z`).valueOf()) / (365.25 * 24 * 3600 * 1000 * 12));
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

export function CandidateDetail({ viewerDogId, candidateDogId, onBack }: { viewerDogId: string; candidateDogId: string; onBack: () => void }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [mainPhoto, setMainPhoto] = useState(0);

  const load = useCallback(async () => {
    setState("loading"); setErrorText(null);
    try { setProfile(await loadCandidateProfile(viewerDogId, candidateDogId)); setState("ready"); }
    catch (caught) { setErrorText(caught instanceof AppError ? caught.message : "Could not load this profile."); setState("error"); }
  }, [viewerDogId, candidateDogId]);
  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={errorText ?? "Unavailable."} retry={() => void load()} />;
  if (!profile) return <EmptyState>Profile unavailable.</EmptyState>;

  const health = profile.health as Record<string, unknown> ?? {};
  const pedigree = profile.pedigree as Record<string, unknown> ?? {};
  const temp = profile.temperament as {
    energy_level?: string; good_with_children?: boolean; good_with_dogs?: boolean;
    good_with_cats?: boolean; trainability?: string; notes?: string;
  } ?? {};
  const row = (label: string, value: unknown) =>
    value === null || value === undefined || value === "" ? null : (
      <><dt>{label}</dt><dd>{String(value)}</dd></>
    );

  return (
    <article data-testid="candidate-detail">
      <p><a href="#back" onClick={(event) => { event.preventDefault(); onBack(); }}>← Back to discovery</a></p>
      <h1>{profile.name}</h1>
      <p>{profile.breed} · {profile.sex.toLowerCase()} · {ageFrom(profile.date_of_birth)} old ·{" "}
        <span data-status={profile.verificationStatus?.toLowerCase()}>{profile.verificationStatus === "APPROVED" ? "verified owner" : "unverified owner"}</span></p>

      {profile.photos.length > 0 && (
        <>
          <DogPhoto path={profile.photos[mainPhoto] ?? null} />
          {profile.photos.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {profile.photos.map((p, index) => (
                <Thumb key={p} path={p} selected={index === mainPhoto} onClick={() => setMainPhoto(index)} />
              ))}
            </div>
          )}
        </>
      )}

      <h2>About</h2>
      {Object.keys(temp).length > 0 && (
        <dl>
          {row("Energy level", (temp.energy_level as string)?.replace("_", " ").toLowerCase())}
          {row("Good with children", fmtTri(temp.good_with_children))}
          {row("Good with dogs", fmtTri(temp.good_with_dogs))}
          {row("Good with cats", fmtTri(temp.good_with_cats))}
          {row("Trainability", (temp.trainability as string)?.toLowerCase())}
          {row("Temperament notes", temp.notes)}
        </dl>
      )}
      {Object.keys(temp).length === 0 && Object.keys(health).length === 0 && (
        <EmptyState>The owner hasn't filled in profile details yet.</EmptyState>
      )}

      {Object.keys(health).length > 0 && (
        <>
          <h3>Health</h3>
          <dl>
            {row("Height", health.height_cm ? `${health.height_cm} cm` : null)}
            {row("Weight", health.weight_kg ? `${health.weight_kg} kg` : null)}
            {row("General health", health.general_health)}
            {row("Known issues", health.health_issues)}
          </dl>
        </>
      )}

      {profile.vaccinations && profile.vaccinations.length > 0 && (
        <>
          <h3>Vaccinations</h3>
          <ul>
            {profile.vaccinations.map((v, i) => (
              <li key={i}><strong>{v.vaccineName}</strong> — given {v.dateGiven}{v.nextDue ? `, next due ${v.nextDue}` : ""}</li>
            ))}
          </ul>
        </>
      )}

      {Object.keys(pedigree).length > 0 && (
        <>
          <h3>Pedigree</h3>
          <dl>
            {row("Sire", pedigree.sire_name)}
            {row("Dam", pedigree.dam_name)}
            {row("Registration", pedigree.registration_number)}
            {row("Lineage", pedigree.lineage_notes)}
          </dl>
        </>
      )}

      <p><small>Distance and location are shown as approximate bands to protect privacy. Health details are owner-reported.</small></p>
    </article>
  );
}

function Thumb({ path, selected, onClick }: { path: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ border: selected ? "2px solid #333" : "2px solid transparent", padding: 0, borderRadius: 6 }}>
      <PhotoImg path={path} />
    </button>
  );
}

function PhotoImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { void photoSignedUrl(path).then(setUrl); }, [path]);
  return <img src={url || ""} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 4 }} />;
}

function fmtTri(v: boolean | null | undefined): string {
  return v === true ? "yes" : v === false ? "no" : "unknown";
}
