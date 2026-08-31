import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

const CYCLE_ID = 2026;

const CYCLE_LABELS = {
  open: "Приём заявок открыт",
  applications_closed: "Приём заявок завершён",
  results_published: "Итоги опубликованы",
};

const DECISION_LABELS = {
  grant: "Образовательный грант",
  scholarship: "Стипендия",
  top30: "Top-30 / резерв",
  not_selected: "Не прошли конкурс",
};

function formatDate(value) {
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
    return value;
  }
}

function Stat({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-line bg-bg p-4">
      <p className="text-xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function ResultList({ title, rows }) {
  return (
    <details className="rounded-2xl border border-line bg-bg">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-ink">
        {title} · {rows.length}
      </summary>
      <div className="max-h-80 overflow-auto border-t border-line">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-bg-2 text-xs uppercase tracking-[0.08em] text-muted">
            <tr>
              <th className="px-4 py-3">№</th>
              <th className="px-4 py-3">Заявка</th>
              <th className="px-4 py-3">Балл</th>
              <th className="px-4 py-3">Направление</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.application_id} className="border-t border-line">
                <td className="px-4 py-3 text-muted">{index + 1}</td>
                <td className="px-4 py-3 font-medium text-ink">
                  {row.application_number || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  {row.average_score ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {row.support_type === "grant"
                    ? "Грант"
                    : row.support_type === "scholarship"
                      ? "Стипендия"
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function CompetitionResultsPanel({
  rows,
  activeCommissionCount,
  reloadApplications,
  onToast,
  onError,
}) {
  const [cycle, setCycle] = useState(null);
  const [preview, setPreview] = useState([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [delivery, setDelivery] = useState({ pending: 0, failed: 0, sent: 0 });
  const rowsVersion = rows
    .map(
      (row) =>
        `${row.id}:${row.status}:${row.appeal_deadline || ""}:${(row.commissionScores || [])
          .map((score) => score.updated_at || score.evaluated_at || "")
          .join(",")}`
    )
    .join("|");

  const loadState = async () => {
    setLoading(true);

    const [cycleRes, previewRes, pendingRes, failedRes, sentRes] =
      await Promise.all([
        supabase
          .from("competition_cycles")
          .select(
            "id,status,grant_quota,scholarship_quota,top30_quota,applications_closed_at,results_published_at,published_by"
          )
          .eq("id", CYCLE_ID)
          .maybeSingle(),
        supabase.rpc("get_competition_results_preview", {
          p_cycle_id: CYCLE_ID,
        }),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("channel", "telegram")
          .in("event_type", ["competition_result", "competition_final_rejected"])
          .eq("status", "pending"),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("channel", "telegram")
          .in("event_type", ["competition_result", "competition_final_rejected"])
          .eq("status", "failed"),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("channel", "telegram")
          .in("event_type", ["competition_result", "competition_final_rejected"])
          .eq("status", "sent"),
      ]);

    if (cycleRes.error) {
      onError?.(
        cycleRes.error.message ||
          "Не удалось загрузить состояние конкурса. Выполните competition-results-v1.sql."
      );
      setLoading(false);
      return;
    }

    if (previewRes.error) {
      onError?.(previewRes.error.message);
    }

    setCycle(cycleRes.data || null);
    setPreview(previewRes.error ? [] : previewRes.data || []);
    setDelivery({
      pending: Number(pendingRes.count || 0),
      failed: Number(failedRes.count || 0),
      sent: Number(sentRes.count || 0),
    });
    setLoading(false);
  };

  useEffect(() => {
    loadState();
  }, [activeCommissionCount, rowsVersion]);

  const grouped = useMemo(() => {
    const result = {
      grant: [],
      scholarship: [],
      top30: [],
      not_selected: [],
    };

    preview.forEach((item) => {
      if (result[item.suggested_decision]) {
        result[item.suggested_decision].push(item);
      }
    });

    return result;
  }, [preview]);

  const submittedWaiting = useMemo(
    () =>
      rows.filter((row) =>
        ["submitted", "tech_review", "needs_fixes", "accepted", "appeal"].includes(
          row.status
        )
      ).length,
    [rows]
  );

  const commissionPoolCount = useMemo(
    () => rows.filter((row) => ["evaluation", "final"].includes(row.status)).length,
    [rows]
  );

  const completeBeforePublish = preview.filter((row) =>
    ["evaluation", "final", "result"].includes(
      rows.find((item) => item.id === row.application_id)?.status
    )
  ).length;

  const incompleteCommission = Math.max(
    0,
    commissionPoolCount - completeBeforePublish
  );

  const boundaryTie = preview.some((row) => row.boundary_tie === true);
  const intakeClosed = cycle?.status === "applications_closed";
  const published = cycle?.status === "results_published";

  const canPublish =
    intakeClosed &&
    activeCommissionCount > 0 &&
    submittedWaiting === 0 &&
    incompleteCommission === 0 &&
    preview.length > 0 &&
    !boundaryTie;

  const appealWindowOpen = rows.some(
    (row) =>
      row.appeal_deadline && new Date(row.appeal_deadline).getTime() > Date.now()
  );

  const canRepublish =
    published &&
    !appealWindowOpen &&
    activeCommissionCount > 0 &&
    submittedWaiting === 0 &&
    incompleteCommission === 0 &&
    preview.length > 0 &&
    !boundaryTie;

  const closeIntake = async () => {
    if (busy) return;
    setBusy(true);
    onError?.("");

    const { error } = await supabase.rpc("close_competition_intake", {
      p_cycle_id: CYCLE_ID,
    });

    setBusy(false);

    if (error) {
      onError?.(error.message);
      return;
    }

    onToast?.("Приём новых заявок завершён.");
    await loadState();
  };

  const reopenIntake = async () => {
    if (busy) return;
    setBusy(true);
    onError?.("");

    const { error } = await supabase.rpc("reopen_competition_intake", {
      p_cycle_id: CYCLE_ID,
    });

    setBusy(false);

    if (error) {
      onError?.(error.message);
      return;
    }

    onToast?.("Приём заявок снова открыт.");
    await loadState();
  };

  const dispatchResultNotifications = async ({ retryFailed = false } = {}) => {
    let guard = 0;
    let lastRemaining = null;
    let aggregateSent = 0;
    let aggregateFailed = 0;

    while (guard < 200) {
      guard += 1;

      const { data, error } = await supabase.functions.invoke("telegram-notify", {
        body: {
          competition_results: true,
          retry_failed: retryFailed,
          limit: 15,
        },
      });

      if (error) {
        throw error;
      }

      aggregateSent += Number(data?.batch_sent || 0);
      aggregateFailed += Number(data?.batch_failed || 0);

      const serverDelivery = {
        pending: Number(data?.pending || 0),
        failed: Number(data?.failed || 0),
        sent: Number(data?.sent || 0),
      };

      setDelivery(serverDelivery);

      const serverRemaining = retryFailed
        ? serverDelivery.failed
        : serverDelivery.pending;

      if (serverRemaining === 0) break;

      if (lastRemaining !== null && serverRemaining >= lastRemaining) {
        // Нет прогресса: не зацикливаем браузер. Ошибки остаются в очереди.
        break;
      }

      lastRemaining = serverRemaining;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    await loadState();
    return { sent: aggregateSent, failed: aggregateFailed };
  };

  const publishResults = async () => {
    if (busy || (published ? !canRepublish : !canPublish)) return;

    setBusy(true);
    setConfirmPublish(false);
    onError?.("");

    const { data, error } = await supabase.rpc("publish_competition_results", {
      p_cycle_id: CYCLE_ID,
    });

    if (error) {
      setBusy(false);
      onError?.(error.message);
      return;
    }

    await reloadApplications?.();
    await loadState();

    try {
      const deliveryResult = await dispatchResultNotifications();

      if (deliveryResult.failed > 0) {
        onToast?.(
          `${published ? "Финальные итоги пересчитаны" : "Итоги опубликованы"}. Часть Telegram-сообщений осталась с ошибкой — их можно повторить.`
        );
      } else {
        onToast?.(
          `${published ? "Финальные итоги пересчитаны" : "Итоги опубликованы"}. Telegram-рассылка запущена автоматически. Гранты: ${data?.grant ?? 0}, стипендии: ${data?.scholarship ?? 0}, Top-30: ${data?.top30 ?? 0}.`
        );
      }
    } catch (dispatchError) {
      onError?.(
        `Итоги опубликованы, но автоматическая Telegram-рассылка не завершилась: ${dispatchError?.message || dispatchError}`
      );
    } finally {
      setBusy(false);
      await loadState();
    }
  };

  const continuePending = async () => {
    if (busy) return;
    setBusy(true);
    onError?.("");

    try {
      await dispatchResultNotifications();
      onToast?.("Отправка ожидающих Telegram-уведомлений завершена.");
    } catch (dispatchError) {
      onError?.(dispatchError?.message || "Не удалось продолжить рассылку.");
    } finally {
      setBusy(false);
      await loadState();
    }
  };

  const retryFailed = async () => {
    if (busy) return;
    setBusy(true);
    onError?.("");

    try {
      const { error: resetError } = await supabase
        .from("notifications")
        .update({ status: "pending" })
        .eq("channel", "telegram")
        .in("event_type", ["competition_result", "competition_final_rejected"])
        .eq("status", "failed");

      if (resetError) throw resetError;

      await dispatchResultNotifications();
      onToast?.("Повторная отправка Telegram-уведомлений завершена.");
    } catch (retryError) {
      onError?.(retryError?.message || "Не удалось повторить рассылку.");
    } finally {
      setBusy(false);
      await loadState();
    }
  };

  return (
    <>
      {confirmPublish && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-block border border-line bg-bg-2 p-6 shadow-2xl lg:p-8">
            <p className="text-xs uppercase tracking-[0.08em] text-accent">
              Финальное действие
            </p>
            <h3 className="mt-3 font-display text-2xl font-bold text-ink">
              {published
                ? "Финализировать итоги после апелляций?"
                : "Опубликовать итоги конкурса?"}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {published
                ? "Система повторно рассчитает рейтинг с учётом удовлетворённых апелляций. Новый срок апелляции не откроется."
                : "После подтверждения результаты будут зафиксированы в заявках, участникам откроется окно апелляций на три рабочих дня и начнётся персональная Telegram-рассылка."}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmPublish(false)}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={publishResults}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {published ? "Да, финализировать" : "Да, опубликовать итоги"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mb-8 rounded-block border border-accent/30 bg-accent/5 p-5 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-accent">
              Итоги конкурса · {CYCLE_ID}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">
              Завершение конкурса и рассылка результатов
            </h2>
            <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-ink-2">
              Система формирует предварительный рейтинг по среднему баллу всех
              активных экспертов. Публикация фиксирует 10 грантов, 30 стипендий,
              Top-30 резервного списка и результаты остальных участников.
            </p>
          </div>

          <div className="shrink-0 rounded-full border border-line bg-bg px-4 py-2 text-sm font-medium text-ink">
            {loading ? "Загрузка…" : CYCLE_LABELS[cycle?.status] || "Не настроено"}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Активных экспертов" value={activeCommissionCount} />
          <Stat label="Гранты" value={grouped.grant.length} note="квота 10" />
          <Stat
            label="Стипендии"
            value={grouped.scholarship.length}
            note="квота 30"
          />
          <Stat label="Top-30" value={grouped.top30.length} note="резерв" />
          <Stat label="Не прошли" value={grouped.not_selected.length} />
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div
            className={`rounded-2xl border p-4 text-sm ${
              submittedWaiting
                ? "border-red-400/40 bg-red-400/5 text-ink"
                : "border-line bg-bg text-ink-2"
            }`}
          >
            <strong className="text-ink">Административная проверка:</strong>{" "}
            {submittedWaiting
              ? `${submittedWaiting} заявок ещё требуют решения/доработки.`
              : "Незавершённых заявок нет."}
          </div>

          <div
            className={`rounded-2xl border p-4 text-sm ${
              incompleteCommission
                ? "border-red-400/40 bg-red-400/5 text-ink"
                : "border-line bg-bg text-ink-2"
            }`}
          >
            <strong className="text-ink">Комиссия:</strong>{" "}
            {incompleteCommission
              ? `${incompleteCommission} заявок оценены не всеми активными экспертами.`
              : "Все переданные комиссии заявки завершены."}
          </div>

          <div
            className={`rounded-2xl border p-4 text-sm ${
              boundaryTie
                ? "border-amber-400/50 bg-amber-400/5 text-ink"
                : "border-line bg-bg text-ink-2"
            }`}
          >
            <strong className="text-ink">Граница квоты:</strong>{" "}
            {boundaryTie
              ? "Есть одинаковые баллы на границе места. Публикация заблокирована до утверждения правила ничьей."
              : "Конфликта одинаковых баллов на границе квот нет."}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!published && cycle?.status === "open" && (
            <button
              type="button"
              disabled={busy}
              onClick={closeIntake}
              className="rounded-full border border-line bg-bg px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Завершить приём заявок
            </button>
          )}

          {!published && intakeClosed && (
            <button
              type="button"
              disabled={busy}
              onClick={reopenIntake}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-50"
            >
              Возобновить приём
            </button>
          )}

          <button
            type="button"
            disabled={busy || preview.length === 0}
            onClick={() => setPreviewVisible((value) => !value)}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {previewVisible ? "Скрыть предварительные итоги" : "Сформировать предварительные итоги"}
          </button>

          {!published && (
            <button
              type="button"
              disabled={busy || !canPublish}
              onClick={() => setConfirmPublish(true)}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              Опубликовать итоги
            </button>
          )}

          {published && (
            <button
              type="button"
              disabled={busy || !canRepublish}
              onClick={() => setConfirmPublish(true)}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              Финализировать после апелляций
            </button>
          )}
        </div>

        {!published && !canPublish && intakeClosed && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Кнопка публикации станет доступна, когда все рабочие заявки получат
            административное решение, все активные эксперты завершат оценивание и
            не будет ничьей на границе квоты.
          </p>
        )}


        {published && !canRepublish && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Финализация станет доступна после завершения трёхдневного срока,
            рассмотрения всех апелляций и повторной оценки удовлетворённых заявок.
          </p>
        )}

        {previewVisible && (
          <div className="mt-7 grid gap-4 xl:grid-cols-2">
            <ResultList title={DECISION_LABELS.grant} rows={grouped.grant} />
            <ResultList
              title={DECISION_LABELS.scholarship}
              rows={grouped.scholarship}
            />
            <ResultList title={DECISION_LABELS.top30} rows={grouped.top30} />
            <ResultList
              title={DECISION_LABELS.not_selected}
              rows={grouped.not_selected}
            />
          </div>
        )}

        {published && (
          <div className="mt-7 rounded-2xl border border-line bg-bg p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted">
                  Telegram-рассылка результатов
                </p>
                <p className="mt-2 text-sm text-ink-2">
                  Итоги опубликованы {formatDate(cycle?.results_published_at)}.
                  Неотправленные сообщения сохраняются в очереди и не теряются.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {delivery.pending > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={continuePending}
                    className="rounded-full border border-accent px-5 py-2.5 text-sm font-medium text-accent transition hover:bg-accent hover:text-on-accent disabled:opacity-50"
                  >
                    Продолжить рассылку
                  </button>
                )}

                {delivery.failed > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={retryFailed}
                    className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Повторить ошибки
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat label="Отправлено" value={delivery.sent} />
              <Stat label="Ожидает" value={delivery.pending} />
              <Stat label="Ошибка" value={delivery.failed} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
