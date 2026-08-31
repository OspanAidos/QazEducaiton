/**
 * Подбор по обезличенным итогам конкурса образовательных грантов 2026–2027.
 * В расчёт входят только общий конкурс, очная полная форма и группы минимум
 * с тремя наблюдениями. Квотные строки и персональные данные не используются.
 */
import officialResults from "./data/grant-benchmarks-2026.json";

const SUBJECT_LABELS = {
  bio_geo: { ru: "Биология - География", kk: "Биология - География" },
  bio_chem: { ru: "Биология - Химия", kk: "Биология - Химия" },
  world_geo: { ru: "Вс. история - География", kk: "Дүн. тарихы - География" },
  world_law: { ru: "Вс. история - Основы права", kk: "Дүн. тарихы - Құқық негіздері" },
  geo_foreign: { ru: "География - Ин. язык", kk: "География - Шет тілі" },
  foreign_world: { ru: "Ин. язык - Вс. история", kk: "Шет тілі - Дүн. тарихы" },
  kaz_lang_lit: { ru: "Каз. язык - Каз. литература", kk: "Қаз. тілі - Қаз. әдебиеті" },
  rus_lang_lit: { ru: "Рус. язык - Рус. литература", kk: "Орыс тілі - Орыс әдебиеті" },
  math_geo: { ru: "Математика - География", kk: "Математика - География" },
  math_info: { ru: "Математика - Информатика", kk: "Математика - Информатика" },
  math_physics: { ru: "Математика - Физика", kk: "Математика - Физика" },
  chemistry_physics: { ru: "Химия - Физика", kk: "Химия - Физика" },
};

/** Положение пользовательского балла относительно справочного диапазона. */
function benchmark(score, lo, hi) {
  const top = hi ?? lo;
  if (score >= top) {
    return { bucket: "safe", distance: score - top };
  }
  if (score >= lo) {
    return { bucket: "real", distance: 0 };
  }
  return { bucket: "reach", distance: lo - score };
}

/**
 * Основной подбор.
 * @param {number} score - балл ЕНТ
 * @param {string} subjects - профильная пара
 * @returns {{best, groups}} лучший результат и корзины
 */
export function matchUniversities(score, subjectKey, lang = "ru") {
  const scored = officialResults.benchmarks
    .filter(
      (row) =>
        row.count >= 3 &&
        officialResults.programs[row.programCode]?.subjectKeys.includes(subjectKey)
    )
    .map((row) => {
      const program = officialResults.programs[row.programCode];
      const university = officialResults.universities[row.universityCode];
      const comparison = benchmark(score, row.p25, row.p75);
      return {
        ...row,
        ...university,
        spec: lang === "kk" ? program.nameKk : program.nameRu,
        grantLo: row.p25,
        grantHi: row.p75,
        ...comparison,
        reference: row.p25 === row.p75 ? `${row.p25}` : `${row.p25}–${row.p75}`,
      };
    });

  const strongestFirst = (a, b) =>
    (b.grantHi ?? b.grantLo) - (a.grantHi ?? a.grantLo) ||
    b.grantLo - a.grantLo;
  const closestFirst = (a, b) =>
    a.distance - b.distance || strongestFirst(a, b);

  const LIMIT = 8; // не заваливаем пользователя — максимум 8 карточек на корзину
  const groups = {
    safe: scored.filter((r) => r.bucket === "safe").sort(strongestFirst).slice(0, LIMIT),
    real: scored.filter((r) => r.bucket === "real").sort(strongestFirst).slice(0, LIMIT),
    reach: scored.filter((r) => r.bucket === "reach").sort(closestFirst).slice(0, LIMIT),
  };

  // «Лучшее совпадение» — самый сильный ориентир, который уже достигнут;
  // затем вариант внутри диапазона; иначе ближайший недостигнутый ориентир.
  const best =
    groups.safe[0] ??
    groups.real[0] ??
    groups.reach[0] ??
    null;

  return { best, groups, total: scored.length };
}

/** Список профильных пар для выпадающего меню — из самих данных.
 *  Длинные тире заменяем на дефис для единого стиля интерфейса. */
export function subjectOptions(lang = "ru") {
  const availablePrograms = new Set(
    officialResults.benchmarks
      .filter((row) => row.count >= 3)
      .map((row) => row.programCode)
  );
  const available = new Set(
    [...availablePrograms].flatMap(
      (programCode) => officialResults.programs[programCode]?.subjectKeys || []
    )
  );

  return [...available]
    .map((key) => ({ key, label: SUBJECT_LABELS[key]?.[lang] || key }))
    .sort((a, b) => a.label.localeCompare(b.label, lang === "kk" ? "kk" : "ru"));
}
