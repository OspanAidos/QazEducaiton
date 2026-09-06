export const SITE_STATUSES = [
  ["draft", "Регистрация / черновик"],
  ["awaiting_payment", "Ожидается оплата"],
  ["ready_to_submit", "Оплачено, готово к подаче"],
  ["submitted", "Подана заявка · тип ещё не выбран"],
  ["submitted:grant", "Подана заявка на грант"],
  ["submitted:scholarship", "Подана заявка на стипендию"],
  ["tech_review", "Техническая проверка"],
  ["needs_fixes", "Требуются исправления"],
  ["accepted", "Допущена"],
  ["evaluation", "Оценка комиссии"],
  ["final", "Финал"],
  ["result", "Результат опубликован · общий"],
  ["result:grant", "Результат · выиграл грант"],
  ["result:scholarship", "Результат · выиграл стипендию"],
  ["result:top30", "Результат · Top-30"],
  ["result:reserve", "Результат · резерв"],
  ["result:not_selected", "Результат · не отобран"],
  ["appeal", "Апелляция"],
  ["contract", "Договор"],
  ["rejected", "Отклонена"],
];

export const LEAD_FIELD_DEFINITIONS = [
  ["application_uuid", "QazEducation: UUID заявки", "text"],
  ["application_number", "QazEducation: номер заявки", "text"],
  ["site_status", "QazEducation: статус на сайте", "text"],
  ["progress", "QazEducation: заполнение, %", "numeric"],
  ["package", "QazEducation: пакет", "text"],
  ["payment_status", "QazEducation: оплата", "text"],
  ["category", "QazEducation: категория", "text"],
  ["support_type", "QazEducation: вид поддержки", "text"],
  ["university", "QazEducation: вуз", "text"],
  ["specialty", "QazEducation: специальность", "text"],
  ["site_link", "QazEducation: ссылка на заявку", "url"],
];

export const CONTACT_FIELD_DEFINITIONS = [
  ["application_uuid", "QazEducation: UUID заявки", "text"],
];

// Утверждённая маршрутизация QazEducation. Администратор не может менять её
// из браузера: это часть серверной бизнес-логики, а не пользовательская настройка.
export const FIXED_STATUS_TARGETS = {
  draft: "ЧЕРНОВИК",
  awaiting_payment: "ОЖИДАЕТ ОПЛАТУ",
  ready_to_submit: "НОВАЯ ЗАЯВКА",
  submitted: "НОВАЯ ЗАЯВКА",
  "submitted:grant": "ПОДАНА ЗАЯВКА НА ГРАНТ",
  "submitted:scholarship": "ПОДАНА ЗАЯВКА СТИПЕНДИЯ",
  tech_review: "ТЕХНИЧЕСКИЙ ОТБОР",
  needs_fixes: "НУЖНО ИСПРАВИТЬ",
  accepted: "ТЕХНИЧЕСКИЙ ОТБОР",
  evaluation: "ПЕРЕДАНА КОМИССИИ",
  final: "ФИНАЛИСТЫ",
  result: "РЕЗУЛЬТАТ ОПУБЛИКОВАН",
  "result:grant": "ВЫИГРАЛИ ГРАНТ",
  "result:scholarship": "ВЫИГРАЛИ СТИПЕНДИЮ",
  "result:top30": "ТОП-30 КАДРОВЫЙ РЕЗЕРВ",
  "result:reserve": "РЕЗУЛЬТАТ ОПУБЛИКОВАН",
  "result:not_selected": "РЕЗУЛЬТАТ ОПУБЛИКОВАН",
  appeal: "АПЕЛЛЯЦИЯ",
  rejected: "ОТКЛОНЕНА",
};

export function isSyncEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export function normalizeBaseUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (parsed.protocol !== "https:") throw new Error("AMO_BASE_URL must use https");
  if (!/\.amocrm\.(ru|com)$/i.test(parsed.hostname)) {
    throw new Error("AMO_BASE_URL must be an amoCRM account domain");
  }
  return `${parsed.protocol}//${parsed.hostname}`;
}

export function fieldValue(customFields, fieldId) {
  const field = (customFields || []).find((item) => Number(item.field_id) === Number(fieldId));
  return field?.values?.[0]?.value ?? null;
}

export function findExactByApplicationUuid(items, fieldId, applicationId) {
  return (items || []).filter(
    (item) => String(fieldValue(item.custom_fields_values, fieldId) || "") === String(applicationId)
  );
}

export function customFieldValues(fieldIds, values) {
  return Object.entries(values)
    .filter(([key, value]) => fieldIds?.[key] && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      field_id: Number(fieldIds[key]),
      values: [{ value }],
    }));
}

export function paymentSummary(payments = []) {
  const paidCompetition = payments.some(
    (item) => item.payment_type === "competition_fee" && item.status === "paid"
  );
  const paidMatch = payments.some(
    (item) => item.payment_type === "university_match" && item.status === "paid"
  );
  const pendingCompetition = payments.some(
    (item) => item.payment_type === "competition_fee" && item.status === "pending"
  );
  const pendingMatch = payments.some(
    (item) => item.payment_type === "university_match" && item.status === "pending"
  );

  if (paidCompetition) {
    return { package: "Участие в конкурсе + профориентация · 10 000 ₸", status: "Оплачено 10 000 ₸" };
  }
  if (paidMatch) {
    return { package: "Только профориентация · 3 000 ₸", status: "Оплачено 3 000 ₸" };
  }
  if (pendingCompetition) {
    return { package: "Участие в конкурсе + профориентация · 10 000 ₸", status: "Ожидается 10 000 ₸" };
  }
  if (pendingMatch) {
    return { package: "Только профориентация · 3 000 ₸", status: "Ожидается 3 000 ₸" };
  }
  return { package: "Не выбран", status: "Нет оплаты" };
}

export function statusMapKey(application) {
  const status = String(application?.status || "draft");
  const supportType = String(application?.data?.support_type || "");
  const decision = String(application?.decision || "");
  if (status === "submitted" && ["grant", "scholarship"].includes(supportType)) {
    return `${status}:${supportType}`;
  }
  if (status === "result" && decision) return `${status}:${decision}`;
  return status;
}

export function buildLeadPayload(snapshot, config, currentLeadId = null) {
  const { application, profile, payments } = snapshot;
  const data = application.data || {};
  const payment = paymentSummary(payments);
  const mappedStatus =
    config.status_map?.[statusMapKey(application)] ||
    config.status_map?.[application.status];
  const statusId = mappedStatus || (!currentLeadId ? config.default_status_id : null);
  const siteOrigin = String(config.site_origin || "https://qazeducation.kz").replace(/\/$/, "");

  const payload = {
    name: `${application.number || "Заявка"} · ${profile.last_name || ""} ${profile.first_name || ""}`.trim(),
    pipeline_id: Number(config.pipeline_id),
    custom_fields_values: customFieldValues(config.lead_fields, {
      application_uuid: application.id,
      application_number: application.number,
      site_status: application.status,
      progress: Number(application.progress || 0),
      package: payment.package,
      payment_status: payment.status,
      category: data.category || profile.category,
      support_type: data.support_type,
      university: data.university,
      specialty: data.specialty,
      site_link: `${siteOrigin}/admin?application=${application.id}`,
    }),
  };

  if (statusId) payload.status_id = Number(statusId);
  return payload;
}

export function buildContactPayload(snapshot, config) {
  const { application, profile, email } = snapshot;
  const fields = customFieldValues(config.contact_fields, {
    application_uuid: application.id,
  });

  if (profile.phone && config.phone_field_id) {
    fields.push({ field_id: Number(config.phone_field_id), values: [{ value: profile.phone, enum_code: "WORK" }] });
  }
  if (email && config.email_field_id) {
    fields.push({ field_id: Number(config.email_field_id), values: [{ value: email, enum_code: "WORK" }] });
  }

  return {
    name: `${profile.last_name || ""} ${profile.first_name || ""}`.trim() || application.number,
    custom_fields_values: fields,
  };
}

export function suggestedStatusMap(statuses) {
  return fixedStatusMap(statuses).mapping;
}

export function fixedStatusMap(statuses) {
  const normalized = new Map(
    (statuses || []).map((item) => [String(item.name || "").trim().toUpperCase(), Number(item.id)])
  );
  const mapping = {};
  const missing = [];
  for (const [siteStatus, targetName] of Object.entries(FIXED_STATUS_TARGETS)) {
    const statusId = normalized.get(targetName);
    if (statusId) mapping[siteStatus] = statusId;
    else if (!missing.includes(targetName)) missing.push(targetName);
  }
  return { mapping, missing };
}
