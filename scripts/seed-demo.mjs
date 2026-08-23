import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const EMAIL = "seed@doggy-style.test";
const PASSWORD = "SeedAccount#2026";

const NAMES = ["Max", "Luna", "Charlie", "Bella", "Cooper", "Daisy", "Milo", "Lucy", "Rocky", "Bailey", "Buddy", "Sadie", "Zeus", "Molly", "Bear", "Rosie", "Duke", "Chloe", "Tucker", "Penny"];
const BREEDS = ["Whippet", "Saluki", "Greyhound", "Golden Retriever", "Border Collie", "Labrador", "Poodle", "Beagle", "Shiba Inu", "Australian Shepherd"];
const CITIES = [[30.044, 31.235], [41.008, 28.978], [48.856, 2.352], [51.507, -0.127], [40.712, -74.006], [35.676, 139.65], [52.52, 13.405], [37.983, 23.727]];

// --- 1. Sign up or sign in ---
let { data: authData, error: signUpError } = await supabase.auth.signUp({
  email: EMAIL, password: PASSWORD,
  options: { data: { displayName: "Demo Kennels", signupConsent: { termsVersion: "2026-08-01", privacyNoticeVersion: "2026-08-01", locale: "en", termsHash: "2026-08-01", privacyNoticeHash: "2026-08-01" } } },
});
if (signUpError || !authData.session) {
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError) { console.error("AUTH FAILED:", signUpError?.message ?? "", signInError?.message ?? ""); process.exit(1); }
  authData = signIn;
}
console.log("signed in:", authData.user.id);
const ownerId = authData.user.id;

// --- 2. Fetch a stack of random dog photo URLs ---
const masterBreeds = await fetch("https://dog.ceo/api/breeds/list/all").then((r) => r.json());
const breedList = Object.keys(masterBreeds.message);
const photoUrls = [];
for (let i = 0; i < 20; i++) {
  const breed = breedList[Math.floor(Math.random() * breedList.length)];
  const sub = masterBreeds.message[breed];
  const path = Array.isArray(sub) && sub.length ? `${breed}/${sub[Math.floor(Math.random() * sub.length)]}` : breed;
  const res = await fetch(`https://dog.ceo/api/breed/${path}/images/random`).then((r) => r.json());
  if (res.status === "success") photoUrls.push({ url: res.message, label: path.split("/")[0] });
}
console.log("photo urls ready:", photoUrls.length);

// --- 3. Create 20 dogs with data + photo ---
let created = 0;
for (let i = 0; i < 20; i++) {
  const name = NAMES[i];
  const sex = i % 2 === 0 ? "MALE" : "FEMALE";
  const ageYears = 2 + Math.floor(Math.random() * 6);
  const dob = new Date(Date.now() - ageYears * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const breed = BREEDS[i % BREEDS.length];
  const city = CITIES[i % CITIES.length];

  const { data: dog, error } = await supabase.from("dogs").insert({
    owner_id: ownerId, name, sex, date_of_birth: dob, breed,
    location: `${city[0]},${city[1]}`, breeding_enabled: true,
  }).select().single();
  if (error) { console.error(`dog ${name}:`, error.message); continue; }

  // Photo
  try {
    const image = await fetch(photoUrls[i].url);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const ext = photoUrls[i].url.split(".").pop()?.split("?")[0] ?? "jpg";
    const storagePath = `${ownerId}/${dog.id}/seed-${i}.${ext}`;
    const { error: upErr } = await supabase.storage.from("dog-photos").upload(storagePath, bytes, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}` });
    if (!upErr) {
      const { error: phErr } = await supabase.from("dog_photos").insert({ dog_id: dog.id, storage_path: storagePath });
      if (phErr) console.error(`photo row ${name}:`, phErr.message);
    } else console.error(`photo upload ${name}:`, upErr.message);
  } catch (err) { console.error(`photo fetch ${name}:`, err.message); }

  // Availability (profile should be COMPLETE now: photo + location + breeding)
  await supabase.from("dogs").update({ availability_status: "AVAILABLE" }).eq("id", dog.id);
  created++;
  console.log(`created ${name} (${breed}, ${sex}, ${ageYears}y) ✓`);
}

// --- 4. Set active dog ---
const { data: dogs } = await supabase.from("dogs").select("id").eq("owner_id", ownerId).limit(1);
if (dogs?.[0]) await supabase.from("owners").update({ active_dog_id: dogs[0].id }).eq("id", ownerId);

console.log(`\nDone: ${created}/20 dogs. Login: ${EMAIL} / ${PASSWORD}`);
console.log("NOTE: flip verification_status to APPROVED for this owner in Supabase Table Editor so its dogs appear in discovery.");
