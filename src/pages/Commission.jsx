import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { useAuth } from "../auth-context.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

const STATUS_LABELS = {
  evaluation: "На оценке комиссии",
  final: "Финальный этап",
  result: "Результат опубликован",
};

const DOC_LABELS = {
  performance: "Аттестат / транскрипт / сведения об успеваемости",
  academic_record: "Аттестат / транскрипт / сведения об успеваемости",
  ent: "Сертификат / балл ЕНТ",
  other: "Прочие документы",
  additional: "Прочие документы",
};

const PERSONAL_DOC_KINDS = new Set([
  "identity",
  "birth_certificate",
  "guardian_identity",
  "guardian_consent",
]);


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

function criteriaForSupport(supportType) {
  return COMMISSION_CRITERIA[supportType] ?? [];
}

function emptyCriteriaScores() {
  return {
    academic: "",
    motivation: "",
    achievements: "",
    social_activity: "",
    social_need: "",
  };
}

function criterionError(criterion, raw) {
  if (raw === "" || raw === null || raw === undefined) return "";

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return "Введите числовое значение.";
  }

  if (value < 0) {
    return "Балл не может быть отрицательным.";
  }

  if (value > criterion.max) {
    return `Максимально допустимый балл: ${criterion.max}.`;
  }

  return "";
}

function hasCriteriaErrors(criteria, values) {
  return criteria.some(
    (criterion) => Boolean(criterionError(criterion, values[criterion.key]))
  );
}

function calculateTotal(criteria, values) {
  return criteria.reduce((sum, criterion) => {
    const raw = values[criterion.key];
    const value = raw === "" ? 0 : Number(raw);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > criterion.max
    ) {
      return sum;
    }

    return sum + value;
  }, 0);
}

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

function supportLabel(value) {
  if (value === "grant") return "Образовательный грант";
  if (value === "scholarship") return "Стипендия";
  return value || "—";
}

export default function Commission() {
  const { user, signOut } = useAuth();

  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [scoreDraft, setScoreDraft] = useState({
    criteria: emptyCriteriaScores(),
    comment: "",
  });

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadRows = async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    const [applicationsRes, documentsRes, scoresRes] = await Promise.all([
      supabase.rpc("get_commission_applications"),
      supabase
        .from("application_documents")
        .select(
          "id,application_id,kind,storage_path,file_name,file_size,created_at"
        )
        .not(
          "kind",
          "in",
          "(identity,birth_certificate,guardian_identity,guardian_consent)"
        ),
      supabase
        .from("commission_scores")
        .select(
          "application_id,reviewer_id,score,criteria_scores,comment,evaluated_at,updated_at"
        )
        .eq("reviewer_id", user.id),
    ]);

    if (applicationsRes.error) {
      setError(applicationsRes.error.message);
      setLoading(false);
      return;
    }

    const documents = documentsRes.error ? [] : documentsRes.data ?? [];
    const scores = scoresRes.error ? [] : scoresRes.data ?? [];

    const docsByApplication = new Map();
    documents.forEach((doc) => {
      const list = docsByApplication.get(doc.application_id) ?? [];
      list.push(doc);
      docsByApplication.set(doc.application_id, list);
    });

    const scoreByApplication = new Map(
      scores.map((item) => [item.application_id, item])
    );

    const joined = (applicationsRes.data ?? []).map((application) => ({
      ...application,
      documents: docsByApplication.get(application.application_id) ?? [],
      myScore: scoreByApplication.get(application.application_id) ?? null,
    }));

    setRows(joined);

    if (selectedId && !joined.some((row) => row.application_id === selectedId)) {
      setSelectedId(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadRows();
  }, [user]);

  const selected =
    rows.find((row) => row.application_id === selectedId) ?? null;

  useEffect(() => {
    const saved = selected?.myScore?.criteria_scores ?? {};

    setScoreDraft({
      criteria: {
        ...emptyCriteriaScores(),
        ...Object.fromEntries(
          Object.entries(saved).map(([key, value]) => [
            key,
            value === null || value === undefined ? "" : String(value),
          ])
        ),
      },
      comment: selected?.myScore?.comment ?? "",
    });
  }, [selectedId, selected?.myScore?.updated_at]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      const isScored = row.myScore?.score !== null && row.myScore?.score !== undefined;

      if (filter === "pending" && isScored) return false;
      if (filter === "scored" && !isScored) return false;

      if (!needle) return true;

      return [
        row.number,
        row.category,
        row.support_type,
        row.university,
        row.specialty,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search, filter]);

  const scoredCount = rows.filter(
    (row) => row.myScore?.score !== null && row.myScore?.score !== undefined
  ).length;

  const openDocument = async (doc) => {
    if (PERSONAL_DOC_KINDS.has(doc.kind)) {
      setError("Персональные документы недоступны членам комиссии.");
      return;
    }

    setError("");

    const { data, error: signedError } = await supabase.storage
      .from("application-docs")
      .createSignedUrl(doc.storage_path, 60 * 10);

    if (signedError || !data?.signedUrl) {
      setError(
        signedError?.message ||
          "Не удалось открыть документ. Проверьте права комиссии."
      );
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const saveScore = async () => {
    if (!selected || !user) return;

    const criteria = criteriaForSupport(selected.support_type);

    if (!criteria.length) {
      setError("Для этой заявки не определён вид поддержки.");
      return;
    }

    const normalized = {};
    for (const criterion of criteria) {
      const raw = scoreDraft.criteria[criterion.key];

      if (raw === "") {
        setError(`Укажите балл по критерию «${criterion.label}».`);
        return;
      }

      const value = Number(raw);
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > criterion.max
      ) {
        setError(
          `По критерию «${criterion.label}» балл должен быть от 0 до ${criterion.max}.`
        );
        return;
      }

      normalized[criterion.key] = value;
    }

    if (selected.status === "result") {
      setError("Результат уже опубликован. Оценка доступна только для чтения.");
      return;
    }

    const total = calculateTotal(criteria, normalized);

    setBusy(true);
    setError("");

    const payload = {
      application_id: selected.application_id,
      reviewer_id: user.id,
      criteria_scores: normalized,
      score: total,
      comment: scoreDraft.comment.trim() || null,
      evaluated_at: new Date().toISOString(),
    };

    const { error: saveError } = await supabase
      .from("commission_scores")
      .upsert(payload, {
        onConflict: "application_id,reviewer_id",
      });

    if (saveError) {
      setError(saveError.message);
      setBusy(false);
      return;
    }

    await loadRows();
    setBusy(false);
    setToast(`Оценка сохранена. Итоговый балл: ${total} из 100.`);
  };

  return (
    <>
      <ActionToast message={toast} />
      <PageHead
        label="конкурсная комиссия"
        title="Панель комиссии"
        lead="Мотивационные письма, учебные документы и независимая оценка заявок."
      >
        <div className="mt-9">
          <button
            type="button"
            onClick={signOut}
            className="px-2 text-sm text-ink-2 underline underline-offset-4 transition-colors duration-300 hover:text-ink"
          >
            Выйти
          </button>
        </div>
      </PageHead>

      <Section>
        <div className="rounded-block border border-accent/40 bg-bg-2 p-5">
          <p className="text-sm font-medium text-ink">
            Персональные документы защищены.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Удостоверение личности не отображается в панели и недоступно
            аккаунтам комиссии на уровне базы данных и приватного Storage.
            Другие члены комиссии также не видят вашу оценку.
          </p>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/5 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Все · {rows.length}
            </FilterButton>
            <FilterButton
              active={filter === "pending"}
              onClick={() => setFilter("pending")}
            >
              Не оценены · {rows.length - scoredCount}
            </FilterButton>
            <FilterButton
              active={filter === "scored"}
              onClick={() => setFilter("scored")}
            >
              Оценены · {scoredCount}
            </FilterButton>
          </div>

          <p className="text-sm text-muted">
            Моя работа: {scoredCount} из {rows.length}
          </p>
        </div>

        <div className="mt-5">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по № заявки, категории, вузу или специальности…"
            className="w-full rounded-2xl border border-line bg-bg-2 px-4 py-3 text-base text-ink outline-none transition focus:border-accent"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted">
            Загружаем заявки…
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-block border border-line">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-bg-2">
                <tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted">
                  <th className="px-4 py-3">Заявка</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3">Поддержка</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Моя оценка</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.application_id}
                    onClick={() => setSelectedId(row.application_id)}
                    className={`cursor-pointer border-b border-line transition last:border-0 hover:bg-bg-2 ${
                      selectedId === row.application_id ? "bg-bg-2" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-display text-sm font-medium text-ink">
                      {row.number}
                    </td>
                    <td className="px-4 py-4 text-sm text-ink-2">
                      {row.category || "—"}
                    </td>
                    <td className="px-4 py-4 text-sm text-ink-2">
                      {supportLabel(row.support_type)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-4 font-display text-sm font-medium text-ink">
                      {row.myScore?.score ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredRows.length && (
              <div className="px-6 py-12 text-center text-sm text-muted">
                Заявок по выбранному фильтру нет.
              </div>
            )}
          </div>
        )}

        {selected && (
          <ApplicationReview
            row={selected}
            scoreDraft={scoreDraft}
            setScoreDraft={setScoreDraft}
            openDocument={openDocument}
            saveScore={saveScore}
            busy={busy}
          />
        )}
      </Section>
    </>
  );
}

function ApplicationReview({
  row,
  scoreDraft,
  setScoreDraft,
  openDocument,
  saveScore,
  busy,
}) {
  const readOnly = row.status === "result";
  const criteria = criteriaForSupport(row.support_type);
  const scoreHasErrors = hasCriteriaErrors(criteria, scoreDraft.criteria);
  const currentTotal = calculateTotal(criteria, scoreDraft.criteria);

  return (
    <section className="mt-10 rounded-block border border-line bg-bg-2 p-6 lg:p-9">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted">
            Заявка
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
            {row.number}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            {row.category || "Категория не указана"} ·{" "}
            {supportLabel(row.support_type)}
          </p>
        </div>

        <StatusBadge status={row.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Данные для оценки
          </h3>

          <dl className="mt-4 divide-y divide-line border-y border-line">
            <DetailRow label="Дата подачи" value={formatDate(row.submitted_at)} />
            <DetailRow
              label="Вид поддержки"
              value={supportLabel(row.support_type)}
            />
            <DetailRow label="Университет" value={row.university || "—"} />
            <DetailRow label="Специальность" value={row.specialty || "—"} />
          </dl>
        </div>

        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Документы · {row.documents.length}
          </h3>

          <div className="mt-4 grid gap-3">
            {row.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {DOC_LABELS[doc.kind] ?? "Документ"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {doc.file_name ?? "Файл"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openDocument(doc)}
                  className="shrink-0 rounded-full border border-line px-3 py-2 text-xs text-ink transition hover:border-accent hover:text-accent"
                >
                  Открыть
                </button>
              </div>
            ))}

            {!row.documents.length && (
              <p className="text-sm text-muted">
                Доступных комиссии документов нет.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <p className="text-xs uppercase tracking-[0.08em] text-muted">
          Мотивационное письмо
        </p>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-line bg-bg px-5 py-5 text-base leading-relaxed text-ink">
          {row.motivation?.trim() || "Мотивационное письмо не заполнено."}
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h3 className="font-display text-lg font-bold text-ink">
          Оценка по критериям
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Заполните каждый критерий. Итоговый балл рассчитывается автоматически.
          Оценки других членов комиссии вам не показываются.
        </p>

        {!criteriaForSupport(row.support_type).length && (
          <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/5 p-4 text-sm text-ink">
            Для этой заявки не указан вид поддержки. Верните заявку администратору:
            участник должен выбрать «Грант» или «Стипендия» до передачи комиссии.
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {criteria.map((criterion) => {
            const value = scoreDraft.criteria[criterion.key] ?? "";
            const fieldError = criterionError(criterion, value);

            return (
              <label
                key={criterion.key}
                className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_170px] sm:items-center ${
                  fieldError
                    ? "border-red-400/70 bg-red-400/5"
                    : "border-line bg-bg"
                }`}
              >
                <div>
                  <span className="block text-sm font-medium text-ink">
                    {criterion.label}
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      fieldError ? "text-red-300" : "text-muted"
                    }`}
                  >
                    {fieldError || `Максимум: ${criterion.max} баллов`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={criterion.max}
                    step="0.01"
                    disabled={readOnly}
                    aria-invalid={Boolean(fieldError)}
                    value={value}
                    onChange={(event) =>
                      setScoreDraft((current) => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          [criterion.key]: event.target.value,
                        },
                      }))
                    }
                    className={`w-full rounded-xl border bg-bg-2 px-3 py-2.5 text-base text-ink outline-none disabled:opacity-60 ${
                      fieldError
                        ? "border-red-400 text-red-200 focus:border-red-300"
                        : "border-line focus:border-accent"
                    }`}
                  />
                  <span
                    className={`shrink-0 text-sm ${
                      fieldError ? "text-red-300" : "text-muted"
                    }`}
                  >
                    / {criterion.max}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div
          className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${
            scoreHasErrors
              ? "border-red-400/70 bg-red-400/5"
              : "border-accent/40 bg-accent/5"
          }`}
        >
          <div>
            <span className="text-sm font-medium text-ink">
              Итоговый балл
            </span>
            {scoreHasErrors && (
              <p className="mt-1 text-xs text-red-300">
                Исправьте значения, выделенные красным. Итог не может превышать 100.
              </p>
            )}
          </div>
          <span
            className={`font-display text-2xl font-bold ${
              scoreHasErrors ? "text-red-300" : "text-accent"
            }`}
          >
            {scoreHasErrors ? "Ошибка" : `${currentTotal} / 100`}
          </span>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-sm text-ink-2">
            Комментарий комиссии
          </span>
          <textarea
            rows="5"
            disabled={readOnly}
            value={scoreDraft.comment}
            onChange={(event) =>
              setScoreDraft((current) => ({
                ...current,
                comment: event.target.value,
              }))
            }
            placeholder="При необходимости укажите обоснование оценки."
            className="resize-y rounded-2xl border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-accent disabled:opacity-60"
          />
        </label>

        {!readOnly && (
          <button
            type="button"
            disabled={busy || scoreHasErrors}
            onClick={saveScore}
            className="mt-4 rounded-full border border-accent bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Сохраняем…" : "Сохранить оценку"}
          </button>
        )}

        {readOnly && (
          <p className="mt-4 text-sm text-muted">
            Результат конкурса опубликован. Оценка зафиксирована.
          </p>
        )}
      </div>
    </section>
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

function StatusBadge({ status }) {
  return (
    <span className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs text-ink-2">
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="text-sm leading-relaxed text-ink">{value}</dd>
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
