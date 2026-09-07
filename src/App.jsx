import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { content } from "./content.js";
import { AuthProvider, useAuth } from "./auth-context.jsx";
import { pages } from "./pages-content.js";
import { LangProvider } from "./lang-context.jsx";
import { isPreviewEnvironment, siteOrigin } from "./environment.js";

import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";

const Home = lazy(() => import("./pages/Home.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Eligibility = lazy(() => import("./pages/Eligibility.jsx"));
const BenefitsPage = lazy(() => import("./pages/BenefitsPage.jsx"));
const Stages = lazy(() => import("./pages/Stages.jsx"));
const Dates = lazy(() => import("./pages/Dates.jsx"));
const Faq = lazy(() => import("./pages/Faq.jsx"));
const Payment = lazy(() => import("./pages/Payment.jsx"));
const Transparency = lazy(() => import("./pages/Transparency.jsx"));
const Documents = lazy(() => import("./pages/Documents.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword.jsx"));
const AuthCallback = lazy(() => import("./pages/AuthCallback.jsx"));
const Match = lazy(() => import("./pages/Match.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Application = lazy(() => import("./pages/Application.jsx"));
const Appeal = lazy(() => import("./pages/Appeal.jsx"));
const Results = lazy(() => import("./pages/Results.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const LegalDoc = lazy(() => import("./pages/LegalDoc.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const Commission = lazy(() => import("./pages/Commission.jsx"));
const CertificateVerify = lazy(() => import("./pages/CertificateVerify.jsx"));

function titleFor(pathname, lang) {
  const set = pages[lang] ?? pages.ru;
  const hit = Object.values(set).find((p) => p.path === pathname);

  if (pathname === "/profile") {
    return lang === "kk"
      ? "Жеке кабинет - QazEducation"
      : "Личный кабинет - QazEducation";
  }
  if (pathname === "/appeal") {
    return lang === "kk"
      ? "Апелляция - QazEducation"
      : "Апелляция - QazEducation";
  }
  if (pathname === "/results") {
    return lang === "kk"
      ? "Конкурс нәтижелері - QazEducation"
      : "Результаты конкурса - QazEducation";
  }
  if (pathname === "/admin") return "Админ-панель - QazEducation";
  if (pathname === "/commission") return "Панель комиссии - QazEducation";
  if (pathname.startsWith("/certificate/")) {
    return lang === "kk"
      ? "Сертификатты тексеру - QazEducation"
      : "Проверка сертификата - QazEducation";
  }

  return hit?.metaTitle ?? "QazEducation - грант, стипендия, Top-30";
}

function RequireParticipant({ children }) {
  const { user, isAdmin, isCommission, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isCommission) return <Navigate to="/commission" replace />;

  return children;
}

function RequireAdmin({ children }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/profile" replace />;

  return children;
}

function RequireCommission({ children }) {
  const { user, isCommission, isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isCommission) {
    return <Navigate to={isAdmin ? "/admin" : "/profile"} replace />;
  }

  return children;
}

/**
 * Служебная кнопка остаётся доступной на ВСЕХ страницах сайта.
 * Поэтому администратор/член комиссии может открыть свою панель,
 * даже если перешёл в "О программе", FAQ, оплату и т.д.
 */
function StaffShortcut() {
  const { user, isAdmin, isCommission, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading || !user || (!isAdmin && !isCommission)) return null;

  const onStaffPanel =
    (isAdmin && pathname === "/admin") ||
    (isCommission && pathname === "/commission");

  // Внутри админки и панели комиссии кнопка «Выйти» находится в шапке,
  // как в личном кабинете участника. На публичных страницах оставляем
  // только компактную кнопку возврата в служебный кабинет.
  if (onStaffPanel) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-2.5rem)] flex-wrap justify-end gap-2">
      {isAdmin && (
        <Link
          to="/admin"
          className="rounded-full border border-accent bg-bg-2/95 px-4 py-2.5 text-sm font-medium text-accent shadow-lg backdrop-blur transition hover:bg-accent hover:text-on-accent"
        >
          Админ-панель
        </Link>
      )}

      {isCommission && (
        <Link
          to="/commission"
          className="rounded-full border border-accent bg-bg-2/95 px-4 py-2.5 text-sm font-medium text-accent shadow-lg backdrop-blur transition hover:bg-accent hover:text-on-accent"
        >
          Панель комиссии
        </Link>
      )}
    </div>
  );
}

function Layout() {
  const [lang, setLang] = useState(() => {
    const saved = window.localStorage.getItem("qazeducation_language");
    return saved === "kk" ? "kk" : "ru";
  });
  const t = content[lang];
  const { pathname } = useLocation();
  const adminWorkspace = pathname === "/admin";

  useEffect(() => {
    document.documentElement.lang = lang === "kk" ? "kk" : "ru";
    window.localStorage.setItem("qazeducation_language", lang);
  }, [lang]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = titleFor(pathname, lang);

    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const absoluteUrl = `${siteOrigin}${pathname === "/" ? "/" : pathname}`;
    canonical?.setAttribute("href", absoluteUrl);
    ogUrl?.setAttribute("content", absoluteUrl);
  }, [pathname, lang]);

  return (
    <LangProvider lang={lang}>
      <div className="min-h-[100dvh] bg-bg">
        {isPreviewEnvironment && (
          <div
            role="status"
            className="bg-accent px-4 py-2 text-center text-sm font-semibold text-on-accent"
          >
            {lang === "kk"
              ? "Алдын ала нұсқа · тек тест деректерін пайдаланыңыз"
              : "Предварительная версия · используйте только тестовые данные"}
          </div>
        )}
        {!adminWorkspace && (
          <Header t={t} lang={lang} onLangChange={setLang} />
        )}
        <StaffShortcut />

        <main id="main" aria-label={t.a11y.main}>
          <Suspense
            fallback={
              <div className="mx-auto min-h-[45vh] max-w-[1400px] px-5 py-16 text-sm text-muted sm:px-8">
                {lang === "kk" ? "Бет жүктелуде…" : "Загружаем страницу…"}
              </div>
            }
          >
          <Routes>
            <Route path="/" element={<Home t={t} />} />
            <Route path="/about" element={<About />} />
            <Route path="/eligibility" element={<Eligibility />} />
            <Route path="/benefits" element={<BenefitsPage />} />
            <Route path="/stages" element={<Stages />} />
            <Route path="/dates" element={<Dates />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/transparency" element={<Transparency />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/match" element={<Match />} />
            <Route path="/results" element={<Results />} />
            <Route path="/certificate/:token" element={<CertificateVerify />} />

            <Route
              path="/profile"
              element={
                <RequireParticipant>
                  <Profile />
                </RequireParticipant>
              }
            />

            <Route
              path="/application"
              element={
                <RequireParticipant>
                  <Application />
                </RequireParticipant>
              }
            />

            <Route
              path="/appeal"
              element={
                <RequireParticipant>
                  <Appeal />
                </RequireParticipant>
              }
            />

            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />

            <Route
              path="/commission"
              element={
                <RequireCommission>
                  <Commission />
                </RequireCommission>
              }
            />

            <Route path="/docs/:slug" element={<LegalDoc />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </main>

        {!adminWorkspace && <Footer t={t} />}
      </div>
    </LangProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout />
    </AuthProvider>
  );
}
