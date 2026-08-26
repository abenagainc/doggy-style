// Final verify — handles XML entity escaping
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PizZip = require("/tmp/node_modules/pizzip");
const buf = readFileSync("/Users/abenagainc/Desktop/Doggy Style — Build Narrative.docx");
const zip = new PizZip(buf);
const xml = zip.file("word/document.xml").asText();
const runs = xml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
const full = runs.map((r) => r.replace(/<[^>]+>/g, "")).join("");

// Normalize XML entities (&amp; -> &)
const text = full.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const titles = [
  "1. UI Progress Snapshot",
  "2. Navigation Restructure",
  "3. Likes Exclusivity Model",
  "4. Thumbnail Overhaul",
  "5. Multi-Photo Gallery",
  "6. Messages — New vs Active",
  "7. Health Check & Code Refactor",
  "8. Scaling Foundations",
  "9. Repo Size & Structure",
  "10. Documentation Archive",
];
let allOk = true;
for (const t of titles) {
  const ok = text.includes(t);
  if (!ok) allOk = false;
  console.log(ok ? `OK: ${t}` : `MISSING: ${t}`);
}
console.log(`\ntotal text chars: ${text.length}`);
console.log(`all sections present: ${allOk}`);
console.log(`file size: ${(buf.length / 1024).toFixed(1)} KB`);
