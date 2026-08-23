import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { restoreActiveDog } from "./dogs.js";
import { photoSignedUrl } from "./dogsData.js";
import { declineInterest, listReceivedInterests, loadFeed, passCandidate, sendInterest, type CandidateCard, type ReceivedInterest } from "./discovery.js";

function CandidatePhoto({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { if (path) void photoSignedUrl(path).then(setUrl); }, [path]);
  return url
    ? <img src={url} alt="Candidate dog" style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8 }} />
    : <div style={{ width: 280, height: 180, background: "#eee", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>🐶</div>;
}

type Screen = "loading" | "error" | "no-active-dog" | "feed" | "received";

export function Discover() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateCard[] | null>(null);
  const [current, setCurrent] = useState<CandidateCard | null>(null);
  const [received, setReceived] = useState<ReceivedInterest[] | null>(null);
  const [activeDogId, setActiveDogId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setScreen("loading"); setMessage(null); setCandidates(null); setCurrent(null);
    try {
      const dogId = await restoreActiveDog();
      if (!dogId) { setScreen("no-active-dog"); return; }
      setActiveDogId(dogId);
      const feed = await loadFeed(dogId);
      setCandidates(feed.candidates);
      setCurrent(feed.candidates[0] ?? null);
      setScreen("feed");
    } catch (caught) { setMessage(describe(caught)); setScreen("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (action: () => Promise<void>, successNote: string) => {
    if (!activeDogId || !current) return;
    setMessage(null);
    try {
      await action();
      setMessage(successNote);
      const next = (candidates ?? []).filter((entry) => entry.id !== current.id);
      setCandidates(next); setCurrent(next[0] ?? null);
    } catch (caught) { setMessage(describe(caught)); }
  };

  const showReceived = async () => {
    if (!activeDogId) return;
    try { setReceived(await listReceivedInterests(activeDogId)); } catch (caught) { setMessage(describe(caught)); }
  };

  if (screen === "loading") return <LoadingState />;
  if (screen === "error") return <ErrorState message={message ?? "Something went wrong."} retry={() => void load()} />;
  if (screen === "no-active-dog") return <EmptyState>Create a dog and complete its profile to start discovering candidates.</EmptyState>;

  return (
    <main>
      <h1>Discover</h1>
      <p><a href="#received" onClick={(event) => { event.preventDefault(); void showReceived(); }}>Review received interests</a></p>
      {message && <p role="status">{message}</p>}
      {current ? (
        <article data-testid="candidate-card">
          <CandidatePhoto path={current.photoPath} />
          <h2>{current.name}</h2>
          <dl>
            <dt>Breed</dt><dd>{current.breed}</dd>
            <dt>Sex</dt><dd>{current.sex}</dd>
            <dt>Age</dt><dd>{current.ageYears} years</dd>
            <dt>Distance</dt><dd>{current.distanceBand}</dd>
            <dt>Trust</dt><dd>{current.verification}</dd>
          </dl>
          <button onClick={() => void act(() => passCandidate(activeDogId!, current.id), "Passed.")}>Pass</button>
          <button onClick={() => void act(() => sendInterest(activeDogId!, current.id, "NORMAL"), "Interest sent.")}>Interested</button>
          <button onClick={() => void act(() => sendInterest(activeDogId!, current.id, "STRONG"), "Strong Interest sent.")}>Strong Interest</button>
        </article>
      ) : (
        <EmptyState>
          You've reviewed every available candidate. Review passed dogs or edit preferences from My Dogs to widen your search.
        </EmptyState>
      )}
      {received && (
        <section data-testid="received-interests">
          <h2>Received interests</h2>
          {received.length === 0 ? (
            <EmptyState>No pending interests for this dog.</EmptyState>
          ) : (
            <ul>
              {received.map((interest) => (
                <li key={interest.id}>
                  {interest.fromName} — {interest.strength === "STRONG" ? "Strong Interest" : "Interest"}{" "}
                  <button onClick={() => void declineInterest(interest.id).then(showReceived)}>Decline</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}
