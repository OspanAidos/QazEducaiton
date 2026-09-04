export const STATUS_LABELS = {
  draft: "Черновик",
  awaiting_payment: "Ожидается оплата",
  ready_to_submit: "Готова к отправке",
  submitted: "Подана",
  tech_review: "На проверке",
  needs_fixes: "Нужно исправить",
  accepted: "Передана комиссии",
  evaluation: "Оценка комиссии",
  final: "Оценка комиссии",
  rejected: "Отклонена",
  result: "Результат опубликован",
  appeal: "Апелляция",
  contract: "Оформление поддержки",
};

export const DECISION_LABELS = {
  grant: "Образовательный грант",
  scholarship: "Стипендия",
  top30: "Top-30",
  reserve: "Резерв",
  not_selected: "Не прошёл",
};

export const DOC_LABELS = {
  identity: "Удостоверение личности",
  birth_certificate: "Свидетельство о рождении",
  guardian_identity: "Документ законного представителя",
  guardian_consent: "Согласие законного представителя",
  academic_record: "Сведения об успеваемости",
  performance: "Сведения об успеваемости",
  ent: "Сертификат ЕНТ",
  additional: "Иные документы",
  other: "Иные документы",
};

export const PERSONAL_DOC_KINDS = new Set([
  "identity",
  "birth_certificate",
  "guardian_identity",
  "guardian_consent",
]);

export const CATEGORY_LABELS = {
  grade_9: "Выпускник 9 класса",
  "Выпускник 9 класса": "Выпускник 9 класса",
  "9-сынып түлегі": "Выпускник 9 класса",
  grade_11: "Выпускник 11 класса",
  "Выпускник 11 класса": "Выпускник 11 класса",
  "11-сынып түлегі": "Выпускник 11 класса",
  college: "Учащийся колледжа",
  "Учащийся колледжа": "Учащийся колледжа",
  "Колледж студенті": "Учащийся колледжа",
  bachelor: "Студент университета",
  university: "Студент университета",
  "Студент бакалавриата": "Студент университета",
  "Бакалавриат студенті": "Студент университета",
};

export const SUPPORT_LABELS = {
  grant: "Образовательный грант",
  scholarship: "Стипендия",
};

export const SCOPE_LABELS = {
  kz_citizen: "Гражданин Республики Казахстан",
  foreign: "Иностранный участник",
};

export const PAYMENT_STATUS_LABELS = {
  pending: "Ожидается подтверждение",
  paid: "Оплачено",
  cancelled: "Отменено",
  refunded: "Возвращено",
  partially_refunded: "Частично возвращено",
};

export const DOCUMENT_REVIEW_LABELS = {
  pending: "Не проверен",
  accepted: "Документ принят",
  replacement_required: "Требуется замена",
};

export const WORKFLOW_FILTERS = [
  { key: "submitted", label: "Поданные" },
  { key: "drafts", label: "Черновики" },
  { key: "awaiting_payment", label: "Ожидают оплату" },
  { key: "needs_fixes", label: "На доработке" },
  { key: "evaluation", label: "Переданы комиссии" },
  { key: "appeal", label: "Апелляции" },
  { key: "rejected", label: "Отклонённые" },
  { key: "completed", label: "Завершённые" },
  { key: "all", label: "Все записи" },
];

export const EXPORT_DATA_FIELDS = [
  { key: "birth", label: "Дата рождения", format: formatDateOnly },
  { key: "category", label: "Категория", format: categoryLabelFromValue },
  {
    key: "participant_scope",
    label: "Статус участника",
    format: (value) => SCOPE_LABELS[value] ?? value,
  },
  { key: "citizenship_country", label: "Гражданство" },
  {
    key: "support_type",
    label: "Вид поддержки",
    format: (value) => SUPPORT_LABELS[value] ?? value,
  },
  { key: "university", label: "Университет" },
  { key: "specialty", label: "Специальность" },
];

export function formatDate(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export function formatDateOnly(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Размер не указан";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function categoryLabelFromValue(value) {
  if (!value) return "Не указана";
  return CATEGORY_LABELS[value] ?? String(value);
}

export function categoryLabel(row) {
  return categoryLabelFromValue(row?.data?.category || row?.profile?.category);
}

export function supportLabel(row) {
  const value = row?.data?.support_type;
  return value ? SUPPORT_LABELS[value] ?? String(value) : "Не выбран";
}

export function participantScopeLabel(row) {
  const value = row?.data?.participant_scope;
  return value ? SCOPE_LABELS[value] ?? String(value) : "Не указан";
}

export function applicationAge(row) {
  const raw = row?.data?.birth;
  if (!raw) return null;

  const birth = new Date(`${raw}T00:00:00`);
  const reference = new Date(row?.submitted_at || Date.now());
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  let age = reference.getFullYear() - birth.getFullYear();
  const month = reference.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && reference.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function competitionPayment(row) {
  const payments = (row?.payments ?? [])
    .filter((item) => item.payment_type === "competition_fee")
    .sort(
      (a, b) =>
        new Date(b.paid_at || b.updated_at || b.created_at || 0).getTime() -
        new Date(a.paid_at || a.updated_at || a.created_at || 0).getTime()
    );

  return payments.find((item) => confirmedCompetitionPayment(item, row?.payments ?? [])) || payments[0] || null;
}

function confirmedCompetitionPayment(payment, payments) {
  const eligible = p => p?.status === "paid" && !p.is_sandbox && Number(p.refunded_tenge || 0) === 0;
  return eligible(payment) && (Number(payment.amount_tenge) === 10000 ||
    (Number(payment.amount_tenge) === 7000 && payments.some(credit =>
      credit.id === payment.credit_payment_id && credit.user_id === payment.user_id &&
      credit.payment_type === "university_match" && Number(credit.amount_tenge) === 3000 && eligible(credit))));
}

export function isCompetitionPaid(row) {
  return confirmedCompetitionPayment(competitionPayment(row), row?.payments ?? []);
}

export function paymentLabel(row, withAmount = true) {
  const payment = competitionPayment(row);
  if (!payment) return "Не подтверждено";

  const label = PAYMENT_STATUS_LABELS[payment.status] ?? payment.status;
  if (payment.status === "paid" && !isCompetitionPaid(row)) return "Требуется сверка";
  return payment.status === "paid" && withAmount ? `${label} · ${Number(payment.amount_tenge).toLocaleString("ru-RU")} ₸${payment.credit_payment_id ? " + 3 000 ₸ зачтено" : ""}` : label;
}

export function requiredDocumentGroups(row) {
  const age = applicationAge(row);
  const identityGroups =
    age !== null && age < 18
      ? [
          {
            key: "birth_certificate",
            label: DOC_LABELS.birth_certificate,
            kinds: ["birth_certificate"],
          },
          {
            key: "guardian_identity",
            label: DOC_LABELS.guardian_identity,
            kinds: ["guardian_identity"],
          },
          {
            key: "guardian_consent",
            label: DOC_LABELS.guardian_consent,
            kinds: ["guardian_consent"],
          },
        ]
      : [
          {
            key: "identity",
            label: DOC_LABELS.identity,
            kinds: ["identity"],
          },
        ];

  return [
    ...identityGroups,
    {
      key: "academic",
      label: DOC_LABELS.academic_record,
      kinds: ["performance", "academic_record"],
    },
  ];
}

export function documentReview(row, documentId) {
  return (row?.documentReviews ?? []).find(
    (item) => item.document_id === documentId
  );
}

export function requiredDocumentState(row) {
  const documents = row?.documents ?? [];
  const groups = requiredDocumentGroups(row);
  const items = groups.map((group) => {
    const docs = documents.filter((doc) => group.kinds.includes(doc.kind));
    const accepted = docs.some(
      (doc) => documentReview(row, doc.id)?.status === "accepted"
    );

    return { ...group, documents: docs, present: docs.length > 0, accepted };
  });

  return {
    items,
    total: items.length,
    present: items.filter((item) => item.present).length,
    accepted: items.filter((item) => item.accepted).length,
    allPresent: items.every((item) => item.present),
    allAccepted: items.every((item) => item.accepted),
  };
}

export function consentState(row) {
  const registrationRecorded = Boolean(
    row?.profile?.privacy_accepted_at && row?.profile?.terms_accepted_at
  );
  const applicationChecks =
    row?.data?.consent_data === true && row?.data?.consent_terms === true;
  const applicationRecorded = Boolean(row?.terms_accepted_at);

  return {
    registrationRecorded,
    applicationChecks,
    applicationRecorded,
    complete:
      registrationRecorded && applicationChecks && applicationRecorded,
  };
}

export function applicationProgress(row) {
  if (row?.submitted_at && !["draft", "awaiting_payment", "ready_to_submit"].includes(row.status)) {
    return 100;
  }

  const data = row?.data ?? {};
  const scopeComplete =
    data.participant_scope === "kz_citizen" ||
    (data.participant_scope === "foreign" && Boolean(data.citizenship_country));
  const supportComplete =
    data.support_type === "scholarship" ||
    (data.support_type === "grant" && Boolean(data.university) && Boolean(data.specialty));
  const documents = requiredDocumentState(row);

  const checks = [
    Boolean(data.birth),
    Boolean(data.category),
    scopeComplete,
    supportComplete,
    Boolean(String(data.motivation || "").trim()),
    data.consent_data === true,
    data.consent_terms === true,
    documents.allPresent,
  ];
  const completed = checks.filter(Boolean).length;
  return Math.min(95, Math.round((completed / checks.length) * 95));
}

export function workflowBucket(row) {
  if (row?.status === "appeal") return "appeal";
  if (["result", "contract"].includes(row?.status)) return "completed";
  if (row?.status === "rejected") return "rejected";
  if (["accepted", "evaluation", "final"].includes(row?.status)) return "evaluation";
  if (row?.status === "needs_fixes") return "needs_fixes";

  if (!isCompetitionPaid(row)) {
    return row?.status === "awaiting_payment" || applicationProgress(row) >= 70
      ? "awaiting_payment"
      : "drafts";
  }

  if (row?.submitted_at && ["submitted", "tech_review"].includes(row?.status)) {
    return "submitted";
  }

  return "drafts";
}

export function commissionReadiness(row) {
  const documents = requiredDocumentState(row);
  const consents = consentState(row);
  const reasons = [];

  if (!row?.submitted_at) reasons.push("заявка не отправлена участником");
  if (!isCompetitionPaid(row)) reasons.push("оплата 10 000 ₸ не подтверждена");
  if (!row?.data?.support_type) reasons.push("не выбран вид поддержки");
  if (!documents.allPresent) reasons.push("загружены не все обязательные документы");
  if (!documents.allAccepted) reasons.push("не все обязательные документы проверены");
  if (!consents.complete) reasons.push("согласия не зафиксированы полностью");

  return { ready: reasons.length === 0, reasons, documents, consents };
}

export function documentCompletenessLabel(row) {
  const state = requiredDocumentState(row);
  return `${state.present}/${state.total} загружено · ${state.accepted}/${state.total} проверено`;
}

export function humanDataValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  const definition = EXPORT_DATA_FIELDS.find((item) => item.key === key);
  if (definition?.format) return definition.format(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
