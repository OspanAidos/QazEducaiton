import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { Checkbox, Field } from "./form.jsx";
import { legalDocs } from "../legal-docs.js";

const copy = {
  ru: {
    phoneLabel: "Номер телефона",
    phonePlaceholder: "+7 777 123 45 67",
    phoneHint:
      "Введите номер, который привязан к вашему Telegram. Для Узбекистана можно использовать +998.",
    getCode: "Получить код в Telegram",
    sending: "Отправляем код…",
    codeLabel: "Код подтверждения",
    codePlaceholder: "______",
    codeHint:
      "Код отправляет Telegram Gateway. Он может отображаться в системном чате Telegram с кодами подтверждения.",
    verify: "Подтвердить и войти",
    verifying: "Проверяем код…",
    sentTitle: "Код отправлен в Telegram.",
    sentText: (phone) => `Мы отправили код подтверждения на номер ${phone}.`,
    changePhone: "Изменить номер",
    resend: "Отправить код повторно",
    resendIn: (seconds) => `Повторно через ${seconds} с`,
    resent: "Новый код отправлен.",
    invalidPhone: "Проверьте номер телефона и код страны.",
    invalidCode: "Введите код из Telegram.",
    sendError:
      "Не удалось отправить код. Проверьте номер и настройки Telegram Gateway.",
    verifyError: "Код неверный или истёк. Запросите новый код.",
    consentDataError: "Нужно согласие на обработку персональных данных.",
    consentTermsError: "Нужно принять условия программы.",
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
    gatewayNote:
      "Email и пароль участнику не нужны. Этот номер станет логином для QazEducation.",
  },
  kk: {
    phoneLabel: "Телефон нөмірі",
    phonePlaceholder: "+7 777 123 45 67",
    phoneHint:
      "Telegram-ға тіркелген нөмірді енгізіңіз. Өзбекстан нөмірі үшін +998 қолдануға болады.",
    getCode: "Кодты Telegram-ға алу",
    sending: "Код жіберілуде…",
    codeLabel: "Растау коды",
    codePlaceholder: "______",
    codeHint:
      "Код Telegram Gateway арқылы жіберіледі және Telegram-дағы жүйелік растау кодтары чатында көрінуі мүмкін.",
    verify: "Растау және кіру",
    verifying: "Код тексерілуде…",
    sentTitle: "Код Telegram-ға жіберілді.",
    sentText: (phone) => `${phone} нөміріне растау кодын жібердік.`,
    changePhone: "Нөмірді өзгерту",
    resend: "Кодты қайта жіберу",
    resendIn: (seconds) => `${seconds} с кейін қайта жіберу`,
    resent: "Жаңа код жіберілді.",
    invalidPhone: "Телефон нөмірі мен ел кодын тексеріңіз.",
    invalidCode: "Telegram-нан келген кодты енгізіңіз.",
    sendError:
      "Кодты жіберу мүмкін болмады. Нөмір мен Telegram Gateway баптауларын тексеріңіз.",
    verifyError: "Код қате немесе мерзімі өтті. Жаңа код сұраңыз.",
    consentDataError: "Дербес деректерді өңдеуге келісім қажет.",
    consentTermsError: "Бағдарлама шарттарын қабылдау қажет.",
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
    gatewayNote:
      "Қатысушыға email мен құпиясөз қажет емес. Осы нөмір QazEducation жүйесіне кіру үшін қолданылады.",
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

export default function ParticipantPhoneAuth({
  lang = "ru",
  requestPhoneOtp,
  verifyPhoneOtp,
  onVerified,
}) {
  const t = copy[lang] ?? copy.ru;

  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [token, setToken] = useState("");
  const [consentData, setConsentData] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [resendState, setResendState] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    []
  );

  const startCooldown = () => {
    setCooldown(60);

    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const sendCode = async ({ isResend = false } = {}) => {
    const next = {};

    if (!consentData) next.consentData = t.consentDataError;
    if (!consentTerms) next.consentTerms = t.consentTermsError;

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setPending(true);
    setErrors({});
    setResendState(isResend ? "sending" : "");

    try {
      const result = await requestPhoneOtp({ phone, lang });

      if (!result.ok) {
        const invalid = result.error?.message === "INVALID_PHONE";
        setErrors({
          phone: invalid ? t.invalidPhone : t.sendError,
        });
        setResendState("error");
        return;
      }

      setNormalizedPhone(result.phone);
      setStep("code");
      setResendState(isResend ? "sent" : "");
      startCooldown();
    } catch {
      setErrors({ phone: t.sendError });
      setResendState("error");
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();

    if (!/^\d{4,8}$/.test(token.replace(/\D/g, ""))) {
      setErrors({ token: t.invalidCode });
      return;
    }

    setPending(true);
    setErrors({});

    try {
      const result = await verifyPhoneOtp({
        phone: normalizedPhone,
        token,
      });

      if (!result.ok) {
        setErrors({ token: t.verifyError });
        return;
      }

      onVerified?.(result.data);
    } catch {
      setErrors({ token: t.verifyError });
    } finally {
      setPending(false);
    }
  };

  if (step === "code") {
    return (
      <div className="rounded-block border border-accent/40 bg-bg-2 p-6 sm:p-8">
        <CheckCircle size={30} weight="fill" className="text-accent" />

        <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">
          {t.sentTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {t.sentText(normalizedPhone)}
        </p>

        <form onSubmit={verifyCode} className="mt-6 grid gap-5">
          <Field label={t.codeLabel} hint={t.codeHint} error={errors.token}>
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder={t.codePlaceholder}
                value={token}
                onChange={(event) =>
                  setToken(event.target.value.replace(/\D/g, "").slice(0, 8))
                }
                className={`${props.className ?? ""} tracking-[0.35em]`}
              />
            )}
          </Field>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-accent bg-accent px-6 py-3 font-display text-sm font-semibold text-on-accent transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? t.verifying : t.verify}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setToken("");
              setErrors({});
              setResendState("");
            }}
            disabled={pending}
            className="text-sm text-ink-2 underline underline-offset-4 transition hover:text-ink disabled:opacity-50"
          >
            {t.changePhone}
          </button>

          <button
            type="button"
            onClick={() => sendCode({ isResend: true })}
            disabled={pending || cooldown > 0}
            className="inline-flex items-center gap-2 text-sm text-ink-2 underline underline-offset-4 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowClockwise
              size={15}
              className={resendState === "sending" ? "animate-spin" : ""}
            />
            {cooldown > 0 ? t.resendIn(cooldown) : t.resend}
          </button>

          {resendState === "sent" && (
            <span className="text-sm text-accent">{t.resent}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-block border border-accent/40 bg-bg-2 p-6 sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent text-accent">
        <PaperPlaneTilt size={24} weight="fill" />
      </div>

      <div className="mt-6 grid gap-5">
        <Field label={t.phoneLabel} hint={t.phoneHint} error={errors.phone}>
          {(props) => (
            <input
              {...props}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.phonePlaceholder}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4">
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

        <button
          type="button"
          onClick={() => sendCode()}
          disabled={pending}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-accent bg-accent px-6 py-3 font-display text-sm font-semibold text-on-accent transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? t.sending : t.getCode}
        </button>

        <p className="text-xs leading-relaxed text-muted">
          {t.gatewayNote}
        </p>
      </div>
    </div>
  );
}
