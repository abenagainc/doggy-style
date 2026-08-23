import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { supabase } from "./supabase.js";
import { restoreActiveDog } from "./dogs.js";
import { Discover } from "./Discover.js";
import { Connections } from "./Connections.js";

type DogSummary = { id: string; name: string; archived_at: string | null; profile_status: string; availability_status: string };

export function App() {
  const [dogs, setDogs] = useState<DogSummary[] | null>(null); const [error, setError] = useState<string | null>(null);
  const load = async () => { setDogs(null); setError(null); const { data, error: requestError } = await supabase.from("dogs").select("id,name,archived_at,profile_status,availability_status").is("archived_at", null).order("created_at"); if (requestError) { setError("We couldn't load your dogs."); return; } try { await restoreActiveDog(); setDogs(data); } catch { setError("We couldn't restore your active dog."); } };
  useEffect(() => { void load(); }, []);
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!dogs) return <LoadingState />;
  if (!dogs.length) return <EmptyState>You have no dogs yet. Add your first dog to get started.</EmptyState>;
  return <main><h1>Your dogs</h1><ul>{dogs.map((dog) => <li key={dog.id}>{dog.name} — {dog.profile_status.toLowerCase()}, {dog.availability_status.toLowerCase()}</li>)}</ul><Discover /></main>;
}
