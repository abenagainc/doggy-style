import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { restoreActiveDog } from "./dogs.js";
import { listPassedDogs, reconsiderPassed, photoSignedUrl } from "./dogsData.js";
import { declineInterest, listReceivedInterests, loadFeed, passCandidate, sendInterest, type CandidateCard, type ReceivedInterest } from "./discovery.js";
import { CandidateDetail } from "./CandidateDetail.js";

function CandidatePhoto({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { if (path) void photoSignedUrl(path).then(setUrl); }, [path]);
  return url
    ? <img src={url} alt="Candidate dog" style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8 }} />
    : <div style={{ width: 280, height: 180, background: "#eee", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>🐶</div>;
}

type Screen = "loading" | "error" | "no-active-dog" | "feed" | "received" | "passed" | "detail";

export function Discover() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateCard[] | null>(null);
  const [current, setCurrent] = useState<CandidateCard | null>(null);
  const [received, setReceived] = useState<ReceivedInterest[] | null>(null);
  const [activeDogId, setActiveDogId] = useState<string | null>(null);
  const [mutual, setMutual] = useState<{ dogName: string; connectionId: string } | null>(null);

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
      // Mutual interest? The send may have created a connection — celebrate it.
      if (successNote.includes("sent")) {
        const { findConnectionFor } = await import("./interestsData.js");
        const connectionId = await findConnectionFor(activeDogId, current.id);
        if (connectionId) {
          setMutual({ dogName: current.name, connectionId });
          const next = (candidates ?? []).filter((entry) => entry.id !== current.id);
          setCandidates(next); setCurrent(next[0] ?? null);
          return;
        }
      }
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
  if (mutual) {
    return (
      <main>
        <div data-testid="mutual-interest" style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{ fontSize: 64 }}>🎉🐶🎉</div>
          <h1>It's a match!</h1>
          <p><strong>{mutual.dogName}</strong>'s owner is interested in your dog too!</p>
          <p>
            <button onClick={() => { window.dispatchEvent(new CustomEvent("open-connection", { detail: mutual.connectionId })); setMutual(null); }}>
              Start conversation
            </button>
          </p>
          <p><a href="#keep" onClick={(event) => { event.preventDefault(); setMutual(null); setScreen("feed"); }}>Keep discovering</a></p>
        </div>
      </main>
    );
  }
  if (screen === "passed" && activeDogId) {
    return (
      <main>
        <h1>Discover</h1>
        <p><a href="#back" onClick={(event) => { event.preventDefault(); setScreen("feed"); }}>← Back to discovery</a></p>
        {message && <p role="status">{message}</p>}
        <PassedDogsList activeDogId={activeDogId} onChanged={() => void load()} />
      </main>
    );
  }

  return (
    <main>
      <h1>Discover</h1>
      <p><a href="#received" onClick={(event) => { event.preventDefault(); void showReceived(); }}>Review received interests</a></p>
      {message && <p role="status">{message}</p>}
      {current ? (
        screen === "detail" && activeDogId ? (
          <CandidateDetail viewerDogId={activeDogId} candidateDogId={current.id} onBack={() => setScreen("feed")} />
        ) : (
          <article data-testid="candidate-card">
            <a href="#detail" onClick={(event) => { event.preventDefault(); setScreen("detail"); }} style={{ display: "block" }}>
              <CandidatePhoto path={current.photoPath} />
            </a>
            <h2>{current.name}</h2>
            <dl>
              <dt>Breed</dt><dd>{current.breed}</dd>
              <dt>Sex</dt><dd>{current.sex}</dd>
              <dt>Age</dt><dd>{current.ageYears} years</dd>
              <dt>Distance</dt><dd>{current.distanceBand}</dd>
              <dt>Trust</dt><dd>{current.verification}</dd>
            </dl>
            <p><a href="#profile" onClick={(event) => { event.preventDefault(); setScreen("detail"); }}>View full profile →</a></p>
            <button onClick={() => void act(() => passCandidate(activeDogId!, current.id), "Passed.")}>Pass</button>
            <button onClick={() => void act(() => sendInterest(activeDogId!, current.id, "NORMAL"), "Interest sent.")}>Interested</button>
            <button onClick={() => void act(() => sendInterest(activeDogId!, current.id, "STRONG"), "Strong Interest sent.")}>Strong Interest</button>
          </article>
        )
      ) : (
        <section data-testid="discovery-exhausted">
          <EmptyState>You've reviewed every available candidate for this dog.</EmptyState>
          <p>
            <a href="#passed" onClick={(event) => { event.preventDefault(); setMessage(null); setScreen("passed"); }} style={{ marginRight: 16 }}>View passed dogs</a>
            <a href="#prefs" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent("goto-tab", { detail: "dogs" })); }}>Edit preferences (in My Dogs)</a>
          </p>
        </section>
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

function PassedDogsList({ activeDogId, onChanged }: { activeDogId: string; onChanged: () => void }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [list, setList] = useState<Array<{ id: string; name: string; breed: string; sex: string; photoPath: string | null }> | null>(null);

  const load = useCallback(async () => {
    setState("loading"); setErrorText(null);
    try { setList(await listPassedDogs(activeDogId)); setState("ready"); }
    catch (caught) { setErrorText(describe(caught)); setState("error"); }
  }, [activeDogId]);
  useEffect(() => { void load(); }, [load]);

  const reconsider = async (targetDogId: string) => {
    try {
      await reconsiderPassed(activeDogId, targetDogId);
      setNote("Candidate restored to your discovery feed.");
      await load();
      onChanged();
    } catch (caught) { setErrorText(describe(caught)); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={errorText ?? "Something went wrong."} retry={() => void load()} />;
  return (
    <section data-testid="passed-dogs">
      <h2>Passed dogs</h2>
      {note && <p role="status">{note}</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {(list ?? []).length === 0 ? (
        <EmptyState>You haven't passed any candidates for this dog.</EmptyState>
      ) : (
        <ul>
          {(list ?? []).map((entry) => (
            <li key={entry.id} style={{ marginBottom: 12 }}>
              <CandidatePhoto path={entry.photoPath} />
              <div>
                <strong>{entry.name}</strong> · {entry.breed} · {entry.sex.toLowerCase()}{" "}
                <button onClick={() => void reconsider(entry.id)}>Reconsider — show in feed again</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
