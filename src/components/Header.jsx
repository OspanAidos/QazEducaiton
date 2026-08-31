import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { List, X } from "@phosphor-icons/react";
import { Button, Logo } from "./ui.jsx";
import { useAuth } from "../auth-context.jsx";
import { routes } from "../content.js";

/** Адаптивная шапка: полная навигация на десктопе, бургер на телефонах и планшетах. */
export default function Header({ t, lang, onLangChange }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, isAdmin, isCommission } = useAuth();
  const accountTo = isAdmin ? "/admin" : isCommission ? "/commission" : "/profile";
  const accountLabel = isAdmin
    ? t.actions.admin
    : isCommission
      ? t.actions.commission
      : t.actions.account;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => event.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const navLinks = [
    { label: t.nav.about, to: routes.about },
    { label: t.nav.who, to: routes.who },
    { label: t.nav.what, to: routes.what },
    { label: t.nav.moreItems[0].label, to: routes.university },
  ];
  const linkClass =
    "whitespace-nowrap text-[0.9375rem] text-ink-2 transition-colors duration-300 hover:text-ink";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        {t.a11y.skip}
      </a>

      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:h-[72px] sm:gap-5 sm:px-8">
        <Logo className="shrink-0" />

        <nav
          className="hidden flex-1 items-center justify-center gap-5 xl:flex min-[1350px]:gap-8"
          aria-label={t.a11y.primaryNav}
        >
          {navLinks.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => `${linkClass} ${isActive ? "text-ink" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          <LangSwitch t={t} lang={lang} onLangChange={onLangChange} />

          <div className="hidden items-center gap-2 xl:flex">
            {user ? (
              <Button to={accountTo}>{accountLabel}</Button>
            ) : (
              <>
                <Link to={routes.login} className={`${linkClass} px-2`}>
                  {t.actions.login}
                </Link>
                <Button to={routes.apply}>{t.actions.apply}</Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink xl:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={t.a11y.openMenu}
            onClick={() => setMobileOpen(true)}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        t={t}
        lang={lang}
        onLangChange={onLangChange}
        user={user}
        accountTo={accountTo}
        accountLabel={accountLabel}
        pathname={pathname}
      />
    </header>
  );
}

function MobileMenu({
  open,
  onClose,
  t,
  lang,
  onLangChange,
  user,
  accountTo,
  accountLabel,
  pathname,
}) {
  const reduceMotion = useReducedMotion();

  const menu = (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          className="fixed inset-0 z-[60] flex h-[100dvh] w-screen flex-col bg-bg-2 xl:hidden"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label={t.a11y.primaryNav}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 sm:h-[72px] sm:px-8">
            <Logo className="shrink-0" />
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink"
              aria-label={t.a11y.closeMenu}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <nav aria-label={t.a11y.primaryNav}>
              <ul className="divide-y divide-line">
                {t.nav.menuItems.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`block py-3.5 font-display text-lg font-medium transition-colors duration-200 ${
                          active ? "text-accent" : "text-ink hover:text-accent"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="mt-8 grid gap-3">
              {user ? (
                <Button to={accountTo} size="lg" onClick={onClose}>
                  {accountLabel}
                </Button>
              ) : (
                <>
                  <Button to={routes.apply} size="lg" onClick={onClose}>
                    {t.actions.apply}
                  </Button>
                  <Button to={routes.login} variant="outline" size="lg" onClick={onClose}>
                    {t.actions.login}
                  </Button>
                </>
              )}
            </div>

            <div className="mt-8 flex items-center gap-3">
              <span className="text-sm text-muted">{t.a11y.langSwitch}</span>
              <LangSwitch t={t} lang={lang} onLangChange={onLangChange} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(menu, document.body);
}

function LangSwitch({ t, lang, onLangChange }) {
  const options = [
    { code: "ru", label: "RU" },
    { code: "kk", label: "ҚАЗ" },
  ];
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-line"
      role="group"
      aria-label={t.a11y.langSwitch}
    >
      {options.map((option) => {
        const active = lang === option.code;
        return (
          <button
            key={option.code}
            type="button"
            aria-pressed={active}
            onClick={() => onLangChange(option.code)}
            className={`flex h-11 min-w-[38px] items-center justify-center rounded-full px-1.5 text-xs font-medium transition-colors duration-300 sm:min-w-[44px] sm:px-2 ${
              active ? "bg-ink text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
