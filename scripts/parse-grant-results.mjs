import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || path.resolve("src/data/grant-benchmarks-2026.json");
const profilePath = path.resolve("src/data/grant-program-profiles-2026.json");

if (!inputPath) {
  console.error("Usage: node scripts/parse-grant-results.mjs <pdftotext.txt> [output.json]");
  process.exit(1);
}

const UNIVERSITY_CODES = {
  "009": { short: "АУНГ", univ: "Атырауский университет нефти и газа имени Сафи Утебаева" },
  "010": { short: "АУ", univ: "Атырауский университет имени Халела Досмухамедова" },
  "011": { short: "ВКУ", univ: "Восточно-Казахстанский университет имени Сарсена Аманжолова" },
  "012": { short: "ВКТУ", univ: "Восточно-Казахстанский технический университет имени Д. Серикбаева" },
  "032": { short: "КТУ", univ: "Карагандинский технический университет имени Абылкаса Сагинова" },
  "036": { short: "КУ-Кост", univ: "Костанайский региональный университет имени Ахмет Байтұрсынұлы" },
  "042": { short: "УШ", univ: "Shakarim University" },
  "045": { short: "ЮКУ", univ: "Южно-Казахстанский университет имени М. Ауэзова" },
  "141": { short: "ABU", univ: "Alikhan Bokeikhan University" },
};

const text = fs.readFileSync(inputPath, "utf8");
const profiles = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const profileByCode = new Map(profiles.map((profile) => [profile.code, profile]));
const lines = text.split(/\r?\n/);
const scoresByKey = new Map();
const programNames = new Map();
const seenApplicants = new Set();

let currentProgram = null;
let currentUniversity = null;
let inGeneralCompetition = false;
let isFullLengthStudy = false;
let parsedRows = 0;

for (const rawLine of lines) {
  const line = rawLine.replace(/\f/g, "").trim();
  if (!line) continue;

  if (line.includes("КҮНДІЗГІ ТОЛЫҚ ОҚУ НЫСАНЫ")) {
    isFullLengthStudy = true;
    inGeneralCompetition = false;
    continue;
  }

  if (line.includes("КҮНДІЗГІ ҚЫСҚАРТЫЛҒАН ОҚУ НЫСАНЫ")) {
    isFullLengthStudy = false;
    inGeneralCompetition = false;
    continue;
  }

  const programMatch = line.match(/^(B(?:M)?\d{3})(?:\s*\([^)]*\))?\s*-\s*(.+)$/u);
  if (programMatch) {
    currentProgram = programMatch[1];
    currentUniversity = null;
    inGeneralCompetition = false;
    if (!programNames.has(currentProgram)) {
      programNames.set(currentProgram, programMatch[2].trim());
    }
    continue;
  }

  if (!currentProgram) continue;

  const universityMatch = line.match(/^(\d{3})\s*-\s*(.+)$/u);
  if (universityMatch) {
    currentUniversity = universityMatch[1];
    inGeneralCompetition = false;
    continue;
  }

  if (line === "ЖАЛПЫ КОНКУРС") {
    inGeneralCompetition = true;
    continue;
  }

  if (line.includes("АУЫЛ КВОТАСЫ")) {
    inGeneralCompetition = false;
    continue;
  }

  if (!isFullLengthStudy || !inGeneralCompetition) continue;

  const rowWithUniversity = line.match(/^\d+\s+(\d{9})\s+.*?\s+(\d{2,3})\s+(\d{3})$/u);
  const rowWithinUniversity = line.match(/^\d+\s+(\d{9})\s+.*?\s+(\d{2,3})$/u);

  let applicantCode;
  let score;
  let universityCode;

  if (rowWithUniversity) {
    [, applicantCode, score, universityCode] = rowWithUniversity;
  } else if (rowWithinUniversity && currentUniversity) {
    [, applicantCode, score] = rowWithinUniversity;
    universityCode = currentUniversity;
  } else {
    continue;
  }

  if (!UNIVERSITY_CODES[universityCode]) continue;

  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 140) continue;

  const applicantKey = `${currentProgram}:${universityCode}:${applicantCode}`;
  if (seenApplicants.has(applicantKey)) continue;
  seenApplicants.add(applicantKey);

  const key = `${currentProgram}:${universityCode}`;
  if (!scoresByKey.has(key)) scoresByKey.set(key, []);
  scoresByKey.get(key).push(numericScore);
  parsedRows += 1;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

const benchmarks = [...scoresByKey.entries()]
  .map(([key, scores]) => {
    const [programCode, universityCode] = key.split(":");
    const profile = profileByCode.get(programCode);
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      programCode,
      universityCode,
      min: sorted[0],
      p25: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      max: sorted.at(-1),
      count: sorted.length,
    };
  })
  .sort((a, b) =>
    a.programCode.localeCompare(b.programCode, "en") ||
    a.universityCode.localeCompare(b.universityCode, "en")
  );

const output = {
  meta: {
    academicYear: "2026–2027",
    studyForm: "full-time-full-length",
    competition: "general",
    quotaRowsExcluded: true,
    containsPersonalData: false,
    parsedWinnerRows: parsedRows,
    benchmarkRows: benchmarks.length,
    universityCount: new Set(benchmarks.map((row) => row.universityCode)).size,
    programCount: new Set(benchmarks.map((row) => row.programCode)).size,
    displayedRange: "p25-p75",
    sourceTitle: "2026–2027 оқу жылына арналған білім беру гранты иегерлерінің тізімі",
    generatedAt: new Date().toISOString(),
  },
  universities: UNIVERSITY_CODES,
  programs: Object.fromEntries(
    [...new Set(benchmarks.map((row) => row.programCode))]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((programCode) => {
        const profile = profileByCode.get(programCode);
        return [
          programCode,
          {
            nameRu: profile?.nameRu || programCode,
            nameKk: programNames.get(programCode) || programCode,
            subjectKeys: profile?.subjectKeys || [],
          },
        ];
      })
  ),
  benchmarks,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Parsed ${parsedRows} anonymized winner rows into ${benchmarks.length} benchmarks.`);
console.log(`Saved to ${outputPath}`);
