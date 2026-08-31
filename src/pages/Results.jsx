import { useEffect, useMemo, useState } from "react";
import { useLang } from "../lang-context.jsx";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { PageHead, Section } from "../components/page-blocks.jsx";

const copy = {
  ru: {
    label: "конкурс 2026",
    title: "Результаты конкурса.",
    lead: "Публикуем только номер заявки и результат — без ФИО, телефона и других персональных данных.",
    loading: "Проверяем публикацию результатов…",
    pending: "Результаты ещё не опубликованы.",
    pendingText: "После решения комиссии список появится на этой странице. Личное решение также будет доступно в кабинете участника.",
    error: "Не удалось загрузить результаты. Попробуйте обновить страницу позже.",
    application: "Номер заявки",
    decision: "Результат",
    published: "Опубликовано",
    labels: {
      grant: "Образовательный грант",
      scholarship: "Стипендия",
      top30: "Top-30",
      not_selected: "Не прошёл конкурс",
    },
  },
  kk: {
    label: "2026 конкурсы",
    title: "Конкурс нәтижелері.",
    lead: "Аты-жөнін, телефон нөмірін және басқа дербес деректерді көрсетпей, тек өтінім нөмірі мен нәтижені жариялаймыз.",
    loading: "Нәтижелердің жариялануын тексеріп жатырмыз…",
    pending: "Нәтижелер әлі жарияланған жоқ.",
    pendingText: "Комиссия шешімінен кейін тізім осы бетте пайда болады. Жеке нәтиже қатысушы кабинетінде де қолжетімді болады.",
    error: "Нәтижелерді жүктеу мүмкін болмады. Бетті кейінірек жаңартып көріңіз.",
    application: "Өтінім нөмірі",
    decision: "Нәтиже",
    published: "Жарияланды",
    labels: {
      grant: "Білім беру гранты",
      scholarship: "Стипендия",
      top30: "Top-30",
      not_selected: "Конкурстан өтпеді",
    },
  },
};

function formatDate(value, lang) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(lang === "kk" ? "kk-KZ" : "ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function Results() {
  const lang = useLang();
  const t = copy[lang] || copy.ru;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(true);
      setLoading(false);
      return undefined;
    }

    let active = true;
    supabase.rpc("get_public_competition_results", { p_cycle_id: 2026 }).then(({ data, error: queryError }) => {
      if (!active) return;
      setRows(queryError ? [] : data || []);
      setError(Boolean(queryError));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () =>
      rows.reduce((result, row) => {
        result[row.decision] = (result[row.decision] || 0) + 1;
        return result;
      }, {}),
    [rows]
  );

  return (
    <>
      <PageHead label={t.label} title={t.title} lead={t.lead} />
      <Section>
        {loading ? (
          <p className="text-sm text-muted">{t.loading}</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-400/5 p-5 text-sm text-ink">
            {t.error}
          </div>
        ) : !rows.length ? (
          <div className="rounded-block border border-line bg-bg-2 p-7 lg:p-9">
            <h2 className="font-display text-2xl font-bold text-ink">{t.pending}</h2>
            <p className="mt-3 max-w-[70ch] leading-relaxed text-ink-2">{t.pendingText}</p>
          </div>
        ) : (
          <>
            <div className="mb-7 grid gap-3 sm:grid-cols-3">
              {["grant", "scholarship", "top30"].map((decision) => (
                <div key={decision} className="rounded-2xl border border-line bg-bg-2 p-5">
                  <p className="font-display text-3xl font-bold text-accent">
                    {counts[decision] || 0}
                  </p>
                  <p className="mt-2 text-sm text-ink-2">{t.labels[decision]}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-block border border-line bg-bg-2">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted">
                    <th className="px-5 py-4">{t.application}</th>
                    <th className="px-5 py-4">{t.decision}</th>
                    <th className="px-5 py-4">{t.published}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.application_number} className="border-b border-line last:border-0">
                      <td className="px-5 py-4 font-display font-bold text-ink">
                        {row.application_number}
                      </td>
                      <td className="px-5 py-4 text-ink-2">
                        {t.labels[row.decision] || row.decision}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted">
                        {formatDate(row.published_at, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
