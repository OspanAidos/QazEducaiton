import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  Copy,
  PaperPlaneTilt,
  SpinnerGap,
} from "@phosphor-icons/react";
import { Checkbox, Field } from "./form.jsx";
import { legalDocs } from "../legal-docs.js";
import {
  getTelegramBotAuthStatus,
  startTelegramBotAuth,
} from "../telegram-bot-auth.js";

const STORAGE_KEY = "qe_telegram_auth_token";
const STORAGE_STARTED_AT = "qe_telegram_auth_started_at";
const STORAGE_LOGIN_CODE = "qe_telegram_auth_code";
const STORAGE_FIRST_NAME = "qe_registration_first_name";
const STORAGE_LAST_NAME = "qe_registration_last_name";

function validRealName(value) {
  const normalized = value.trim();
  return normalized.length >= 2 &&
    normalized.length <= 80 &&
    /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(normalized);
}

const copy = {
  ru: {
    title: "Войти через Telegram",
    lead:
      "Без SMS и платных кодов. Сайт создаст короткий код — отправьте его официальному боту QazEducation.",
    firstTime:
      "При первом входе бот один раз попросит поделиться вашим номером телефона. Это нужно, чтобы связать Telegram с вашим личным кабинетом.",
    nextTime:
      "При следующих входах номер повторно отправлять не нужно.",
    start: "Получить код для Telegram",
    starting: "Создаём безопасный код…",
    waitingTitle: "Подтвердите вход в Telegram",
    codeTitle: "Ваш код входа",
    codeHint:
      "Откройте @QazEducationBot в Telegram, нажмите Start и отправьте этот код одним сообщением.",
    manualHint:
      "Если Telegram не открывается по кнопке на компьютере, просто откройте Telegram на телефоне или компьютере, найдите @QazEducationBot и отправьте код вручную.",
    awaitingContact: "Бот ждёт, когда вы поделитесь своим номером телефона.",
    approved: "Telegram подтверждён. Выполняем вход…",
    openBot: "Открыть @QazEducationBot",
    copyCode: "Скопировать код",
    copied: "Код скопирован",
    checkAgain: "Проверить подтверждение",
    expired: "Код входа истёк. Создайте новый.",
    failed: "Не удалось выполнить вход через Telegram. Попробуйте ещё раз.",
    notConfigured:
      "Локальное подключение не настроено. Восстановите файл .env.local и перезапустите сайт.",
    unavailable:
      "Сервис входа временно недоступен. Повторите попытку позже или сообщите поддержке код QE-AUTH-01.",
    consentDataError: "Нужно согласие на обработку персональных данных.",
    consentTermsError: "Нужно принять условия программы.",
    identityTitle: "Ваши настоящие данные",
    identityHint: "Укажите имя и фамилию как в документе. Имя или никнейм из Telegram использоваться не будут.",
    firstName: "Имя",
    lastName: "Фамилия",
    firstNameError: "Введите настоящее имя (от 2 до 80 букв).",
    lastNameError: "Введите настоящую фамилию (от 2 до 80 букв).",
    consentData: {
      pre: "Я ознакомился(ась) и согласен(на) с документом: ",
      docs: ["soglasie"],
      post: ".",
    },
    consentTerms: {
      pre: "Я ознакомился(ась) и принимаю: ",
      docs: ["oferta", "programma", "otbor", "metodika"],
      post: ".",
    },
    security:
      "Код действует 5 минут и используется один раз. Пароль от сайта не нужен.",
  },
  kk: {
    title: "Telegram арқылы кіру",
    lead:
      "SMS және ақылы кодтарсыз. Сайт қысқа код жасайды — оны QazEducation ресми ботына жіберіңіз.",
    firstTime:
      "Алғашқы кіру кезінде бот телефон нөміріңізді бір рет бөлісуді сұрайды. Бұл Telegram-ды жеке кабинетпен байланыстыру үшін қажет.",
    nextTime:
      "Келесі кірулерде нөмірді қайта жіберу қажет емес.",
    start: "Telegram үшін код алу",
    starting: "Қауіпсіз код жасалуда…",
    waitingTitle: "Telegram-да кіруді растаңыз",
    codeTitle: "Кіру коды",
    codeHint:
      "Telegram-да @QazEducationBot ашып, Start басыңыз және осы кодты бір хабарлама ретінде жіберіңіз.",
    manualHint:
      "Егер компьютерде Telegram батырма арқылы ашылмаса, Telegram-ды телефоннан немесе компьютерден ашып, @QazEducationBot тауып, кодты қолмен жіберіңіз.",
    awaitingContact: "Бот телефон нөміріңізді бөлісуді күтіп тұр.",
    approved: "Telegram расталды. Жүйеге кіріп жатырмыз…",
    openBot: "@QazEducationBot ашу",
    copyCode: "Кодты көшіру",
    copied: "Код көшірілді",
    checkAgain: "Растауды тексеру",
    expired: "Кіру кодының мерзімі өтті. Жаңасын жасаңыз.",
    failed: "Telegram арқылы кіру мүмкін болмады. Қайта көріңіз.",
    notConfigured:
      "Жергілікті қосылым бапталмаған. .env.local файлын қалпына келтіріп, сайтты қайта іске қосыңыз.",
    unavailable:
      "Кіру сервисі уақытша қолжетімсіз. Кейінірек қайталаңыз немесе қолдау қызметіне QE-AUTH-01 кодын хабарлаңыз.",
    consentDataError: "Дербес деректерді өңдеуге келісім қажет.",
    consentTermsError: "Бағдарлама шарттарын қабылдау қажет.",
    identityTitle: "Нақты деректеріңіз",
    identityHint: "Құжаттағы аты-жөніңізді көрсетіңіз. Telegram-дағы ат немесе никнейм пайдаланылмайды.",
    firstName: "Аты",
    lastName: "Тегі",
    firstNameError: "Нақты атыңызды енгізіңіз (2–80 әріп).",
    lastNameError: "Нақты тегіңізді енгізіңіз (2–80 әріп).",
    consentData: {
      pre: "Мен келесі құжатпен таныстым және келісемін: ",
      docs: ["soglasie"],
      post: ".",
    },
    consentTerms: {
      pre: "Мен таныстым және қабылдаймын: ",
      docs: ["oferta", "programma", "otbor", "metodika"],
      post: ".",
    },
    security:
      "Код 5 минут жарамды және бір рет қолданылады. Сайт құпиясөзі қажет емес.",
  },
};

function ConsentText({ consent }) {
  return (
    <span>
      {consent.pre}
      {consent.docs.map((key, index) => (
        <span key={key}>
          {index > 0 && (index === consent.docs.length - 1 ? " и " : ", ")}
          <a
            href={legalDocs[key].path}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline underline-offset-4 hover:text-accent"
          >
            «{legalDocs[key].short}»
          </a>
        </span>
      ))}
      {consent.post}
    </span>
  );
}

export default function ParticipantTelegramBotAuth({
  lang = "ru",
  requireConsents = false,
  completeTelegramBotLogin,
  onVerified,
}) {
  const t = copy[lang] ?? copy.ru;

  const [state, setState] = useState("idle");
  const [loginToken, setLoginToken] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [botUrl, setBotUrl] = useState("https://t.me/QazEducationBot");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [errors, setErrors] = useState({});
  const pollRef = useRef(null);
  const finishingRef = useRef(false);

  const clearPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const clearStoredLogin = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_STARTED_AT);
    sessionStorage.removeItem(STORAGE_LOGIN_CODE);
    sessionStorage.removeItem(STORAGE_FIRST_NAME);
    sessionStorage.removeItem(STORAGE_LAST_NAME);
  };

  const finish = async (tokenHash) => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    setState("finishing");
    setMessage(t.approved);

    try {
      const result = await completeTelegramBotLogin(tokenHash, {
        recordRegistrationConsents: requireConsents,
        profileNames: requireConsents
          ? {
              firstName: sessionStorage.getItem(STORAGE_FIRST_NAME) || firstName,
              lastName: sessionStorage.getItem(STORAGE_LAST_NAME) || lastName,
            }
          : undefined,
      });

      if (!result.ok) {
        setState("error");
        setMessage(t.failed);
        finishingRef.current = false;
        return;
      }

      clearPolling();
      clearStoredLogin();
      onVerified?.(result.data);
    } catch (error) {
      console.error("finish telegram bot login:", error);
      setState("error");
      setMessage(t.failed);
      finishingRef.current = false;
    }
  };

  const checkStatus = async (token = loginToken) => {
    if (!token || finishingRef.current) return;

    const result = await getTelegramBotAuthStatus(token);

    if (!result.ok) {
      setState("error");
      setMessage(t.failed);
      clearPolling();
      return;
    }

    if (result.status === "approved" && result.token_hash) {
      await finish(result.token_hash);
      return;
    }

    if (result.status === "awaiting_contact") {
      setState("awaiting_contact");
      setMessage(t.awaitingContact);
      return;
    }

    if (result.status === "expired") {
      setState("expired");
      setMessage(t.expired);
      clearStoredLogin();
      clearPolling();
      return;
    }

    if (result.status === "failed") {
      setState("error");
      setMessage(result.message || t.failed);
      clearPolling();
      return;
    }

    setState("waiting");
  };

  const beginPolling = (token) => {
    clearPolling();

    pollRef.current = window.setInterval(() => {
      void checkStatus(token);
    }, 2000);
  };

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const storedCode = sessionStorage.getItem(STORAGE_LOGIN_CODE) || "";
    const storedFirstName = sessionStorage.getItem(STORAGE_FIRST_NAME) || "";
    const storedLastName = sessionStorage.getItem(STORAGE_LAST_NAME) || "";
    const startedAt = Number(sessionStorage.getItem(STORAGE_STARTED_AT) || 0);

    setFirstName(storedFirstName);
    setLastName(storedLastName);

    if (stored && storedCode && startedAt && Date.now() - startedAt < 5 * 60 * 1000) {
      setLoginToken(stored);
      setLoginCode(storedCode);
      setState("waiting");
      beginPolling(stored);
      void checkStatus(stored);
    } else {
      clearStoredLogin();
    }

    return clearPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    const nextErrors = {};

    if (requireConsents && !validRealName(firstName)) {
      nextErrors.firstName = t.firstNameError;
    }

    if (requireConsents && !validRealName(lastName)) {
      nextErrors.lastName = t.lastNameError;
    }

    if (requireConsents && !consentData) {
      nextErrors.consentData = t.consentDataError;
    }

    if (requireConsents && !consentTerms) {
      nextErrors.consentTerms = t.consentTermsError;
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setCopied(false);
    setState("starting");

    try {
      const result = await startTelegramBotAuth(lang);

      if (!result.ok || !result.loginCode) {
        setState("error");
        setMessage(
          result.errorCode === "SUPABASE_NOT_CONFIGURED"
            ? t.notConfigured
            : t.unavailable
        );
        return;
      }

      setLoginToken(result.token);
      setLoginCode(result.loginCode);
      setBotUrl(result.botUrl || "https://t.me/QazEducationBot");
      setState("waiting");

      sessionStorage.setItem(STORAGE_KEY, result.token);
      sessionStorage.setItem(STORAGE_STARTED_AT, String(Date.now()));
      sessionStorage.setItem(STORAGE_LOGIN_CODE, result.loginCode);
      if (requireConsents) {
        sessionStorage.setItem(STORAGE_FIRST_NAME, firstName.trim());
        sessionStorage.setItem(STORAGE_LAST_NAME, lastName.trim());
      }

      beginPolling(result.token);
      window.setTimeout(() => void checkStatus(result.token), 1000);
    } catch (error) {
      console.error("start telegram bot auth:", error);
      setState("error");
      setMessage(t.failed);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(loginCode.replace("-", ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    clearPolling();
    clearStoredLogin();
    finishingRef.current = false;
    setLoginToken("");
    setLoginCode("");
    setMessage("");
    setCopied(false);
    setState("idle");
  };

  const waiting = ["waiting", "awaiting_contact", "finishing"].includes(state);

  return (
    <div className="rounded-block border border-accent/40 bg-bg-2 p-6 sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent text-accent">
        <PaperPlaneTilt size={24} weight="fill" />
      </div>

      <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">
        {t.title}
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.lead}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t.firstTime}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t.nextTime}</p>

      {requireConsents && state === "idle" && (
        <div className="mt-6 grid gap-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{t.identityTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.identityHint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.firstName} error={errors.firstName}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoComplete="given-name"
                  maxLength={80}
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (errors.firstName) setErrors((current) => ({ ...current, firstName: "" }));
                  }}
                />
              )}
            </Field>

            <Field label={t.lastName} error={errors.lastName}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoComplete="family-name"
                  maxLength={80}
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (errors.lastName) setErrors((current) => ({ ...current, lastName: "" }));
                  }}
                />
              )}
            </Field>
          </div>

          <Checkbox
            checked={consentData}
            onChange={setConsentData}
            error={errors.consentData}
          >
            <ConsentText consent={t.consentData} />
          </Checkbox>

          <Checkbox
            checked={consentTerms}
            onChange={setConsentTerms}
            error={errors.consentTerms}
          >
            <ConsentText consent={t.consentTerms} />
          </Checkbox>
        </div>
      )}

      {state === "idle" && (
        <button
          type="button"
          onClick={start}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 font-display text-sm font-semibold text-on-accent transition hover:opacity-90"
        >
          <PaperPlaneTilt size={18} weight="fill" />
          {t.start}
        </button>
      )}

      {state === "starting" && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line p-4 text-sm text-ink-2">
          <SpinnerGap size={20} className="animate-spin text-accent" />
          {t.starting}
        </div>
      )}

      {waiting && loginCode && (
        <div className="mt-6 rounded-2xl border border-line p-5">
          <div className="flex items-start gap-3">
            {state === "finishing" ? (
              <CheckCircle size={24} weight="fill" className="mt-0.5 text-accent" />
            ) : (
              <SpinnerGap size={22} className="mt-0.5 animate-spin text-accent" />
            )}

            <div className="min-w-0 flex-1">
              <h3 className="font-display font-semibold text-ink">
                {state === "finishing" ? t.approved : t.waitingTitle}
              </h3>

              {state !== "finishing" && (
                <>
                  <p className="mt-3 text-sm text-muted">{t.codeTitle}</p>

                  <div className="mt-2 rounded-2xl border border-accent/40 bg-bg px-4 py-4 text-center">
                    <div className="font-mono text-2xl font-bold tracking-[0.18em] text-ink sm:text-3xl">
                      {loginCode}
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-ink-2">
                    {state === "awaiting_contact" ? t.awaitingContact : t.codeHint}
                  </p>

                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    {t.manualHint}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={botUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-accent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
                    >
                      <PaperPlaneTilt size={16} />
                      {t.openBot}
                    </a>

                    <button
                      type="button"
                      onClick={copyCode}
                      className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-2 transition hover:border-accent hover:text-ink"
                    >
                      <Copy size={16} />
                      {copied ? t.copied : t.copyCode}
                    </button>

                    <button
                      type="button"
                      onClick={() => checkStatus()}
                      className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-2 transition hover:border-accent hover:text-ink"
                    >
                      <ArrowClockwise size={16} />
                      {t.checkAgain}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {(state === "expired" || state === "error") && (
        <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-400/5 p-5">
          <p className="text-sm leading-relaxed text-red-200">
            {message || t.failed}
          </p>

          <button
            type="button"
            onClick={reset}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-2 transition hover:border-accent hover:text-ink"
          >
            <ArrowClockwise size={16} />
            {t.start}
          </button>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted">{t.security}</p>
    </div>
  );
}
