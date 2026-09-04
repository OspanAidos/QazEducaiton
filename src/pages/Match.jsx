import { useEffect, useState } from "react";
import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { media } from "../media.js";
import { Field, SubmitButton } from "../components/form.jsx";
import { Button } from "../components/ui.jsx";
import PaymentCheckout from "../components/PaymentCheckout.jsx";
import { useAuth } from "../auth-context.jsx";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { Notice, PageHead, Section } from "../components/page-blocks.jsx";
import { matchUniversities, subjectOptions } from "../match-engine.js";
import { logoByShort } from "../logo-map.js";


/**
 * Подбор вуза по обезличенным официальным итогам грантов 2026–2027.
 *
 * По нажатию «Подобрать вузы» matchUniversities() фильтрует
 * группы программ по профильной паре, сравнивает балл с центральным
 * диапазоном результатов и раскладывает результат по трём группам.
 *
 * Это ОЦЕНКА, а не гарантия — см. оговорку вверху страницы.
 */

const ACCESS_COPY = {
  ru: {
    standalone: "Отдельная услуга",
    title: "Подбор вуза",
    price: "3 000 ₸",
    text:
      "Персональный подбор подходящих вузов и образовательных программ по вашим данным.",
    included:
      "При оплате организационного платежа 10 000 ₸ за участие в конкурсе QazEducation подбор вуза предоставляется бесплатно.",
    loginText:
      "Чтобы оплатить подбор или воспользоваться бесплатным доступом после оплаты участия, войдите в аккаунт.",
    login: "Войти",
    payTitle: "Kaspi QR через ApiPay.kz",
    payText: "Создайте Kaspi QR на 3 000 ₸ и отсканируйте его в приложении Kaspi.kz.",
    payAction: "Создать Kaspi QR",
    pending: "Отсканируйте QR в Kaspi.kz — доступ откроется автоматически после подтверждения оплаты.",
    openKaspi: "Открыть в Kaspi.kz",
    paymentError: "Не удалось создать Kaspi QR. Попробуйте позже.",
    paidMatch: "Подбор вуза оплачен",
    paidMatchText: "Доступ открыт по отдельной оплате 3 000 ₸.",
    includedTitle: "Подбор вуза включён",
    includedText:
      "Вы оплатили участие в конкурсе QazEducation за 10 000 ₸. Доплачивать 3 000 ₸ за подбор вуза не нужно.",
    accessGranted: "Доступ открыт",
    loading: "Проверяем доступ…",
  },
  kk: {
    standalone: "Жеке қызмет",
    title: "ЖОО таңдау",
    price: "3 000 ₸",
    text:
      "Сіздің деректеріңіз бойынша сәйкес ЖОО мен білім беру бағдарламаларын жеке іріктеу.",
    included:
      "QazEducation конкурсына қатысу үшін 10 000 ₸ ұйымдастыру төлемін төлеген кезде ЖОО таңдау қызметі тегін беріледі.",
    loginText:
      "ЖОО таңдау қызметін төлеу немесе конкурс төлемінен кейін тегін қолжетімділікті пайдалану үшін аккаунтқа кіріңіз.",
    login: "Кіру",
    payTitle: "ApiPay.kz арқылы Kaspi QR",
    payText: "3 000 ₸ сомасына Kaspi QR жасап, оны Kaspi.kz қосымшасында сканерлеңіз.",
    payAction: "Kaspi QR жасау",
    pending: "QR-кодты Kaspi.kz арқылы сканерлеңіз — төлем расталғаннан кейін қолжетімділік автоматты түрде ашылады.",
    openKaspi: "Kaspi.kz-те ашу",
    paymentError: "Kaspi QR жасау мүмкін болмады. Кейінірек қайталап көріңіз.",
    paidMatch: "ЖОО таңдау қызметі төленген",
    paidMatchText: "3 000 ₸ жеке төлем бойынша қолжетімділік ашылды.",
    includedTitle: "ЖОО таңдау қызметі енгізілген",
    includedText:
      "Сіз QazEducation конкурсына қатысу үшін 10 000 ₸ төледіңіз. ЖОО таңдау үшін қосымша 3 000 ₸ төлеудің қажеті жоқ.",
    accessGranted: "Қолжетімділік ашылды",
    loading: "Қолжетімділікті тексеріп жатырмыз…",
  },
};

const INITIAL_SUBJECT = subjectOptions("ru")[0]?.key || "";

/** Логотип вуза или монограмма-заглушка. */
function UniLogo({ short, size = "h-10 w-10" }) {
  const logo = logoByShort[short];
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className={`${size} shrink-0 rounded-lg bg-white object-contain p-1`}
      />
    );
  }
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-white text-[0.6rem] font-extrabold text-bg`}
    >
      {short}
    </span>
  );
}

/** Одна строка результата: логотип, специальность, вуз, ориентир. */
function ResultRow({ item, ui }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-3.5 last:border-0">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <UniLogo short={item.short} size="h-9 w-9" />
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] leading-tight text-ink">
            {item.spec}
          </span>
          <span className="block truncate text-xs text-muted">
            {item.programCode} · {item.short}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[0.65rem] uppercase tracking-[0.08em] text-muted">
          {ui.referenceLabel}
        </span>
        <span className="mt-1 block font-display font-bold text-ink">
          {item.reference}
        </span>
        <span className="mt-1 block whitespace-nowrap text-[0.68rem] text-muted">
          {ui.minLabel}: {item.min} · {ui.sampleLabel}: {item.count}
        </span>
      </span>
    </li>
  );
}

export default function Match() {
  const lang = useLang();
  const p = pages[lang].match;
  const subjects = subjectOptions(lang);
  const copy = ACCESS_COPY[lang] || ACCESS_COPY.ru;
  const { user } = useAuth();
  const [access, setAccess] = useState({
    loading: true,
    allowed: false,
    source: null,
  });
  const [score, setScore] = useState(105);
  const [subject, setSubject] = useState(INITIAL_SUBJECT);
  const [result, setResult] = useState(null);


  useEffect(() => {
    let active = true;

    if (!user) {
      setAccess({ loading: false, allowed: false, source: null });
      return () => {
        active = false;
      };
    }

    if (!isSupabaseConfigured) {
      setAccess({ loading: false, allowed: false, source: null });
      return () => {
        active = false;
      };
    }

    async function loadAccess() {
      setAccess((current) => ({ ...current, loading: true }));

      const { data, error } = await supabase.rpc("get_own_payment_access");

      if (!active) return;

      if (error) {
        console.warn("Не удалось проверить доступ к подбору вуза:", error.message);
        setAccess({ loading: false, allowed: false, source: null });
        return;
      }

      const hasCompetitionFee = data?.competition_paid === true;
      const hasMatchPayment = data?.match_paid === true;

      setAccess({
        loading: false,
        allowed: hasCompetitionFee || hasMatchPayment,
        source: hasCompetitionFee
          ? "competition_fee"
          : hasMatchPayment
            ? "university_match"
            : null,
      });
    }

    loadAccess();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!access.allowed) return;
    setResult(matchUniversities(score, subject, lang));
  };

  return (
    <>
      <PageHead
        label={p.label}
        title={p.title}
        lead={p.lead}
        photo={media.matchPhoto}
        photoWebp={media.matchPhotoWebp}
        photoAlt={p.photoAlt}
        photoPosition="center 30%"
      />

      <Section>
        <Reveal>
          <Notice {...p.notice} className="mb-10 lg:mb-14" />
        </Reveal>

        <MatchAccessCard
          copy={copy}
          user={user}
          access={access}
          onPaymentConfirmed={(payment) =>
            setAccess({ loading: false, allowed: true, source: payment.payment_type })
          }
        />

        {access.allowed && (
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <form className="grid min-w-0 gap-8 lg:col-span-6" onSubmit={onSubmit}>
              <div className="grid gap-3">
                <label htmlFor="ent-score" className="text-sm font-medium text-ink">
                  {p.scoreLabel}
                </label>
                <output
                  htmlFor="ent-score"
                  className="font-display text-[clamp(3rem,10vw,5.5rem)] font-extrabold leading-none tracking-[-0.05em]"
                >
                  {score}
                </output>
                <input
                  id="ent-score"
                  type="range"
                  min={0}
                  max={140}
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--qz-accent)]"
                />
                <div className="flex justify-between text-sm text-muted">
                  <span>0</span>
                  <span>140</span>
                </div>
              </div>
  
              <Field label={p.subjectsLabel}>
                {(props) => (
                  <select {...props} value={subject} onChange={(e) => setSubject(e.target.value)}>
                    {subjects.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
  
              <SubmitButton className="mt-2 w-full lg:w-auto lg:justify-self-start">
                {p.submit}
              </SubmitButton>
            </form>
  
            <div className="min-w-0 lg:col-span-6">
              <div className="rounded-block border border-line bg-bg-2 p-7 lg:p-9">
                {result ? (
                  <ResultView result={result} score={score} ui={p.ui} />
                ) : (
                  <EmptyState ui={p.ui} />
                )}
              </div>
            </div>
          </div>
        )}

      </Section>
    </>
  );
}


function MatchAccessCard({ copy, user, access, onPaymentConfirmed }) {
  const lang = useLang();
  if (access.loading) {
    return (
      <div className="mb-10 rounded-block border border-line bg-bg-2 p-7 lg:mb-14 lg:p-9">
        <p className="text-sm text-muted">{copy.loading}</p>
      </div>
    );
  }

  if (access.allowed) {
    const included = access.source === "competition_fee";
    return (
      <div className="mb-10 rounded-block border border-accent/40 bg-accent/5 p-7 lg:mb-14 lg:p-9">
        <span className="rounded-full border border-accent/40 px-3 py-1 text-xs uppercase tracking-[0.08em] text-accent">
          {copy.accessGranted}
        </span>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
              {included ? copy.includedTitle : copy.paidMatch}
            </h2>
            <p className="mt-2 max-w-[70ch] text-base leading-relaxed text-ink-2">
              {included ? copy.includedText : copy.paidMatchText}
            </p>
          </div>
          {included && (
            <div className="shrink-0 text-left lg:text-right">
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                {copy.title}
              </p>
              <p className="mt-1 font-display text-xl font-bold text-accent">
                0 ₸
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <div className="mb-10 lg:mb-14">
    <PaymentCheckout lang={lang} paymentType="university_match" onPaymentConfirmed={onPaymentConfirmed} />
  </div>;
}


/** До первого расчёта: подсказка, что делать. */
function EmptyState({ ui }) {
  return (
    <div className="py-6">
      <h2 className="font-display text-lg font-bold tracking-tight">
        {ui.emptyTitle}
      </h2>
      <p className="mt-3 max-w-[40ch] text-base leading-relaxed text-ink-2">
        {ui.emptyText}
      </p>
    </div>
  );
}

/** Результат расчёта. */
function ResultView({ result, score, ui }) {
  const { best, groups, total } = result;

  if (total === 0) {
    return (
      <div className="py-6">
        <h2 className="font-display text-lg font-bold tracking-tight">
          {ui.noneTitle}
        </h2>
        <p className="mt-3 max-w-[40ch] text-base leading-relaxed text-ink-2">
          {ui.noneText}
        </p>
      </div>
    );
  }

  return (
    <Reveal>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-bold tracking-tight">{ui.resultTitle}</h2>
        <span className="text-sm text-muted">{score} {ui.scoreWord} · {total} {ui.matchesWord}</span>
      </div>

      {best && (
        <div className="mt-7 rounded-2xl border border-accent p-5">
          <p className="text-sm uppercase tracking-[0.08em] text-muted">
            {ui.bestLabel}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <UniLogo short={best.short} />
              <span className="min-w-0">
                <span className="block truncate font-display text-base font-bold leading-tight tracking-tight">
                  {best.spec}
                </span>
                <span className="block truncate text-sm text-muted">{best.univ}</span>
                <span className="mt-1 block text-xs text-muted">
                  {best.programCode} · {ui.minLabel}: {best.min} · {ui.sampleLabel}: {best.count}
                </span>
              </span>
            </div>
            <span className="shrink-0 font-display text-2xl font-extrabold text-accent">
              <span className="block text-[0.65rem] uppercase tracking-[0.08em] text-muted">
                {ui.referenceLabel}
              </span>
              <span className="mt-1 block">{best.reference}</span>
            </span>
          </div>
        </div>
      )}

      {["safe", "real", "reach"].map((key) => {
        const list = groups[key];
        if (!list.length) return null;
        const meta = ui.groups[key];
        return (
          <div key={key} className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.08em] text-muted">
                {meta.label}
              </p>
              <p className="text-xs text-muted">{meta.hint}</p>
            </div>
            <ul className="mt-3">
              {list.map((item) => (
                <ResultRow
                  key={item.short + item.spec}
                  item={item}
                  ui={ui}
                />
              ))}
            </ul>
          </div>
        );
      })}

      <p className="mt-6 text-sm text-muted">{ui.limitNote}</p>
    </Reveal>
  );
}
