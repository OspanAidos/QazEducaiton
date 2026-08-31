import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

const STATUS_LABELS = {
  submitted: "Подана",
  under_review: "На рассмотрении",
  satisfied: "Удовлетворена",
  rejected: "Отклонена",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AppealsPanel({ rows, reloadApplications, onToast, onError }) {
  const [appeals, setAppeals] = useState([]);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );

  const loadAppeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("appeals")
      .select("id,application_id,user_id,reason,status,response,submitted_at,resolved_at,reviewed_by")
      .order("submitted_at", { ascending: false });

    if (error) {
      onError?.(
        error.message ||
          "Не удалось загрузить апелляции. Выполните миграцию appeals-v1.sql."
      );
      setAppeals([]);
    } else {
      setAppeals(data || []);
      setResponses(
        Object.fromEntries((data || []).map((appeal) => [appeal.id, appeal.response || ""]))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAppeals();
  }, []);

  const requestResolution = (appeal, resolution) => {
    const response = (responses[appeal.id] || "").trim();
    if (["satisfied", "rejected"].includes(resolution) && response.length < 10) {
      onError?.("Добавьте мотивированный ответ длиной не менее 10 символов.");
      return;
    }
    onError?.("");
    setPendingAction({ appeal, resolution, response });
  };

  const resolveAppeal = async () => {
    if (!pendingAction || busyId) return;
    const { appeal, resolution, response } = pendingAction;
    setBusyId(appeal.id);

    const { error } = await supabase.rpc("resolve_appeal", {
      p_appeal_id: appeal.id,
      p_status: resolution,
      p_response: response || null,
    });

    setBusyId(null);
    setPendingAction(null);

    if (error) {
      onError?.(error.message);
      return;
    }

    onToast?.(
      resolution === "under_review"
        ? "Апелляция взята в работу."
        : resolution === "satisfied"
          ? "Апелляция удовлетворена, заявка возвращена на пересмотр."
          : "Апелляция отклонена, ответ сохранён."
    );
    await Promise.all([loadAppeals(), reloadApplications?.()]);
  };

  const openCount = appeals.filter((appeal) =>
    ["submitted", "under_review"].includes(appeal.status)
  ).length;

  return (
    <details className="mb-8 rounded-block border border-line bg-bg-2" open={openCount > 0}>
      <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg font-bold text-ink sm:px-6">
        Апелляции
        <span className="ml-3 text-sm font-normal text-muted">
          открытых: {openCount}
        </span>
      </summary>

      <div className="border-t border-line p-5 sm:p-6">
        {loading ? (
          <p className="text-sm text-muted">Загружаем апелляции…</p>
        ) : appeals.length ? (
          <div className="grid gap-4">
            {appeals.map((appeal) => {
              const application = rowsById.get(appeal.application_id);
              const fullName = [application?.profile?.last_name, application?.profile?.first_name]
                .filter(Boolean)
                .join(" ");
              const resolved = ["satisfied", "rejected"].includes(appeal.status);

              return (
                <article key={appeal.id} className="rounded-2xl border border-line bg-bg p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-base font-bold text-ink">
                        {application?.number || "Заявка"} · {fullName || "Участник"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Подана: {formatDate(appeal.submitted_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                      {STATUS_LABELS[appeal.status] || appeal.status}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-line bg-bg-2 p-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-muted">
                      Доводы участника
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {appeal.reason}
                    </p>
                  </div>

                  <label className="mt-4 grid gap-2 text-sm text-ink">
                    Мотивированный ответ
                    <textarea
                      rows={4}
                      disabled={resolved || busyId === appeal.id}
                      value={responses[appeal.id] || ""}
                      onChange={(event) =>
                        setResponses((current) => ({
                          ...current,
                          [appeal.id]: event.target.value,
                        }))
                      }
                      className="w-full resize-y rounded-xl border border-line bg-bg-2 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent disabled:opacity-70"
                      placeholder="Опишите принятое решение и его основание…"
                    />
                  </label>

                  {!resolved && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {appeal.status === "submitted" && (
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => requestResolution(appeal, "under_review")}
                          className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-ink disabled:opacity-50"
                        >
                          Взять в работу
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => requestResolution(appeal, "satisfied")}
                        className="rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
                      >
                        Удовлетворить
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => requestResolution(appeal, "rejected")}
                        className="rounded-full border border-red-400/50 px-4 py-2 text-sm text-red-400 disabled:opacity-50"
                      >
                        Отклонить
                      </button>
                    </div>
                  )}

                  {resolved && appeal.resolved_at && (
                    <p className="mt-3 text-xs text-muted">
                      Решение: {formatDate(appeal.resolved_at)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">Поданных апелляций пока нет.</p>
        )}
      </div>

      {pendingAction && (
        <div className="border-t border-accent/40 bg-accent/5 p-5 sm:p-6">
          <p className="font-medium text-ink">Подтвердите действие</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Решение будет сохранено в журнале, участник увидит статус и ответ в личном кабинете.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={resolveAppeal}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              Подтвердить
            </button>
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => setPendingAction(null)}
              className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
