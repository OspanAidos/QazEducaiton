import catalog from "./data/universities.json";

/** Справочник вузов для конкурсной заявки QazEducation. */
export function grantUniversityOptions() {
  return [...new Set(catalog.map((row) => row.univ).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
}

/** Уникальные немедицинские специальности выбранного университета. */
export function grantSpecialtyOptions(university) {
  if (!university) return [];

  return [
    ...new Set(
      catalog
        .filter((row) => row.univ === university)
        .map((row) => row.spec)
        .filter(Boolean)
        .filter((name) => !isMedicalSpecialty(name))
    ),
  ].sort((a, b) => a.localeCompare(b, "ru"));
}

function isMedicalSpecialty(name) {
  const normalized = String(name).toLowerCase();
  return [
    "медицин",
    "стоматолог",
    "фармац",
    "сестрин",
    "педиатр",
    "общественное здоровье",
    "ветеринар",
  ].some((keyword) => normalized.includes(keyword));
}
