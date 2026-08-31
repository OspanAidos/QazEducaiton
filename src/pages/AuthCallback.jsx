import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

const copy = {
  ru: {
    label: "вход через Telegram",
    title: "Завершаем вход…",
    working: "Получаем подтверждённые данные Telegram и создаём сессию QazEducation.",
    successTitle: "Telegram подключён.",
    successText: "Перенаправляем вас в личный кабинет.",
    phoneTitle: "Нужен номер телефона.",
    phoneText:
      "Для регистрации в QazEducation необходимо разрешить Telegram передать подтверждённый номер телефона. Выйдите и повторите вход, разрешив доступ к номеру.",
    errorTitle: "Не удалось завершить вход.",
    errorText: "Повторите вход через Telegram.",
    retry: "Вернуться ко входу",
  },
  kk: {
    label: "Telegram арқылы кіру",
    title: "Кіруді аяқтап жатырмыз…",
    working: "Telegram-ның расталған деректерін алып, QazEducation сессиясын жасап жатырмыз.",
    successTitle: "Telegram қосылды.",
    successText: "Жеке кабинетке бағыттап жатырмыз.",
    phoneTitle: "Телефон нөмірі қажет.",
    phoneText:
      "QazEducation-ға тіркелу үшін Telegram-ға расталған телефон нөмірін беруге рұқсат ету керек. Шығып, нөмірге рұқсат беріп қайта кіріңіз.",
    errorTitle: "Кіруді аяқтау мүмкін болмады.",
    errorText: "Telegram арқылы қайта кіріп көріңіз.",
    retry: "Кіруге оралу",
  },
};

export default function AuthCallback() {
  const lang = useLang();
  const t = copy[lang] ?? copy.ru;
  const {
    user,
    loading,
    isAdmin,
    isCommission,
    telegramPhoneMissing,
  } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState("working");

  useEffect(() => {
    if (loading) return undefined;

    if (user) {
      if (isAdmin) {
        navigate("/admin", { replace: true });
        return undefined;
      }

      if (isCommission) {
        navigate("/commission", { replace: true });
        return undefined;
      }

      if (telegramPhoneMissing) {
        setStatus("phone");
        return undefined;
      }

      setStatus("success");
      const timer = window.setTimeout(
        () => navigate("/profile", { replace: true }),
        900
      );
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setStatus((current) => (current === "working" ? "error" : current));
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [
    user,
    loading,
    isAdmin,
    isCommission,
    telegramPhoneMissing,
    navigate,
  ]);

  return (
    <>
      <PageHead label={t.label} title={t.title} />

      <Section>
        <div className="max-w-2xl">
          <div
            role="status"
            aria-live="polite"
            className="rounded-block border border-line bg-bg-2 p-8 lg:p-10"
          >
            {status === "working" && (
              <>
                <CircleNotch
                  size={30}
                  className="animate-spin text-ink-2 motion-reduce:animate-none"
                />
                <p className="mt-5 text-base leading-relaxed text-ink-2">
                  {t.working}
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle size={30} weight="fill" className="text-accent" />
                <h2 className="mt-5 font-display text-2xl font-bold text-ink">
                  {t.successTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-ink-2">
                  {t.successText}
                </p>
              </>
            )}

            {status === "phone" && (
              <>
                <WarningCircle size={30} weight="fill" className="text-red-300" />
                <h2 className="mt-5 font-display text-2xl font-bold text-ink">
                  {t.phoneTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-ink-2">
                  {t.phoneText}
                </p>
                <Link
                  to="/profile"
                  className="mt-6 inline-flex rounded-full border border-line px-5 py-2.5 text-sm text-ink transition hover:border-accent hover:text-accent"
                >
                  {t.retry}
                </Link>
              </>
            )}

            {status === "error" && (
              <>
                <WarningCircle size={30} weight="fill" className="text-red-300" />
                <h2 className="mt-5 font-display text-2xl font-bold text-ink">
                  {t.errorTitle}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-ink-2">
                  {t.errorText}
                </p>
                <Link
                  to="/login"
                  className="mt-6 inline-flex rounded-full border border-line px-5 py-2.5 text-sm text-ink transition hover:border-accent hover:text-accent"
                >
                  {t.retry}
                </Link>
              </>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
