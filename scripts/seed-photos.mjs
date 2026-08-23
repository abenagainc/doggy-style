import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });
if (authError || !auth.session) { console.error("auth failed"); process.exit(1); }

const masterBreeds = await fetch("https://dog.ceo/api/breeds/list/all").then((r) => r.json());
const breedList = Object.keys(masterBreeds.message);

const { data: dogs } = await supabase.from("dogs").select("id,name").eq("owner_id", auth.user.id).order("created_at");
console.log(`seeding photos for ${dogs.length} dogs…`);

let ok = 0; let failed = 0;
for (let i = 0; i < dogs.length; i++) {
  const dog = dogs[i];
  try {
    const breed = breedList[Math.floor(Math.random() * breedList.length)];
    const sub = masterBreeds.message[breed];
    const path = Array.isArray(sub) && sub.length ? `${breed}/${sub[Math.floor(Math.random() * sub.length)]}` : breed;
    const photoRes = await fetch(`https://dog.ceo/api/breed/${path}/images/random`).then((r) => r.json());
    if (photoRes.status !== "success") throw new Error("no photo url");
    const image = await fetch(photoRes.message);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const ext = photoRes.message.split(".").pop()?.split("?")[0] ?? "jpg";
    const storagePath = `${auth.user.id}/${dog.id}/seed-photo.${ext === "jpg" ? "jpg" : ext}`;
    const { error: upErr } = await supabase.storage.from("dog-photos").upload(storagePath, bytes, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
    if (upErr) throw new Error("upload: " + upErr.message);
    // dog_photos has unique(storage_path); use distinct names per attempt
    const { error: rowErr } = await supabase.from("dog_photos").insert({ dog_id: dog.id, storage_path: storagePath });
    if (rowErr && rowErr.code !== "23505") throw new Error("row: " + rowErr.message);
    ok++;
    console.log(`${dog.name}: ✓`);
  } catch (err) {
    failed++;
    console.error(`${dog.name}: ${err.message}`);
  }
}

// Profile statuses refresh automatically via trigger. Report:
const { data: final } = await supabase.from("dogs").select("name,profile_status,availability_status").eq("owner_id", auth.user.id);
const complete = final.filter((d) => d.profile_status === "COMPLETE");
console.log(`\nPhotos: ${ok} succeeded, ${failed} failed`);
console.log(`Profiles complete: ${complete.length}/20, available: ${final.filter((d) => d.availability_status === "AVAILABLE").length}/20`);
