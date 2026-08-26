// Export the Doggy Style chat session to a Word document on the Desktop.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let docx;
try { docx = require("docx"); }
catch {
  console.error("installing docx...");
  execSync("cd /tmp && npm init -y >/dev/null 2>&1 && npm install docx --silent", { stdio: "inherit" });
  docx = require("/tmp/node_modules/docx");
}
const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = docx;

const SESSION = "20260823_170334_ab7dab";
const rows = execSync(
  `sqlite3 -json ~/.hermes/state.db "select role, content, timestamp from messages where session_id='${SESSION}' and role in ('user','assistant') and content is not null and length(content) > 0 order by id;"`,
  { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
);
const msgs = JSON.parse(rows);
console.log(`exporting ${msgs.length} messages`);

function mdToRuns(text) {
  // Minimal markdown handling: headings (#), bold **x**, code blocks ```
  const runs = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("```")) { runs.push(new Paragraph({ children: [new TextRun({ text: line, font: "Courier New", size: 18 })] })); continue; }
    if (/^#{1,3} /.test(line)) {
      runs.push(new Paragraph({ text: line.replace(/^#+ /, ""), heading: line.startsWith("# ") ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 }));
      continue;
    }
    // inline **bold** splitting
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    const trs = parts.map((p) =>
      p.startsWith("**") && p.endsWith("**")
        ? new TextRun({ text: p.slice(2, -2), bold: true })
        : new TextRun(p),
    );
    runs.push(new Paragraph({ children: trs.length ? trs : [new TextRun("")] }));
  }
  return runs;
}

const children = [
  new Paragraph({ text: "Doggy Style — Project Chat History", heading: HeadingLevel.TITLE }),
  new Paragraph({
    children: [new TextRun({ text: `Session 20260823–20260826 · ${msgs.length} messages · exported ${new Date().toISOString().slice(0, 10)}`, italics: true, color: "666666" })],
  }),
];

for (const m of msgs) {
  const ts = new Date(m.timestamp * 1000).toLocaleString();
  children.push(new Paragraph({
    children: [new TextRun({ text: `${m.role === "user" ? "👤 You" : "🤖 Hermes"} — ${ts}`, bold: true, color: m.role === "user" ? "1c1c1e" : "4a6da7" })],
    spacing: { before: 300 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" } },
  }));
  children.push(...mdToRuns(m.content));
}

const doc = new Document({ sections: [{ children }] });
Packer.toBuffer(doc).then((buf) => {
  const out = "/Users/abenagainc/Desktop/Doggy Style — Chat History.docx";
  writeFileSync(out, buf);
  console.log("written:", out);
});
