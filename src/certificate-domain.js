export const CERTIFICATE_VERIFY_BASE = "https://qazeducation.kz/certificate";

export const CERTIFICATE_TYPES = {
  participant: {
    label: "Сертификат участника",
    shortLabel: "Участник",
    fileCode: "participant",
  },
  grant: {
    label: "Сертификат победителя образовательного гранта",
    shortLabel: "Образовательный грант",
    fileCode: "grant",
  },
  scholarship: {
    label: "Сертификат стипендиата",
    shortLabel: "Стипендия",
    fileCode: "scholarship",
  },
  top30: {
    label: "Сертификат финалиста Top-30",
    shortLabel: "Кадровый резерв Top-30",
    fileCode: "top30",
  },
};

export function certificateType(type) {
  return CERTIFICATE_TYPES[type] || {
    label: "Сертификат QazEducation",
    shortLabel: "Сертификат",
    fileCode: "certificate",
  };
}

export function certificateVerifyUrl(token) {
  return `${CERTIFICATE_VERIFY_BASE}/${encodeURIComponent(String(token || ""))}`;
}

export function certificateRecipient(certificate) {
  return [certificate?.recipient_first_name, certificate?.recipient_last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function certificateDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Almaty",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export function certificateYear(value) {
  if (!value) return new Date().getFullYear();
  try {
    return Number(
      new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Almaty",
        year: "numeric",
      }).format(new Date(value))
    );
  } catch {
    return new Date().getFullYear();
  }
}

export function certificateFilename(certificate, extension) {
  const type = certificateType(certificate?.certificate_type);
  const number = String(certificate?.certificate_number || "QazEducation")
    .replaceAll(/[^A-Za-z0-9-]+/g, "-")
    .replaceAll(/-+/g, "-");
  return `${number}-${type.fileCode}.${extension}`;
}
