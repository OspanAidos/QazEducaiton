import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { useAuth } from "../auth-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { Section } from "../components/page-blocks.jsx";
import { Logo } from "../components/ui.jsx";
import CompetitionResultsPanel from "../components/CompetitionResultsPanel.jsx";
import AppealsPanel from "../components/AppealsPanel.jsx";
import {
  DECISION_LABELS,
  DOC_LABELS,
  DOCUMENT_REVIEW_LABELS,
  PAYMENT_STATUS_LABELS,
  PERSONAL_DOC_KINDS,
  STATUS_LABELS,
  WORKFLOW_FILTERS,
  applicationAge,
  applicationProgress,
  categoryLabel,
  commissionReadiness,
  competitionPayment,
  consentState,
  documentCompletenessLabel,
  documentReview,
  formatDate,
  formatDateOnly,
  formatFileSize,
  isCompetitionPaid,
  participantScopeLabel,
  paymentLabel,
  requiredDocumentState,
  supportLabel,
  workflowBucket,
} from "../admin-domain.js";


const COMMISSION_CRITERIA = {
  grant: [
    { key: "academic", label: "Академическая успеваемость", max: 25 },
    { key: "motivation", label: "Мотивация и образовательные цели", max: 30 },
    { key: "achievements", label: "Личные достижения", max: 20 },
    { key: "social_activity", label: "Социальная активность и лидерство", max: 10 },
    { key: "social_need", label: "Социальное положение и потребность в поддержке", max: 15 },
  ],
  scholarship: [
    { key: "social_need", label: "Социальное положение и потребность в поддержке", max: 30 },
    { key: "academic", label: "Академическая успеваемость", max: 20 },
    { key: "motivation", label: "Мотивация", max: 25 },
    { key: "social_activity", label: "Социальная активность", max: 15 },
    { key: "achievements", label: "Личные достижения", max: 10 },
  ],
};

function commissionCriteriaFor(row) {
  return COMMISSION_CRITERIA[row?.data?.support_type] ?? [];
}

function hasCompleteCriteria(item, supportType) {
  const criteria = COMMISSION_CRITERIA[supportType] ?? [];
  if (!criteria.length) return false;

  return criteria.every((criterion) => {
    const value = Number(item.criteria_scores?.[criterion.key]);
    return Number.isFinite(value) && value >= 0 && value <= criterion.max;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function commissionSummary(row, expectedCount = 0) {
  const supportType = row?.data?.support_type;
  const scores = (row.commissionScores ?? []).filter(
    (item) =>
      item.reviewer_active !== false &&
      hasCompleteCriteria(item, supportType)
  );

  if (!scores.length) {
    return {
      average: null,
      count: 0,
      expected: expectedCount,
      complete: false,
    };
  }

  const average =
    scores.reduce((sum, item) => sum + Number(item.score || 0), 0) /
    scores.length;

  return {
    average: Math.round(average * 100) / 100,
    count: scores.length,
    expected: expectedCount,
    complete: expectedCount > 0 && scores.length >= expectedCount,
  };
}

function criterionAverage(row, key) {
  const supportType = row?.data?.support_type;
  const values = (row.commissionScores ?? [])
    .filter(
      (item) =>
        item.reviewer_active !== false &&
        hasCompleteCriteria(item, supportType)
    )
    .map((item) => Number(item.criteria_scores?.[key]))
    .filter(Number.isFinite);

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function Admin() {
  const { signOut } = useAuth();
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("submitted");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supportFilter, setSupportFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [activeCommissionCount, setActiveCommissionCount] = useState(0);
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState("");
  const [documentModal, setDocumentModal] = useState(null);
  const [documentComment, setDocumentComment] = useState("");

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadRows = async () => {
    setLoading(true);
    setError("");

    const [
      applicationsRes,
      profilesRes,
      documentsRes,
      paymentsRes,
      commissionScoresRes,
      commissionMembersRes,
      notificationsRes,
      documentReviewsRes,
      adminHistoryRes,
      paymentHistoryRes,
      legacyApplicationsRes,
    ] = await Promise.all([
        supabase
          .from("applications")
          .select(
            "id,user_id,number,status,progress,deadline,data,submitted_at,decision,result_published_at,appeal_deadline,terms_accepted_at,terms_version,admin_status_comment,admin_action_type,admin_action_at,revision_requested_at,rejected_at,resubmitted_at,created_at,updated_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select(
            "id,first_name,last_name,phone,category,lang,privacy_accepted_at,terms_accepted_at,terms_version,created_at"
          ),
        supabase
          .from("application_documents")
          .select(
            "id,application_id,user_id,kind,storage_path,file_name,file_size,created_at"
          ),
        supabase
          .from("payments")
          .select(
            "id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,metadata,paid_at,created_at,updated_at"
          ),
        supabase
          .from("commission_scores")
          .select(
            "application_id,reviewer_id,score,criteria_scores,comment,evaluated_at,updated_at"
          ),
        supabase
          .from("commission_members")
          .select("user_id,display_name,active"),
        supabase
          .from("notifications")
          .select(
            "id,user_id,application_id,event_type,status,sent_at,error_text,attempts,last_attempt_at,created_at"
          )
          .eq("channel", "telegram")
          .order("created_at", { ascending: false }),
        supabase
          .from("application_document_reviews")
          .select(
            "id,application_id,document_id,status,comment,reviewed_by,reviewed_at,created_at,updated_at"
          ),
        supabase
          .from("application_admin_history")
          .select(
            "id,application_id,changed_by,old_status,new_status,old_decision,new_decision,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_status_history")
          .select(
            "id,payment_id,old_status,new_status,changed_by,reason,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("legacy_applications")
          .select(
            "id,source_key,full_name,email,phone,flow,university_match_paid,source_status,mapped_status,registered_on,linked_user_id,linked_application_id,source_file,source_payload,imported_at,updated_at"
          )
          .order("registered_on", { ascending: false }),
      ]);

    if (applicationsRes.error) {
      setError(applicationsRes.error.message);
      setLoading(false);
      return;
    }

    const profiles = profilesRes.data ?? [];
    const documents = documentsRes.data ?? [];
    const payments = paymentsRes.error ? [] : paymentsRes.data ?? [];
    const commissionScores = commissionScoresRes.error
      ? []
      : commissionScoresRes.data ?? [];
    const commissionMembers = commissionMembersRes.error
      ? []
      : commissionMembersRes.data ?? [];
    const notifications = notificationsRes.error
      ? []
      : notificationsRes.data ?? [];
    const documentReviews = documentReviewsRes.error
      ? []
      : documentReviewsRes.data ?? [];
    const adminHistory = adminHistoryRes.error ? [] : adminHistoryRes.data ?? [];
    const paymentHistory = paymentHistoryRes.error
      ? []
      : paymentHistoryRes.data ?? [];
    const legacyApplications = legacyApplicationsRes.error
      ? []
      : legacyApplicationsRes.data ?? [];

    setActiveCommissionCount(
      commissionMembers.filter((member) => member.active).length
    );

    const profileByUser = new Map(profiles.map((item) => [item.id, item]));
    const docsByApplication = new Map();
    documents.forEach((doc) => {
      const list = docsByApplication.get(doc.application_id) ?? [];
      list.push(doc);
      docsByApplication.set(doc.application_id, list);
    });
    const paymentsByUser = new Map();
    payments.forEach((payment) => {
      const list = paymentsByUser.get(payment.user_id) ?? [];
      list.push(payment);
      paymentsByUser.set(payment.user_id, list);
    });

    const memberByUser = new Map(
      commissionMembers.map((member) => [member.user_id, member])
    );
    const commissionScoresByApplication = new Map();

    commissionScores.forEach((score) => {
      const list =
        commissionScoresByApplication.get(score.application_id) ?? [];
      list.push({
        ...score,
        reviewer_name:
          memberByUser.get(score.reviewer_id)?.display_name ||
          `Эксперт ${String(score.reviewer_id).slice(0, 8)}`,
        reviewer_active:
          memberByUser.get(score.reviewer_id)?.active ?? false,
      });
      commissionScoresByApplication.set(score.application_id, list);
    });

    const notificationsByApplication = new Map();
    notifications.forEach((notification) => {
      if (!notification.application_id) return;
      const list =
        notificationsByApplication.get(notification.application_id) ?? [];
      list.push(notification);
      notificationsByApplication.set(notification.application_id, list);
    });

    const documentReviewsByApplication = new Map();
    documentReviews.forEach((review) => {
      const list = documentReviewsByApplication.get(review.application_id) ?? [];
      list.push(review);
      documentReviewsByApplication.set(review.application_id, list);
    });

    const adminHistoryByApplication = new Map();
    adminHistory.forEach((history) => {
      const list = adminHistoryByApplication.get(history.application_id) ?? [];
      list.push(history);
      adminHistoryByApplication.set(history.application_id, list);
    });

    const paymentHistoryByPayment = new Map();
    paymentHistory.forEach((history) => {
      const list = paymentHistoryByPayment.get(history.payment_id) ?? [];
      list.push(history);
      paymentHistoryByPayment.set(history.payment_id, list);
    });

    const enrichedPaymentsByUser = new Map();
    paymentsByUser.forEach((userPayments, userId) => {
      enrichedPaymentsByUser.set(
        userId,
        userPayments.map((payment) => ({
          ...payment,
          history: paymentHistoryByPayment.get(payment.id) ?? [],
        }))
      );
    });

    const legacyByApplication = new Map();
    const legacyByUser = new Map();
    legacyApplications.forEach((legacy) => {
      if (legacy.linked_application_id) {
        legacyByApplication.set(legacy.linked_application_id, legacy);
      } else if (legacy.linked_user_id) {
        legacyByUser.set(legacy.linked_user_id, legacy);
      }
    });

    const joined = (applicationsRes.data ?? []).map((application) => ({
      ...application,
      profile: profileByUser.get(application.user_id) ?? null,
      documents: docsByApplication.get(application.id) ?? [],
      payments: enrichedPaymentsByUser.get(application.user_id) ?? [],
      documentReviews:
        documentReviewsByApplication.get(application.id) ?? [],
      adminHistory: adminHistoryByApplication.get(application.id) ?? [],
      commissionScores:
        commissionScoresByApplication.get(application.id) ?? [],
      notifications:
        notificationsByApplication.get(application.id) ?? [],
      legacySource:
        legacyByApplication.get(application.id) ??
        legacyByUser.get(application.user_id) ??
        null,
    }));

    const applicationIds = new Set(joined.map((row) => row.id));
    const applicationUserIds = new Set(joined.map((row) => row.user_id));
    const unmatchedLegacy = legacyApplications
      .filter(
        (legacy) =>
          !applicationIds.has(legacy.linked_application_id) &&
          !applicationUserIds.has(legacy.linked_user_id)
      )
      .map((legacy) => ({
        id: `legacy:${legacy.id}`,
        user_id: legacy.linked_user_id || null,
        number: legacy.source_key,
        status: legacy.mapped_status || "draft",
        progress: 0,
        deadline: null,
        data: {},
        submitted_at: null,
        decision: null,
        result_published_at: null,
        appeal_deadline: null,
        terms_accepted_at: null,
        terms_version: null,
        admin_status_comment: null,
        admin_action_type: null,
        admin_action_at: null,
        revision_requested_at: null,
        rejected_at: null,
        resubmitted_at: null,
        created_at: legacy.registered_on
          ? `${legacy.registered_on}T00:00:00.000Z`
          : legacy.imported_at,
        updated_at: legacy.updated_at || legacy.imported_at,
        profile: {
          first_name: legacy.full_name,
          last_name: "",
          phone: legacy.phone,
          email: legacy.email,
          category: null,
          lang: "ru",
          created_at: legacy.registered_on
            ? `${legacy.registered_on}T00:00:00.000Z`
            : legacy.imported_at,
        },
        documents: [],
        payments: [],
        documentReviews: [],
        adminHistory: [],
        commissionScores: [],
        notifications: [],
        isLegacy: true,
        legacySource: legacy,
      }));

    setRows([...joined, ...unmatchedLegacy]);
    setLoading(false);
  };

  useEffect(() => {
    loadRows();
  }, []);

  const selected = rows.find((row) => row.id === selectedId) ?? null;


  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (filter !== "all" && workflowBucket(row) !== filter) return false;
      if (
        categoryFilter !== "all" &&
        ![row.data?.category, row.profile?.category].includes(categoryFilter)
      ) {
        return false;
      }
      if (supportFilter !== "all" && row.data?.support_type !== supportFilter) {
        return false;
      }
      if (paymentFilter === "paid" && !isCompetitionPaid(row)) return false;
      if (paymentFilter === "unpaid" && isCompetitionPaid(row)) return false;

      const rowDate = new Date(row.submitted_at || row.created_at || 0).getTime();
      if (dateFrom && rowDate < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
      if (dateTo && rowDate > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;

      if (!needle) return true;
      const fullName = `${row.profile?.last_name ?? ""} ${row.profile?.first_name ?? ""}`;
      return [
        row.number,
        fullName,
        row.profile?.phone,
        row.profile?.email,
        row.legacySource?.source_status,
        categoryLabel(row),
        supportLabel(row),
        paymentLabel(row),
        STATUS_LABELS[row.status],
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [
    rows,
    filter,
    search,
    categoryFilter,
    supportFilter,
    paymentFilter,
    dateFrom,
    dateTo,
  ]);

  const counts = useMemo(() => {
    const result = { all: rows.length };
    rows.forEach((row) => {
      const bucket = workflowBucket(row);
      result[bucket] = (result[bucket] ?? 0) + 1;
    });
    return result;
  }, [rows]);

  const ranking = useMemo(() => {
    const completed = rows
      .filter((row) => {
        if (!["evaluation", "final", "result"].includes(row.status)) return false;
        return commissionSummary(row, activeCommissionCount).complete;
      })
      .map((row) => ({
        ...row,
        average: commissionSummary(row, activeCommissionCount).average,
      }));

    const sortRows = (supportType, tieKey) =>
      completed
        .filter((row) => row.data?.support_type === supportType)
        .sort((a, b) => {
          if (b.average !== a.average) return b.average - a.average;

          const tieDiff =
            criterionAverage(b, tieKey) - criterionAverage(a, tieKey);

          if (tieDiff !== 0) return tieDiff;
          return String(a.number ?? "").localeCompare(String(b.number ?? ""));
        });

    return {
      grant: sortRows("grant", "motivation"),
      scholarship: sortRows("scholarship", "social_need"),
    };
  }, [rows, activeCommissionCount]);

  const ADMIN_ACTIONS = {
    commission: {
      status: "evaluation",
      title: "Передать заявку комиссии?",
      text:
        "После подтверждения заявка станет доступна всем активным членам конкурсной комиссии для независимой оценки.",
      confirm: "Да, передать",
      success: "Заявка передана конкурсной комиссии.",
      requiresReason: false,
    },
    revision: {
      status: "needs_fixes",
      title: "Отправить заявку на доработку?",
      text:
        "Укажите конкретно, что участнику необходимо исправить или загрузить заново. Без комментария отправить заявку на доработку нельзя.",
      confirm: "Да, отправить",
      success: "Заявка отправлена участнику на доработку.",
      requiresReason: true,
    },
    reject: {
      status: "rejected",
      title: "Отклонить заявку?",
      text:
        "Это действие прекращает дальнейшее участие этой заявки в конкурсе. Укажите причину отказа.",
      confirm: "Да, отклонить",
      success: "Заявка отклонена.",
      requiresReason: true,
      danger: true,
    },
  };

  const openActionModal = (type) => {
    setError("");
    setActionReason("");
    setActionModal(type);
  };

  const closeActionModal = () => {
    if (busy) return;
    setActionModal(null);
    setActionReason("");
  };

  const dispatchTelegramNotifications = async (applicationId) => {
    const { data, error: invokeError } = await supabase.functions.invoke(
      "telegram-notify",
      { body: { application_id: applicationId } }
    );

    if (invokeError) {
      console.error("telegram-notify invoke:", invokeError);
      return { ok: false, sent: 0, failed: 1 };
    }

    return {
      ok: data?.ok !== false && Number(data?.failed || 0) === 0,
      sent: Number(data?.sent || 0),
      failed: Number(data?.failed || 0),
    };
  };

  const retryTelegramNotifications = async (applicationId) => {
    if (!applicationId || busy) return;

    setBusy(true);
    setError("");

    const result = await dispatchTelegramNotifications(applicationId);
    await loadRows();

    setBusy(false);

    if (result.ok && result.sent > 0) {
      setToast("Telegram-уведомление отправлено участнику.");
      return;
    }

    if (result.ok) {
      setToast("Нет ожидающих Telegram-уведомлений.");
      return;
    }

    setError(
      "Не удалось отправить Telegram-уведомление. Оно сохранено в очереди — можно повторить отправку позже."
    );
  };

  const confirmAdminAction = async () => {
    if (!selected || !actionModal) return;

    const config = ADMIN_ACTIONS[actionModal];
    const reason = actionReason.trim();

    if (config.requiresReason && !reason) {
      setError("Укажите причину действия.");
      return;
    }

    if (actionModal === "commission" && !commissionReadiness(selected).ready) {
      setError(
        `Нельзя передать заявку комиссии: ${commissionReadiness(selected).reasons.join(
          "; "
        )}.`
      );
      setActionModal(null);
      return;
    }

    setBusy(true);
    setError("");

    const { error: updateError } = await supabase.rpc(
      "admin_transition_application",
      {
        p_application_id: selected.id,
        p_action: actionModal,
        p_comment: reason || null,
      }
    );

    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    const notificationResult = await dispatchTelegramNotifications(selected.id);

    await loadRows();
    setBusy(false);
    setActionModal(null);
    setActionReason("");

    if (!notificationResult.ok) {
      setToast(
        `${config.success} Telegram-уведомление осталось в очереди.`
      );
    } else if (notificationResult.sent > 0) {
      setToast(`${config.success} Участник уведомлён в Telegram.`);
    } else {
      setToast(config.success);
    }
  };

  const openDocumentReview = (doc, status) => {
    const existing = documentReview(selected, doc.id);
    setDocumentComment(existing?.comment || "");
    setDocumentModal({ doc, status });
    setError("");
  };

  const closeDocumentReview = () => {
    if (busy) return;
    setDocumentModal(null);
    setDocumentComment("");
  };

  const confirmDocumentReview = async () => {
    if (!selected || !documentModal || busy) return;

    const comment = documentComment.trim();
    if (documentModal.status === "replacement_required" && comment.length < 5) {
      setError("Для замены документа укажите понятную причину.");
      return;
    }

    setBusy(true);
    setError("");

    const { error: reviewError } = await supabase.rpc(
      "review_application_document",
      {
        p_document_id: documentModal.doc.id,
        p_status: documentModal.status,
        p_comment: comment || null,
      }
    );

    if (reviewError) {
      setError(reviewError.message);
      setBusy(false);
      return;
    }

    await loadRows();
    setBusy(false);
    setDocumentModal(null);
    setDocumentComment("");
    setToast(
      documentModal.status === "accepted"
        ? "Документ принят."
        : "Для документа запрошена замена."
    );
  };

  const openDocument = async (doc) => {
    setError("");
    const { data, error: signedError } = await supabase.storage
      .from("application-docs")
      .createSignedUrl(doc.storage_path, 60 * 10);

    if (signedError || !data?.signedUrl) {
      setError(signedError?.message || "Не удалось открыть документ.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const createDocumentLinks = async (row, includeIdentity) => {
    const docs = (row.documents ?? []).filter(
      (doc) => includeIdentity || !PERSONAL_DOC_KINDS.has(doc.kind)
    );

    const links = await Promise.all(
      docs.map(async (doc) => {
        const { data } = await supabase.storage
          .from("application-docs")
          .createSignedUrl(doc.storage_path, 60 * 60 * 24 * 7);

        return {
          label: `${DOC_LABELS[doc.kind] ?? doc.kind}: ${doc.file_name ?? "файл"}`,
          url: data?.signedUrl ?? "",
        };
      })
    );

    return links.filter((item) => item.url);
  };

  const exportExcel = async ({ commissionOnly }) => {
    setBusy(true);
    setError("");

    try {
      const source = commissionOnly
        ? rows.filter((row) =>
            ["accepted", "evaluation", "final", "result"].includes(row.status)
          )
        : filteredRows;

      if (!source.length) {
        setError("Нет заявок для экспорта.");
        setBusy(false);
        return;
      }

      const prepared = [];
      for (const row of source) {
        const links = await createDocumentLinks(row, !commissionOnly);
        prepared.push({ row, links });
      }

      const fixedHeaders = commissionOnly
        ? [
            "№ заявки",
            "ФИО",
            "Категория",
            "Вид поддержки",
            "Статус",
            "Дата подачи",
            "Документы",
            "Мотивационное письмо",
            "Баллы комиссии",
            "Комментарий комиссии",
          ]
        : [
            "№ заявки",
            "ФИО",
            "Телефон",
            "Email",
            "Источник",
            "Статус на старом сайте",
            "Дата рождения",
            "Возраст",
            "Категория",
            "Гражданство",
            "Вид поддержки",
            "Университет",
            "Специальность",
            "Статус",
            "Прогресс",
            "Оплата",
            "Дата подачи",
            "Документы",
            "Согласия",
            "Итоговый балл",
            "Решение",
            "Комментарий секретариата",
            "Мотивационное письмо",
            "Ссылки на документы",
          ];

      const headers = fixedHeaders;

      const bodyRows = prepared.map(({ row, links }) => {
        const fullName = [row.profile?.last_name, row.profile?.first_name]
          .filter(Boolean)
          .join(" ");

        const docHtml = links.length
          ? links
              .map(
                (link) =>
                  `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`
              )
              .join("<br>")
          : "—";

        const fixed = commissionOnly
          ? [
              row.number,
              fullName,
              categoryLabel(row),
              supportLabel(row),
              STATUS_LABELS[row.status] ?? row.status,
              formatDate(row.submitted_at),
              { html: docHtml },
              row.data?.motivation ?? "",
              commissionSummary(row).average ?? "",
              (row.commissionScores ?? [])
                .map((item) =>
                  `${item.reviewer_name}: ${item.comment?.trim() || "Комментарий не оставлен."}`
                )
                .join("\n\n"),
            ]
          : [
              row.number,
              fullName,
              row.profile?.phone ?? "",
              row.profile?.email ?? row.legacySource?.email ?? "",
              row.legacySource ? "Старый сайт" : "Новый сайт",
              row.legacySource?.source_status ?? "",
              formatDateOnly(row.data?.birth),
              applicationAge(row) ?? "",
              categoryLabel(row),
              participantScopeLabel(row),
              supportLabel(row),
              row.data?.university ?? "Не требуется",
              row.data?.specialty ?? "Не требуется",
              STATUS_LABELS[row.status] ?? row.status,
              `${applicationProgress(row)}%`,
              paymentLabel(row),
              formatDate(row.submitted_at),
              documentCompletenessLabel(row),
              consentState(row).complete ? "Зафиксированы" : "Не полностью",
              commissionSummary(row).average ?? "",
              row.decision ? DECISION_LABELS[row.decision] ?? row.decision : "",
              row.admin_status_comment ?? "",
              row.data?.motivation ?? "",
              { html: docHtml },
            ];
        return fixed;
      });

      const tableHead = headers
        .map((header) => `<th>${escapeHtml(header)}</th>`)
        .join("");

      const tableBody = bodyRows
        .map(
          (cells) =>
            `<tr>${cells
              .map((cell) =>
                cell && typeof cell === "object" && "html" in cell
                  ? `<td>${cell.html}</td>`
                  : `<td>${escapeHtml(cell)}</td>`
              )
              .join("")}</tr>`
        )
        .join("");

      const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="utf-8">
<style>
  table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; vertical-align: top; }
  th { font-weight: bold; background: #eee; }
</style>
</head>
<body>
<table>
<thead><tr>${tableHead}</tr></thead>
<tbody>${tableBody}</tbody>
</table>
</body>
</html>`;

      const blob = new Blob(["\ufeff", html], {
        type: "application/vnd.ms-excel;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = commissionOnly
        ? `QazEducation_комиссия_${date}.xls`
        : `QazEducation_реестр_${date}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast(
        commissionOnly
          ? "Excel для комиссии сформирован."
          : "Экспорт реестра сформирован."
      );
    } catch (exportError) {
      setError(exportError?.message || "Не удалось сформировать Excel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ActionToast message={toast} />
      <AdminActionModal
        type={actionModal}
        config={actionModal ? ADMIN_ACTIONS[actionModal] : null}
        reason={actionReason}
        setReason={setActionReason}
        busy={busy}
        onCancel={closeActionModal}
        onConfirm={confirmAdminAction}
      />
      <DocumentReviewModal
        modal={documentModal}
        comment={documentComment}
        setComment={setDocumentComment}
        busy={busy}
        onCancel={closeDocumentReview}
        onConfirm={confirmDocumentReview}
      />
      <AdminWorkspaceHeader signOut={signOut} />

      <Section className="!py-8 lg:!py-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink lg:text-5xl">
              Рабочая панель
            </h1>
            <p className="mt-3 max-w-[72ch] text-sm leading-relaxed text-ink-2 lg:text-base">
              В основном реестре находятся только оплаченные и отправленные
              заявки. Черновики и ожидающие оплату вынесены в отдельные очереди.
            </p>
          </div>
          <p className="rounded-full border border-line bg-bg-2 px-4 py-2 text-xs text-muted">
            Обновлено: {formatDate(new Date().toISOString())}
          </p>
        </div>

        <AdminSummary rows={rows} activeCommissionCount={activeCommissionCount} />

        {error && (
          <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-400/5 p-4 text-sm text-ink" role="alert">
            {error}
          </div>
        )}
      </Section>

      <Section id="payments" className="border-y border-line bg-bg-2/40 !py-10 lg:!py-14">
        <SectionHeading
          eyebrow="Контроль оплат"
          title="Платежи участия"
          text="Подтверждением считается только серверная запись платежа. Загруженный участником чек не меняет статус заявки."
        />
        <PaymentOverview rows={rows} />
      </Section>

      <Section id="applications" className="!py-10 lg:!py-14">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeading
            eyebrow="Реестр"
            title="Заявки участников"
            text="Выберите очередь, найдите участника и откройте карточку для проверки."
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => exportExcel({ commissionOnly: false })}
            className="w-fit rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Экспорт текущего реестра
          </button>
        </div>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Очереди заявок">
          {WORKFLOW_FILTERS.map((item) => (
            <FilterButton
              key={item.key}
              active={filter === item.key}
              onClick={() => {
                setFilter(item.key);
                setSelectedId(null);
              }}
            >
              {item.label} · {counts[item.key] ?? 0}
            </FilterButton>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(260px,1fr)_repeat(5,minmax(155px,0.45fr))]">
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-muted">
            Поиск
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="№ заявки, ФИО или телефон"
              className="h-12 w-full rounded-2xl border border-line bg-bg-2 px-4 text-base normal-case tracking-normal text-ink outline-none transition focus:border-accent"
            />
          </label>
          <FilterSelect
            label="Категория"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              ["all", "Все категории"],
              ["grade_9", "Выпускник 9 класса"],
              ["grade_11", "Выпускник 11 класса"],
              ["college", "Учащийся колледжа"],
              ["bachelor", "Студент университета"],
              ["university", "Студент университета · старые данные"],
            ]}
          />
          <FilterSelect
            label="Поддержка"
            value={supportFilter}
            onChange={setSupportFilter}
            options={[
              ["all", "Все направления"],
              ["grant", "Образовательный грант"],
              ["scholarship", "Стипендия"],
            ]}
          />
          <FilterSelect
            label="Оплата"
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              ["all", "Любой статус"],
              ["paid", "Оплачено"],
              ["unpaid", "Не подтверждено"],
            ]}
          />
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-muted">
            Дата от
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-bg-2 px-4 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-accent"
            />
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-muted">
            Дата до
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-bg-2 px-4 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-accent"
            />
          </label>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted">Загружаем заявки…</div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-block border border-line">
            <table className="min-w-[1120px] border-collapse text-left">
              <thead className="bg-bg-2">
                <tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted">
                  <th className="px-4 py-3">Заявка</th>
                  <th className="px-4 py-3">Участник</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3">Поддержка</th>
                  <th className="px-4 py-3">Оплата</th>
                  <th className="px-4 py-3">Комплектность</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Дата подачи</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const fullName = [row.profile?.last_name, row.profile?.first_name]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-bg-2 ${
                        selectedId === row.id ? "bg-bg-2" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-4 font-display text-sm font-medium text-ink">
                        {row.number ?? "—"}
                        <span className="mt-1 block text-xs font-normal text-muted">
                          {row.isLegacy
                            ? "Импорт со старого сайта"
                            : `${applicationProgress(row)}% заполнено`}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="block text-sm font-medium text-ink">
                          {fullName || "Без ФИО"}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {row.profile?.phone ?? "Телефон не указан"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink-2">
                        {categoryLabel(row)}
                      </td>
                      <td className="px-4 py-4 text-sm text-ink-2">
                        {supportLabel(row)}
                      </td>
                      <td className="px-4 py-4">
                        <PaymentBadge row={row} />
                      </td>
                      <td className="px-4 py-4 text-sm text-ink-2">
                        {documentCompletenessLabel(row)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-2">
                        {row.isLegacy
                          ? `Регистрация: ${formatDateOnly(row.legacySource?.registered_on)}`
                          : formatDate(row.submitted_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredRows.length && (
              <div className="px-6 py-12 text-center text-sm text-muted">
                В выбранной очереди заявок нет.
              </div>
            )}
          </div>
        )}

        {selected && (
          <Reveal>
            <ApplicationDetail
              row={selected}
              busy={busy}
              openDocument={openDocument}
              openDocumentReview={openDocumentReview}
              openActionModal={openActionModal}
              retryTelegramNotifications={retryTelegramNotifications}
              activeCommissionCount={activeCommissionCount}
            />
          </Reveal>
        )}
      </Section>

      <Section id="commission" className="border-y border-line bg-bg-2/40 !py-10 lg:!py-14">
        <details className="rounded-block border border-line bg-bg-2">
          <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg font-bold text-ink sm:px-6">
            Рейтинг комиссии
            <span className="ml-3 text-sm font-normal text-muted">
              завершённые оценки
            </span>
          </summary>

          <div className="border-t border-line p-5 sm:p-6">
            <p className="max-w-[80ch] text-sm leading-relaxed text-muted">
              Итоговый балл — среднее арифметическое оценок всех активных членов
              комиссии. Заявка попадает в рейтинг только после полной оценки.
              Активных экспертов: <strong className="text-ink">{activeCommissionCount}</strong>.
            </p>

            <div className="mt-6 grid gap-8 xl:grid-cols-2">
              <RankingTable
                title="Образовательный грант"
                quota="10 грантов"
                rows={ranking.grant}
                expectedCount={activeCommissionCount}
              />
              <RankingTable
                title="Стипендия"
                quota="30 стипендий"
                rows={ranking.scholarship}
                expectedCount={activeCommissionCount}
              />
            </div>

            <p className="mt-6 text-xs leading-relaxed text-muted">
              Top-30 формируется из оставшихся оценённых финалистов после
              распределения 10 грантов и 30 стипендий. При полном равенстве на
              границе квоты автоматическая публикация блокируется.
            </p>
          </div>
        </details>
      </Section>

      <Section id="results" className="!py-10 lg:!py-14">
        <CompetitionResultsPanel
          rows={rows}
          activeCommissionCount={activeCommissionCount}
          reloadApplications={loadRows}
          onToast={setToast}
          onError={setError}
        />
      </Section>

      <Section id="appeals" className="border-t border-line !py-10 lg:!py-14">
        <AppealsPanel
          rows={rows}
          reloadApplications={loadRows}
          onToast={setToast}
          onError={setError}
        />
      </Section>

      <Section id="settings" className="border-t border-line bg-bg-2/40 !py-10 lg:!py-14">
        <SectionHeading
          title="Настройки цикла"
          text="Критические параметры зафиксированы на сервере и не могут быть изменены из браузера участника."
        />
        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactStat label="Конкурсный цикл" value="2026" />
          <CompactStat label="Оплата участия" value="10 000 ₸ · Kaspi QR" />
          <CompactStat label="Гранты" value="10 мест" />
          <CompactStat label="Стипендии" value="50 мест" note="Top-30 — отдельный рейтинг" />
        </div>
      </Section>
    </>
  );
}

function AdminWorkspaceHeader({ signOut }) {
  const links = [
    ["Заявки", "#applications"],
    ["Платежи", "#payments"],
    ["Комиссия", "#commission"],
    ["Рейтинг", "#commission"],
    ["Результаты", "#results"],
    ["Апелляции", "#appeals"],
    ["Настройки", "#settings"],
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1400px] items-center gap-5 px-5 sm:px-8">
        <Logo className="shrink-0" />
        <nav
          aria-label="Разделы панели администратора"
          className="hidden flex-1 items-center justify-center gap-6 lg:flex"
        >
          {links.map(([label, href]) => (
            <a
              key={`${label}-${href}`}
              href={href}
              className="text-sm text-ink-2 transition hover:text-accent"
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={signOut}
          className="ml-auto rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-accent hover:text-accent"
        >
          Выйти
        </button>
      </div>
      <nav
        aria-label="Разделы панели администратора на мобильном"
        className="flex gap-2 overflow-x-auto border-t border-line px-5 py-3 lg:hidden"
      >
        {links.map(([label, href]) => (
          <a
            key={`${label}-${href}`}
            href={href}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-ink-2"
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function SectionHeading({ title, text }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">
        {title}
      </h2>
      {text && (
        <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted">
          {text}
        </p>
      )}
    </div>
  );
}

function AdminSummary({ rows, activeCommissionCount }) {
  const submitted = rows.filter((row) => workflowBucket(row) === "submitted").length;
  const awaitingPayment = rows.filter(
    (row) => workflowBucket(row) === "awaiting_payment"
  ).length;
  const documentReviewPending = rows.filter((row) => {
    const bucket = workflowBucket(row);
    return ["submitted", "needs_fixes"].includes(bucket) && !requiredDocumentState(row).allAccepted;
  }).length;
  const appeals = rows.filter((row) => workflowBucket(row) === "appeal").length;
  const awaitingDecision = rows.filter((row) => {
    if (!["evaluation", "final"].includes(row.status)) return false;
    return commissionSummary(row, activeCommissionCount).complete;
  }).length;

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryMetric label="Новые заявки" value={submitted} tone="accent" />
      <SummaryMetric label="Неоплаченные" value={awaitingPayment} />
      <SummaryMetric label="Требуют проверки" value={documentReviewPending} />
      <SummaryMetric label="Ожидают решения" value={awaitingDecision} />
      <SummaryMetric label="Апелляции" value={appeals} />
    </div>
  );
}

function SummaryMetric({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-2 p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-2 font-display text-3xl font-bold ${
          tone === "accent" ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="grid gap-2 text-xs uppercase tracking-[0.08em] text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-2xl border border-line bg-bg-2 px-4 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-accent"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaymentOverview({ rows }) {
  const applicationsByUser = new Map(rows.map((row) => [row.user_id, row]));
  const payments = rows
    .flatMap((row) => row.payments ?? [])
    .filter((payment, index, list) => {
      if (payment.payment_type !== "competition_fee") return false;
      return list.findIndex((item) => item.id === payment.id) === index;
    })
    .sort(
      (a, b) =>
        new Date(b.paid_at || b.updated_at || b.created_at || 0).getTime() -
        new Date(a.paid_at || a.updated_at || a.created_at || 0).getTime()
    );

  const paid = payments.filter((item) => item.status === "paid").length;
  const pending = payments.filter((item) => item.status === "pending").length;
  const refunded = payments.filter((item) => item.status === "refunded").length;
  const noPayment = rows.filter(
    (row) => workflowBucket(row) === "awaiting_payment" && !competitionPayment(row)
  ).length;

  return (
    <div className="mt-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Подтверждено" value={paid} tone="accent" />
        <SummaryMetric label="Ожидает подтверждения" value={pending} />
        <SummaryMetric label="Без созданного платежа" value={noPayment} />
        <SummaryMetric label="Возвращено" value={refunded} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-block border border-line bg-bg">
        <table className="min-w-[900px] border-collapse text-left">
          <thead className="bg-bg-2">
            <tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-3">Заявка</th>
              <th className="px-4 py-3">Участник</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Провайдер</th>
              <th className="px-4 py-3">Транзакция</th>
              <th className="px-4 py-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, 20).map((payment) => {
              const application = applicationsByUser.get(payment.user_id);
              const fullName = [
                application?.profile?.last_name,
                application?.profile?.first_name,
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={payment.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-display text-sm font-medium text-ink">
                    {application?.number || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-2">{fullName || "—"}</td>
                  <td className="px-4 py-3 text-sm text-ink">
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-2">
                    {Number(payment.amount_tenge || 0).toLocaleString("ru-RU")} ₸
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-2">
                    {payment.provider || "Не указан"}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-2">
                    {payment.provider_payment_id || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-2">
                    {formatDate(payment.paid_at || payment.updated_at || payment.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!payments.length && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">Платежей пока нет</p>
            <p className="mt-2 text-sm text-muted">
              После подключения Pay.kz здесь появятся серверные подтверждения и номера транзакций.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentBadge({ row }) {
  const paid = isCompetitionPaid(row);
  const payment = competitionPayment(row);
  const label = paymentLabel(row, false);

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-xs ${
        paid
          ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
          : payment?.status === "refunded" || payment?.status === "cancelled"
            ? "border-red-400/50 bg-red-400/10 text-red-200"
            : "border-accent/40 bg-accent/5 text-accent"
      }`}
    >
      {label}
    </span>
  );
}

function CompactStat({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-2 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-base font-bold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function InfoCard({ title, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-line bg-bg p-5 sm:p-6 ${className}`}>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      <dl className="mt-4 divide-y divide-line border-y border-line">{children}</dl>
    </section>
  );
}

function VerificationRow({ label, value, ok }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[190px_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-start gap-2 text-sm leading-relaxed text-ink">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            ok ? "bg-emerald-400/15 text-emerald-300" : "bg-accent/10 text-accent"
          }`}
        >
          {ok ? "✓" : "!"}
        </span>
        <span>{value}</span>
      </dd>
    </div>
  );
}

function PaymentCard({ payment, row }) {
  return (
    <section className="rounded-2xl border border-line bg-bg p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-ink">Оплата участия</h3>
        <PaymentBadge row={row} />
      </div>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        <DetailRow
          label="Сумма"
          value={payment ? `${Number(payment.amount_tenge).toLocaleString("ru-RU")} ₸` : "10 000 ₸"}
        />
        <DetailRow label="Дата оплаты" value={formatDate(payment?.paid_at)} />
        <DetailRow label="Платёжная система" value={payment?.provider || "Не подключена"} />
        <DetailRow
          label="Номер транзакции"
          value={payment?.provider_payment_id || "Не присвоен"}
        />
      </dl>

      {!payment && (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Pay.kz пока не подключён. Статус нельзя подтвердить отметкой или загруженным чеком участника.
        </p>
      )}

      {payment?.history?.length > 0 && (
        <details className="mt-4 rounded-xl border border-line bg-bg-2">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
            История статуса · {payment.history.length}
          </summary>
          <div className="border-t border-line px-4 py-3">
            {payment.history.map((item) => (
              <p key={item.id} className="py-1 text-xs text-muted">
                {formatDate(item.created_at)} · {PAYMENT_STATUS_LABELS[item.old_status] || item.old_status || "создан"} → {PAYMENT_STATUS_LABELS[item.new_status] || item.new_status}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DocumentChecklist({ row, busy, openDocument, openDocumentReview }) {
  const required = requiredDocumentState(row);

  return (
    <section className="mt-6 rounded-2xl border border-line bg-bg p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Документы · {row.documents.length}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {required.present}/{required.total} обязательных загружено · {required.accepted}/{required.total} принято
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {row.documents.map((doc) => {
          const review = documentReview(row, doc.id);
          const status = review?.status || "pending";

          return (
            <article key={doc.id} className="rounded-2xl border border-line bg-bg-2 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {DOC_LABELS[doc.kind] ?? doc.kind}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted">
                    {doc.file_name ?? "Файл"} · {formatFileSize(doc.file_size)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Загружен: {formatDate(doc.created_at)}
                  </p>
                </div>
                <DocumentReviewBadge status={status} />
              </div>

              {review?.comment && (
                <p className="mt-3 rounded-xl border border-line bg-bg p-3 text-sm leading-relaxed text-ink-2">
                  {review.comment}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton disabled={busy} onClick={() => openDocument(doc)}>
                  Открыть
                </ActionButton>
                <ActionButton
                  disabled={busy || status === "accepted"}
                  accent
                  onClick={() => openDocumentReview(doc, "accepted")}
                >
                  Принять
                </ActionButton>
                <ActionButton
                  disabled={busy || status === "replacement_required"}
                  danger
                  onClick={() => openDocumentReview(doc, "replacement_required")}
                >
                  Требуется замена
                </ActionButton>
              </div>
            </article>
          );
        })}

        {required.items
          .filter((item) => !item.present)
          .map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-4"
            >
              <p className="text-sm font-medium text-ink">{item.label}</p>
              <p className="mt-1 text-xs text-accent">Обязательный документ не загружен</p>
            </div>
          ))}

        {!row.documents.length && !required.items.length && (
          <p className="text-sm text-muted">Документы не загружены.</p>
        )}
      </div>
    </section>
  );
}

function DocumentReviewBadge({ status }) {
  const tone =
    status === "accepted"
      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
      : status === "replacement_required"
        ? "border-red-400/50 bg-red-400/10 text-red-200"
        : "border-line text-muted";

  return (
    <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${tone}`}>
      {DOCUMENT_REVIEW_LABELS[status] ?? status}
    </span>
  );
}

function ActivityTimeline({ row }) {
  const items = [
    {
      key: "created",
      date: row.created_at,
      title: row.isLegacy ? "Регистрация на старом сайте" : "Создан черновик",
      text: row.isLegacy
        ? "Дата перенесена из старого реестра."
        : "Запись появилась после регистрации участника.",
    },
    ...(row.legacySource?.imported_at
      ? [
          {
            key: "legacy-import",
            date: row.legacySource.imported_at,
            title: "Перенесено в новую базу",
            text: `${row.legacySource.source_file || "Старый реестр"}${row.legacySource.source_status ? ` · исходный статус: ${row.legacySource.source_status}` : ""}`,
          },
        ]
      : []),
    ...(row.documents ?? []).map((doc) => ({
      key: `doc-${doc.id}`,
      date: doc.created_at,
      title: "Загружен документ",
      text: DOC_LABELS[doc.kind] ?? doc.kind,
    })),
    ...(row.payments ?? []).map((payment) => ({
      key: `payment-${payment.id}`,
      date: payment.paid_at || payment.updated_at || payment.created_at,
      title: `Платёж: ${PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}`,
      text: `${Number(payment.amount_tenge || 0).toLocaleString("ru-RU")} ₸${payment.provider ? ` · ${payment.provider}` : ""}`,
    })),
    ...(row.submitted_at
      ? [
          {
            key: "submitted",
            date: row.submitted_at,
            title: "Заявка отправлена",
            text: "Зафиксирована финальная подача участником.",
          },
        ]
      : []),
    ...(row.resubmitted_at
      ? [
          {
            key: "resubmitted",
            date: row.resubmitted_at,
            title: "Заявка отправлена повторно",
            text: "Участник внёс исправления без повторной оплаты.",
          },
        ]
      : []),
    ...(row.adminHistory ?? []).map((history) => ({
      key: `history-${history.id}`,
      date: history.created_at,
      title: "Действие секретариата",
      text: `${STATUS_LABELS[history.old_status] || history.old_status || "—"} → ${STATUS_LABELS[history.new_status] || history.new_status || "—"}`,
    })),
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <details className="rounded-2xl border border-line bg-bg">
      <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg font-bold text-ink">
        История заявки · {items.length}
      </summary>
      <ol className="border-t border-line px-5 py-2">
        {items.map((item) => (
          <li key={item.key} className="grid gap-1 border-b border-line py-4 last:border-0 sm:grid-cols-[170px_1fr]">
            <time className="text-xs text-muted">{formatDate(item.date)}</time>
            <div>
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink-2">{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function DocumentReviewModal({
  modal,
  comment,
  setComment,
  busy,
  onCancel,
  onConfirm,
}) {
  if (!modal) return null;
  const replacement = modal.status === "replacement_required";

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-review-title"
    >
      <div className="w-full max-w-xl rounded-block border border-line bg-bg-2 p-6 shadow-2xl sm:p-8">
        <h2 id="document-review-title" className="font-display text-2xl font-bold text-ink">
          {replacement ? "Запросить замену документа?" : "Принять документ?"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          {DOC_LABELS[modal.doc.kind] ?? modal.doc.kind} · {modal.doc.file_name || "файл"}
        </p>

        <label className="mt-6 grid gap-2 text-sm font-medium text-ink">
          {replacement ? "Причина замены *" : "Комментарий администратора"}
          <textarea
            rows="4"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={
              replacement
                ? "Например: изображение нечитаемо, загрузите документ повторно."
                : "Необязательно"
            }
            className="resize-y rounded-2xl border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-accent"
          />
        </label>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <ActionButton disabled={busy} onClick={onCancel}>Отмена</ActionButton>
          <ActionButton
            disabled={busy || (replacement && comment.trim().length < 5)}
            danger={replacement}
            accent={!replacement}
            onClick={onConfirm}
          >
            {busy ? "Сохраняем…" : replacement ? "Запросить замену" : "Принять"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ApplicationDetail({
  row,
  busy,
  openDocument,
  openDocumentReview,
  openActionModal,
  retryTelegramNotifications,
  activeCommissionCount,
}) {
  const fullName = [row.profile?.last_name, row.profile?.first_name]
    .filter(Boolean)
    .join(" ");
  const motivationText =
    typeof row.data?.motivation === "string" ? row.data.motivation.trim() : "";
  const payment = competitionPayment(row);
  const age = applicationAge(row);
  const documents = requiredDocumentState(row);
  const consents = consentState(row);
  const readiness = commissionReadiness(row);
  const bucket = workflowBucket(row);
  const progress = applicationProgress(row);
  const actionable =
    !row.isLegacy && ["submitted", "tech_review", "accepted"].includes(row.status);

  return (
    <section className="mt-10 overflow-hidden rounded-block border border-line bg-bg-2">
      <div className="border-b border-line bg-bg px-6 py-6 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-accent">
              {row.number}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">
              {fullName || "Участник без указанного ФИО"}
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              {row.profile?.phone ?? "Телефон не указан"} · {categoryLabel(row)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <StatusBadge status={row.status} />
            <PaymentBadge row={row} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStat label="Заполнение" value={`${progress}%`} />
          <CompactStat
            label="Документы"
            value={`${documents.present}/${documents.total} загружено`}
            note={`${documents.accepted}/${documents.total} проверено`}
          />
          <CompactStat label="Дата подачи" value={formatDate(row.submitted_at)} />
          <CompactStat label="Последнее изменение" value={formatDate(row.updated_at)} />
        </div>

        {bucket !== "submitted" && ["drafts", "awaiting_payment"].includes(bucket) && (
          <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/5 p-4">
            <p className="text-sm font-medium text-ink">
              {bucket === "awaiting_payment"
                ? "Заявка заполнена, но не считается поданной"
                : "Это черновик участника"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              {bucket === "awaiting_payment"
                ? "Оплата 10 000 ₸ не подтверждена. Запись хранится отдельно и не может быть передана комиссии."
                : "Участник ещё заполняет данные. Черновик не входит в рабочий реестр поданных заявок."}
            </p>
          </div>
        )}

        {row.legacySource && (
          <div className="mt-5 rounded-2xl border border-line bg-bg-2 p-4">
            <p className="text-sm font-medium text-ink">
              {row.isLegacy ? "Запись импортирована со старого сайта" : "Аккаунт связан со старой записью"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Исходный статус: {row.legacySource.source_status || "не был указан"}. Поскольку подтверждённой оплаты в старом реестре нет, запись не считается поданной.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-8 p-6 lg:p-9 xl:grid-cols-[1.05fr_0.95fr]">
        <div>
          <InfoCard title="Участник">
            <DetailRow label="ФИО" value={fullName || "Не указано"} />
            <DetailRow label="Телефон" value={row.profile?.phone || "Не указан"} />
            <DetailRow
              label="Email"
              value={row.profile?.email || row.legacySource?.email || "Не указан"}
            />
            <DetailRow
              label="Дата рождения"
              value={`${formatDateOnly(row.data?.birth)}${age === null ? "" : ` · ${age} лет`}`}
            />
            <DetailRow label="Категория" value={categoryLabel(row)} />
            <DetailRow label="Статус" value={participantScopeLabel(row)} />
            <DetailRow
              label="Гражданство"
              value={row.data?.citizenship_country || "Не указано"}
            />
            <DetailRow
              label="Регистрация"
              value={formatDate(row.profile?.created_at || row.created_at)}
            />
          </InfoCard>

          <InfoCard title="Участие в конкурсе" className="mt-6">
            <DetailRow label="Вид поддержки" value={supportLabel(row)} />
            <DetailRow
              label="Университет"
              value={
                row.data?.support_type === "grant"
                  ? row.data?.university || "Не выбран"
                  : "Не требуется для стипендии"
              }
            />
            <DetailRow
              label="Специальность"
              value={
                row.data?.support_type === "grant"
                  ? row.data?.specialty || "Не выбрана"
                  : "Не требуется для стипендии"
              }
            />
          </InfoCard>

          <details className="mt-6 rounded-2xl border border-line bg-bg">
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Мотивационное письмо
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {motivationText
                      ? `${motivationText.length} знаков · нажмите, чтобы открыть`
                      : "Не заполнено"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-accent">
                  Открыть
                </span>
              </div>
            </summary>

            <div className="border-t border-line px-5 py-5">
              {motivationText ? (
                <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-relaxed text-ink">
                  {motivationText}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Мотивационное письмо не заполнено.
                </p>
              )}
            </div>
          </details>

          <InfoCard title="Согласия участника" className="mt-6">
            <VerificationRow
              label="Согласия при регистрации"
              ok={consents.registrationRecorded}
              value={
                consents.registrationRecorded
                  ? `${formatDate(row.profile?.terms_accepted_at)} · версия ${row.profile?.terms_version || "не указана"}`
                  : "Не зафиксированы сервером"
              }
            />
            <VerificationRow
              label="Отметки в заявке"
              ok={consents.applicationChecks}
              value={consents.applicationChecks ? "Обе отметки установлены" : "Не подтверждены полностью"}
            />
            <VerificationRow
              label="Финальная фиксация"
              ok={consents.applicationRecorded}
              value={
                consents.applicationRecorded
                  ? `${formatDate(row.terms_accepted_at)} · версия ${row.terms_version || "не указана"}`
                  : "Заявка ещё не отправлена"
              }
            />
          </InfoCard>
        </div>

        <div>
          <PaymentCard payment={payment} row={row} />
          <DocumentChecklist
            row={row}
            busy={busy}
            openDocument={openDocument}
            openDocumentReview={openDocumentReview}
          />
        </div>
      </div>

      <div className="border-t border-line px-6 py-8 lg:px-9">
        <ActivityTimeline row={row} />
      </div>

      <div className="border-t border-line px-6 py-8 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">
              Оценки конкурсной комиссии
            </h3>
            <p className="mt-2 text-sm text-muted">
              Каждый эксперт оценивает заявку отдельно и не видит оценки других экспертов.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.08em] text-muted">
              Средний балл
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">
              {commissionSummary(row, activeCommissionCount).average ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Оценено: {commissionSummary(row, activeCommissionCount).count}/
              {activeCommissionCount || "?"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {(row.commissionScores ?? []).map((item) => {
            const criteria = commissionCriteriaFor(row);

            return (
              <div
                key={item.reviewer_id}
                className="rounded-2xl border border-line bg-bg p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {item.reviewer_name}
                      {item.reviewer_active === false ? " · неактивен" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDate(item.evaluated_at)}
                    </p>
                  </div>
                  <p className="font-display text-xl font-bold text-accent">
                    {item.score} / 100
                  </p>
                </div>

                <div className="mt-4 divide-y divide-line border-y border-line">
                  {criteria.map((criterion) => (
                    <div
                      key={criterion.key}
                      className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <span className="text-sm text-ink-2">
                        {criterion.label}
                      </span>
                      <span className="font-display text-sm font-medium text-ink">
                        {item.criteria_scores?.[criterion.key] ?? "—"} / {criterion.max}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-line bg-bg-2 p-4">
                  <p className="text-xs uppercase tracking-[0.08em] text-muted">
                    Комментарий комиссии
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {item.comment?.trim() || "Комментарий не оставлен."}
                  </p>
                </div>
              </div>
            );
          })}

          {!(row.commissionScores ?? []).length && (
            <p className="text-sm text-muted">
              Комиссия ещё не выставила оценки по этой заявке.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-bg px-6 py-8 lg:px-9">
        <h3 className="font-display text-lg font-bold text-ink">
          Решение секретариата
        </h3>
        <p className="mt-2 max-w-[76ch] text-sm leading-relaxed text-muted">
          После проверки наличия и достоверности документов выберите одно из
          трёх действий. Любое действие выполняется только после подтверждения.
        </p>

        {actionable ? (
          <>
            {!readiness.ready && (
              <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <p className="text-sm font-medium text-ink">
                  Передача комиссии пока заблокирована
                </p>
                <ul className="mt-2 grid gap-1 text-sm text-ink-2">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <ActionButton
                disabled={busy || !readiness.ready}
                accent
                onClick={() => openActionModal("commission")}
              >
                Передать комиссии
              </ActionButton>

              <ActionButton
                disabled={busy}
                onClick={() => openActionModal("revision")}
              >
                Отправить на доработку
              </ActionButton>

              <ActionButton
                disabled={busy}
                danger
                onClick={() => openActionModal("reject")}
              >
                Отклонить
              </ActionButton>
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm text-muted">
            {row.isLegacy
              ? "Сначала участник должен зарегистрироваться и завершить заявку в новом личном кабинете. После автоматической привязки станут доступны рабочие действия."
              : "Для текущего статуса решения секретариата уже не требуются."}
          </p>
        )}

        {(row.admin_status_comment || row.admin_action_at) && (
          <div className="mt-5 rounded-2xl border border-line bg-bg p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted">
              Последнее решение секретариата
            </p>
            <p className="mt-2 text-sm font-medium text-ink">
              {row.admin_action_type === "revision"
                ? "Отправлено на доработку"
                : row.admin_action_type === "reject"
                  ? "Заявка отклонена"
                  : row.admin_action_type === "commission"
                    ? "Передано комиссии"
                    : STATUS_LABELS[row.status] ?? row.status}
            </p>

            {row.admin_status_comment && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                {row.admin_status_comment}
              </p>
            )}

            {row.admin_action_at && (
              <p className="mt-2 text-xs text-muted">
                {formatDate(row.admin_action_at)}
              </p>
            )}
          </div>
        )}

        <TelegramNotificationStatus
          notifications={row.notifications ?? []}
          busy={busy}
          onRetry={() => retryTelegramNotifications(row.id)}
        />
      </div>
    </section>
  );
}

function TelegramNotificationStatus({ notifications, busy, onRetry }) {
  const latest = notifications?.[0] ?? null;

  if (!latest) return null;

  const statusLabels = {
    pending: "Ожидает отправки",
    processing: "Отправляется",
    sent: "Отправлено",
    failed: "Ошибка отправки",
    cancelled: "Заменено новым уведомлением",
  };

  const canRetry = ["pending", "failed"].includes(latest.status);

  return (
    <div className="mt-5 rounded-2xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted">
            Telegram-уведомление
          </p>
          <p className="mt-2 text-sm font-medium text-ink">
            {statusLabels[latest.status] ?? latest.status}
          </p>
          <p className="mt-1 text-xs text-muted">
            {latest.sent_at
              ? `Отправлено: ${formatDate(latest.sent_at)}`
              : `Создано: ${formatDate(latest.created_at)}`}
          </p>
          {latest.error_text && (
            <p className="mt-2 max-w-[76ch] text-xs leading-relaxed text-red-500">
              {latest.error_text}
            </p>
          )}
        </div>

        {canRetry && (
          <ActionButton disabled={busy} onClick={onRetry}>
            Повторить отправку
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function RankingTable({ title, quota, rows, expectedCount }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        <span className="text-xs text-accent">{quota}</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="min-w-full border-collapse text-left">
          <thead className="bg-bg">
            <tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted">
              <th className="px-3 py-2">№</th>
              <th className="px-3 py-2">Заявка</th>
              <th className="px-3 py-2">Участник</th>
              <th className="px-3 py-2">Балл</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const fullName = [row.profile?.last_name, row.profile?.first_name]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 text-sm text-muted">{index + 1}</td>
                  <td className="px-3 py-2.5 font-display text-sm font-medium text-ink">
                    {row.number}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-ink-2">
                    {fullName || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-display text-sm font-bold text-accent">
                      {commissionSummary(row, expectedCount).average}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Пока нет заявок с полностью завершённой оценкой комиссии.
          </p>
        )}
      </div>
    </div>
  );
}

function AdminActionModal({
  type,
  config,
  reason,
  setReason,
  busy,
  onCancel,
  onConfirm,
}) {
  if (!type || !config) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-action-title"
    >
      <div className="w-full max-w-xl rounded-block border border-line bg-bg-2 p-6 shadow-2xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.08em] text-accent">
          Подтверждение действия
        </p>
        <h2
          id="admin-action-title"
          className="mt-2 font-display text-2xl font-bold tracking-tight text-ink"
        >
          {config.title}
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          {config.text}
        </p>

        {config.requiresReason && (
          <label className="mt-6 grid gap-2">
            <span className="text-sm font-medium text-ink">
              {type === "reject" ? "Причина отказа" : "Что необходимо исправить"}
              <span className="text-accent"> *</span>
            </span>
            <textarea
              autoFocus
              rows="5"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                type === "reject"
                  ? "Например: представлены недостоверные документы."
                  : "Например: загрузите корректный сертификат ЕНТ."
              }
              className="resize-y rounded-2xl border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">
              Комментарий увидит участник в личном кабинете.
            </span>
          </label>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-50"
          >
            Нет
          </button>

          <button
            type="button"
            disabled={busy || (config.requiresReason && !reason.trim())}
            onClick={onConfirm}
            className={`rounded-full border px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
              config.danger
                ? "border-red-400 bg-red-400/10 text-red-200 hover:bg-red-400/20"
                : "border-accent bg-accent text-on-accent hover:opacity-90"
            }`}
          >
            {busy ? "Выполняем…" : config.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs transition ${
        active
          ? "border-accent bg-accent text-on-accent"
          : "border-line text-ink-2 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({ accent, danger, disabled, children, onClick }) {
  const tone = danger
    ? "border-red-400/50 text-red-300 hover:bg-red-400/10"
    : accent
      ? "border-accent bg-accent text-on-accent hover:opacity-90"
      : "border-line text-ink hover:border-accent hover:text-accent";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  return (
    <span className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs text-ink-2">
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DetailRow({ label, value, pre }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd
        className={`text-sm leading-relaxed text-ink ${
          pre ? "whitespace-pre-wrap break-words" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ActionToast({ message }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 top-5 z-[100] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-accent bg-bg-2 px-5 py-4 text-sm font-medium text-ink shadow-xl"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent"
        >
          ✓
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
}
