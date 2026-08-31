import { Link } from "react-router-dom";
import { Logo } from "./ui.jsx";
import { legalDocs, LEGAL_ORDER } from "../legal-docs.js";

/**
 * Подвал QazEducation.
 *
 * Ссылка на текущий сайт намеренно не дублируется в контактах:
 * пользователь уже находится на qazeducation.kz.
 */
export default function Footer({ t }) {
  const c = t.footer.contacts;
  const contactItems = [c.support, c.whatsapp, c.instagram].filter(Boolean);

  return (
    <footer className="border-t border-line bg-bg-2">
      <div className="mx-auto max-w-[1400px] px-5 py-12 sm:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-12 md:gap-12">
          <div className="min-w-0 md:col-span-4">
            <Logo />

            <p className="mt-5 max-w-[40ch] text-[0.9375rem] leading-relaxed text-ink-2">
              {t.footer.about}
            </p>

            <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
              {t.footer.organizer}
            </p>
          </div>

          <div className="grid min-w-0 gap-8 sm:grid-cols-2 md:col-span-8 lg:grid-cols-3 lg:gap-10">
            {t.footer.columns.map((column) => (
              <nav key={column.title} aria-label={column.title} className="min-w-0">
                <h2 className="text-sm uppercase tracking-[0.08em] text-muted">
                  {column.title}
                </h2>

                <ul className="mt-5 grid gap-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.href}
                        className="font-display text-base font-medium text-ink transition-colors duration-300 hover:text-accent"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            <div className="min-w-0">
              <h2 className="text-sm uppercase tracking-[0.08em] text-muted">
                {c.title}
              </h2>

              <ul className="mt-5 grid gap-3">
                {contactItems.map((item) => (
                  <li key={item.value} className="grid min-w-0 gap-0.5">
                    <span className="text-xs text-muted">{item.label}</span>
                    <a
                      href={item.href}
                      {...(item.href.startsWith("http")
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                      className="break-words font-display text-base font-medium text-ink transition-colors duration-300 hover:text-accent"
                    >
                      {item.value}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <nav
          aria-label={t.footer.docsTitle}
          className="mt-10 border-t border-line pt-6 lg:mt-12"
        >
          <div className="flex justify-center">
            <ul className="flex min-w-0 flex-wrap justify-center gap-x-5 gap-y-2 text-center">
              {LEGAL_ORDER.map((key) => (
                <li key={key} className="min-w-0">
                  <Link
                    to={legalDocs[key].path}
                    className="text-[0.8125rem] font-normal leading-5 text-ink-2 transition-colors duration-300 hover:text-accent"
                  >
                    {legalDocs[key].short}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-6 text-xs leading-relaxed text-muted sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-[90ch]">{t.footer.disclaimer}</p>
          <p className="shrink-0">{t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
