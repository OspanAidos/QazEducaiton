import { useEffect, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { useAuth } from "../auth-context.jsx";
import { useLang } from "../lang-context.jsx";
import { supabase } from "../supabase.js";
import { PageHead, Section } from "../components/page-blocks.jsx";
import { Button } from "../components/ui.jsx";

const copy = {
  ru: {
    label: "апелляция",
    title: "Подать апелляцию.",
    lead: "Апелляция рассматривает соблюдение процедуры конкурса. Она не является повторной экспертной оценкой заявки.",
    reason: "Основание апелляции",
    hint: "Опишите конкретное процедурное нарушение: этап, дату и обстоятельства. От 50 до 4 000 символов.",
    submit: "Отправить апелляцию",
    pending: "Отправляем…",
    unavailable: "Срок подачи апелляции истёк либо текущий статус заявки не позволяет её подать.",
    min: "Опишите основание подробнее — минимум 50 символов.",
    success: "Апелляция зарегистрирована.",
    successText: "Статус и ответ апелляционной комиссии появятся на этой странице.",
    existing: "Ваша апелляция",
    response: "Ответ апелляционной комиссии",
    status: {
      submitted: "Подана",
      under_review: "На рассмотрении",
      satisfied: "Удовлетворена",
      rejected: "Отклонена",
    },
    back: "В личный кабинет",
  },
  kk: {
    label: "апелляция",
    title: "Апелляция беру.",
    lead: "Апелляция конкурс рәсімінің сақталуын қарастырады. Ол өтінімді қайта сараптамалық бағалау болып табылмайды.",
    reason: "Апелляция негізі",
    hint: "Нақты рәсімдік бұзушылықты, кезеңді, күнді және мән-жайды сипаттаңыз. 50-ден 4 000 таңбаға дейін.",
    submit: "Апелляцияны жіберу",
    pending: "Жіберілуде…",
    unavailable: "Апелляция беру мерзімі аяқталды немесе өтінімнің ағымдағы мәртебесі оны беруге мүмкіндік бермейді.",
    min: "Негізді толығырақ жазыңыз — кемінде 50 таңба.",
    success: "Апелляция тіркелді.",
    successText: "Апелляциялық комиссияның мәртебесі мен жауабы осы бетте көрсетіледі.",
    existing: "Сіздің апелляцияңыз",
    response: "Апелляциялық комиссияның жауабы",
    status: {
      submitted: "Берілді",
      under_review: "Қаралуда",
      satisfied: "Қанағаттандырылды",
      rejected: "Қабылданбады",
    },
    back: "Жеке кабинетке",
  },
};

export default function Appeal() {
  const lang = useLang();
  const t = copy[lang] || copy.ru;
  const { user, application, refreshApplication } = useAuth();
  const [appeal, setAppeal] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    let active = true;
    supabase
      .from("appeals")
      .select("id,reason,status,response,submitted_at,resolved_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setAppeal(data || null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  if (!user || loading) return null;

  const deadline = application?.appeal_deadline
    ? new Date(application.appeal_deadline).getTime()
    : 0;
  const available =
    !appeal &&
    ["result", "rejected"].includes(application?.status) &&
    deadline > Date.now();

  const submit = async (event) => {
    event.preventDefault();
    const normalized = reason.trim();

    if (normalized.length < 50) {
      setError(t.min);
      return;
    }

    setBusy(true);
    setError("");

    const { data, error: submitError } = await supabase.rpc(
      "submit_own_appeal",
      { p_reason: normalized }
    );

    setBusy(false);

    if (submitError) {
      setError(submitError.message || t.unavailable);
      return;
    }

    setAppeal(data || { reason: normalized, status: "submitted" });
    await refreshApplication();
  };

  return (
    <>
      <PageHead label={t.label} title={t.title} lead={t.lead} />
      <Section>
        <div className="max-w-2xl">
          {appeal ? (
            <div className="rounded-block border border-accent/40 bg-accent/5 p-6 sm:p-8">
              <CheckCircle size={30} weight="fill" className="text-accent" />
              <p className="mt-5 font-display text-xl font-bold text-ink">
                {t.existing}: {t.status[appeal.status] || appeal.status}
              </p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                {appeal.reason}
              </p>
              {appeal.response && (
                <div className="mt-6 border-t border-line pt-6">
                  <p className="text-xs uppercase tracking-[0.08em] text-muted">
                    {t.response}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {appeal.response}
                  </p>
                </div>
              )}
              <Button to="/profile" className="mt-6">
                {t.back}
              </Button>
            </div>
          ) : available ? (
            <form onSubmit={submit} className="rounded-block border border-line bg-bg-2 p-6 sm:p-8">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">{t.reason}</span>
                <span className="text-sm leading-relaxed text-muted">{t.hint}</span>
                <textarea
                  rows={10}
                  maxLength={4000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-2 w-full resize-y rounded-2xl border border-line bg-bg px-4 py-3 text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <p className="mt-2 text-right text-xs text-muted">{reason.length} / 4000</p>
              {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-medium text-on-accent disabled:opacity-50"
              >
                {busy ? t.pending : t.submit}
              </button>
            </form>
          ) : (
            <div className="rounded-block border border-line bg-bg-2 p-6 sm:p-8">
              <p className="text-base leading-relaxed text-ink-2">{t.unavailable}</p>
              <Button to="/profile" className="mt-6">{t.back}</Button>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
