import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CaretDown } from "@phosphor-icons/react";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import { supabase } from "../supabase.js";
import ParticipantTelegramBotAuth from "../components/ParticipantTelegramBotAuth.jsx";
import { Field, SubmitButton } from "../components/form.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

const copy = {
  ru: {
    label: "личный кабинет",
    title: "Вход через Telegram.",
    lead:
      "Участники входят через официальный Telegram-бот. Администратор и комиссия используют отдельный служебный вход.",
    serviceTitle: "Служебный вход",
    serviceText: "Только для администратора и членов конкурсной комиссии.",
    email: "Электронная почта",
    password: "Пароль",
    submit: "Войти",
    forgot: "Забыли пароль?",
    credentials: "Неверная почта или пароль.",
    participantOnly:
      "Этот email не является служебным аккаунтом. Участники входят через Telegram.",
  },
  kk: {
    label: "жеке кабинет",
    title: "Telegram арқылы кіру.",
    lead:
      "Қатысушылар ресми Telegram-бот арқылы кіреді. Әкімші мен комиссия үшін бөлек қызметтік кіру бар.",
    serviceTitle: "Қызметтік кіру",
    serviceText: "Тек әкімші және конкурстық комиссия мүшелері үшін.",
    email: "Электрондық пошта",
    password: "Құпиясөз",
    submit: "Кіру",
    forgot: "Құпиясөзді ұмыттыңыз ба?",
    credentials: "Пошта немесе құпиясөз қате.",
    participantOnly:
      "Бұл email қызметтік аккаунт емес. Қатысушылар Telegram арқылы кіреді.",
  },
};

export default function Login() {
  const lang = useLang();
  const t = copy[lang] ?? copy.ru;
  const {
    user,
    completeTelegramBotLogin,
    signIn,
    isAdmin,
    isCommission,
    loading,
  } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);

  if (loading) return null;

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (isCommission) return <Navigate to="/commission" replace />;
    return <Navigate to="/profile" replace />;
  }

  const onServiceSubmit = async (event) => {
    event.preventDefault();

    if (!values.email.trim() || !values.password) {
      setErrors({ form: t.credentials });
      return;
    }

    setPending(true);
    setErrors({});

    try {
      const result = await signIn(values);

      if (!result.ok) {
        setErrors({ form: t.credentials });
        return;
      }

      const {
        data: { user: signedInUser },
      } = await supabase.auth.getUser();

      const [adminRes, commissionRes] = await Promise.all([
        supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", signedInUser?.id)
          .maybeSingle(),
        supabase
          .from("commission_members")
          .select("user_id")
          .eq("user_id", signedInUser?.id)
          .eq("active", true)
          .maybeSingle(),
      ]);

      if (!adminRes.error && adminRes.data) {
        navigate("/admin", { replace: true });
        return;
      }

      if (!commissionRes.error && commissionRes.data) {
        navigate("/commission", { replace: true });
        return;
      }

      await supabase.auth.signOut();
      setErrors({ form: t.participantOnly });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHead label={t.label} title={t.title} lead={t.lead} />

      <Section>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <ParticipantTelegramBotAuth
              lang={lang}
              completeTelegramBotLogin={completeTelegramBotLogin}
              onVerified={() => navigate("/profile", { replace: true })}
            />
          </div>

          <div className="lg:col-span-5">
            <details className="rounded-block border border-line bg-bg-2">
              <summary className="cursor-pointer list-none p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      {t.serviceTitle}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {t.serviceText}
                    </p>
                  </div>
                  <CaretDown size={20} className="shrink-0 text-muted" />
                </div>
              </summary>

              <form
                onSubmit={onServiceSubmit}
                className="grid gap-5 border-t border-line p-6 sm:p-8"
              >
                <Field label={t.email}>
                  {(props) => (
                    <input
                      {...props}
                      type="email"
                      autoComplete="email"
                      value={values.email}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  )}
                </Field>

                <Field label={t.password}>
                  {(props) => (
                    <input
                      {...props}
                      type="password"
                      autoComplete="current-password"
                      value={values.password}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                  )}
                </Field>

                {errors.form && (
                  <p role="alert" className="text-sm text-red-300">
                    {errors.form}
                  </p>
                )}

                <SubmitButton pending={pending}>{t.submit}</SubmitButton>

                <Link
                  to="/reset"
                  className="text-sm text-muted underline underline-offset-4 transition hover:text-ink"
                >
                  {t.forgot}
                </Link>
              </form>
            </details>
          </div>
        </div>
      </Section>
    </>
  );
}
