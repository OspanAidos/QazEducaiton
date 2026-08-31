import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import ParticipantTelegramBotAuth from "../components/ParticipantTelegramBotAuth.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";
import { isSupabaseConfigured, supabase } from "../supabase.js";

const copy = {
  ru: {
    label: "регистрация участника",
    title: "Регистрация через Telegram.",
    lead:
      "Откройте официальный бот QazEducation и подтвердите вход. При первой привязке бот попросит поделиться номером телефона.",
    closed: "Регистрация на конкурсный цикл 2026 года доступна с 10 августа по 30 сентября включительно.",
    login: "Войти в существующий кабинет",
  },
  kk: {
    label: "қатысушыны тіркеу",
    title: "Telegram арқылы тіркелу.",
    lead:
      "QazEducation ресми ботын ашып, кіруді растаңыз. Алғашқы байланыстыру кезінде бот телефон нөмірін бөлісуді сұрайды.",
    closed: "2026 жылғы конкурс цикліне тіркелу 10 тамыздан 30 қыркүйекке дейін қоса алғанда қолжетімді.",
    login: "Бар кабинетке кіру",
  },
};

export default function Register() {
  const lang = useLang();
  const t = copy[lang] ?? copy.ru;
  const {
    user,
    isAdmin,
    isCommission,
    loading,
    completeTelegramBotLogin,
  } = useAuth();
  const navigate = useNavigate();
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase
      .rpc("get_current_cycle_public_settings", { p_cycle_id: 2026 })
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const now = Date.now();
        setRegistrationOpen(
          data.status === "open" &&
            now >= new Date(data.applications_open_at).getTime() &&
            now <= new Date(data.applications_close_at).getTime()
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return null;

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (isCommission) return <Navigate to="/commission" replace />;
    return <Navigate to="/profile" replace />;
  }

  return (
    <>
      <PageHead label={t.label} title={t.title} lead={t.lead} />

      <Section>
        <div className="max-w-2xl">
          {registrationOpen ? (
            <ParticipantTelegramBotAuth
              lang={lang}
              requireConsents
              completeTelegramBotLogin={completeTelegramBotLogin}
              onVerified={() => navigate("/profile", { replace: true })}
            />
          ) : (
            <div className="rounded-block border border-line bg-bg-2 p-6 sm:p-8">
              <p className="text-base leading-relaxed text-ink-2">{t.closed}</p>
              <Link
                to="/login"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-accent px-6 font-medium text-accent"
              >
                {t.login}
              </Link>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
