import express from "express";
import multer from "multer";
import cors from "cors";
import * as XLSX from "xlsx";
import fs from "fs";

const app = express();

if (!fs.existsSync("server/uploads")) {
  fs.mkdirSync("server/uploads", { recursive: true });
}

app.use(cors({ origin: true }));
app.use(express.json());

const upload = multer({ dest: "server/uploads/" });

function normalizeUnit(unit) {
  return String(unit || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/^E0+/, "E")
    .replace(/^T0+/, "T")
    .replace(/^R0+/, "R")
    .replace(/^D0+/, "D")
    .replace(/^HM1$/, "HAZ1")
    .replace(/^HR01$/, "HR1");
}

function parseRowsByPosition(rows) {
  const people = [];
  let current = null;

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).toLowerCase().includes("name")) &&
    row.some((cell) => String(cell).toLowerCase().includes("rank"))
  );

  if (headerIndex === -1) {
    console.log("NO HEADER FOUND. First 10 rows:");
    console.log(JSON.stringify(rows.slice(0, 10), null, 2));
    return [];
  }

  const header = rows[headerIndex].map((h) =>
    String(h).trim().toLowerCase()
  );

  const col = (...names) =>
    header.findIndex((h) =>
      names.some((name) => h === name || h.includes(name))
    );

  const nameCol = col("name");
  const rankCol = col("rank");
  const shiftCol = col("shift");
  const unitCol = col("assignment", "unit");
  const kdCol = col("kelly", "kd");
  const credCol = col("credential letter", "credential", "cred");
  const descCol = col("credential description", "description");

  console.log("HEADER ROW:", rows[headerIndex]);
  console.log("COLUMN MAP:", {
    nameCol,
    rankCol,
    shiftCol,
    unitCol,
    kdCol,
    credCol,
    descCol,
  });

  rows.slice(headerIndex + 1).forEach((row) => {
    const name = nameCol >= 0 ? row[nameCol] : "";
    const rank = rankCol >= 0 ? row[rankCol] : "";
    const shift = shiftCol >= 0 ? row[shiftCol] : "";
    const unit = unitCol >= 0 ? row[unitCol] : "";
    const kd = kdCol >= 0 ? row[kdCol] : "";
    const cred = credCol >= 0 ? row[credCol] : "";
    const desc = descCol >= 0 ? row[descCol] : "";

    if (name && rank) {
      current = {
        name: String(name).trim(),
        rank: String(rank).trim(),
        shift: String(shift).trim().toUpperCase(),
        assignment: normalizeUnit(unit),
        kd: Number(kd) || null,
        credentials: [],
      };

      people.push(current);
    }

    if (current && cred) {
      current.credentials.push({
        code: String(cred).trim(),
        description: String(desc || "").trim(),
      });
    }
  });

  return people.filter((p) => p.name && p.assignment);
}

app.post("/api/roster/upload", upload.single("file"), (req, res) => {
  console.log("UPLOAD ROUTE HIT");

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    let people = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: true,
      });

      console.log("====================================");
      console.log("SHEET:", sheetName);
      console.log("TOTAL ROWS:", rows.length);

      rows.slice(0, 20).forEach((r, i) => {
        console.log(`ROW ${i}:`, r);
      });

      console.log("====================================");

      const parsed = parseRowsByPosition(rows);

      console.log(`PARSED FROM ${sheetName}:`, parsed.length);

      people = people.concat(parsed);
    });

    console.log("TOTAL PARSED PEOPLE:", people.length);

    fs.writeFileSync("server/roster.json", JSON.stringify(people, null, 2));

    return res.json({
      success: true,
      count: people.length,
      people,
    });
  } catch (err) {
    console.error("UPLOAD ERROR DETAIL:", err);

    return res.status(500).json({
      error: "Upload failed",
      detail: err.message,
    });
  }
});

app.get("/api/roster/current", (req, res) => {
  try {
    if (!fs.existsSync("server/roster.json")) {
      return res.json({ people: [], count: 0 });
    }

    const data = JSON.parse(fs.readFileSync("server/roster.json", "utf-8"));

    return res.json({
      people: data,
      count: data.length,
    });
  } catch (err) {
    console.error("READ ERROR:", err);

    return res.status(500).json({
      error: "Failed to load roster",
      detail: err.message,
    });
  }
});

app.get("/api/roster/debug", (req, res) => {
  try {
    const uploads = fs.existsSync("server/uploads")
      ? fs.readdirSync("server/uploads")
      : [];

    const hasRoster = fs.existsSync("server/roster.json");

    return res.json({
      uploads,
      hasRoster,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Debug failed",
      detail: err.message,
    });
  }
});

app.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});