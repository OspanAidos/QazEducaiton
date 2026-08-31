import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import { Field, SubmitButton } from "../components/form.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

/** Запрос ссылки на сброс пароля по email. */
export default function ResetPassword() {
  const lang = useLang();
  const p = pages[lang].reset;
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(p.errors.email);
      return;
    }
    setError("");
    setPending(true);
    try {
      // Отправляем всегда с одинаковым итогом, не раскрывая,
      // существует ли аккаунт с таким адресом.
      await resetPassword(email);
      setDone(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            {done ? (
              <div className="rounded-block border border-line bg-bg-2 p-8 lg:p-10">
                <CheckCircle size={30} weight="fill" aria-hidden="true" className="text-accent" />
                <h2 className="mt-5 font-display text-2xl font-bold tracking-tight lg:text-3xl">
                  {p.success.title}
                </h2>
                <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-ink-2">
                  {p.success.text}
                </p>
                <p className="mt-6 text-sm text-muted">
                  <Link to="/login" className="text-ink underline underline-offset-4">
                    {p.backLink}
                  </Link>
                </p>
              </div>
            ) : (
              <form noValidate onSubmit={onSubmit} className="grid gap-6">
                <Field label={p.fields.email.label} error={error}>
                  {(props) => (
                    <input
                      {...props}
                      type="email"
                      autoComplete="email"
                      placeholder={p.fields.email.placeholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </Field>

                <div className="mt-2 grid gap-5">
                  <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
                    {p.submit}
                  </SubmitButton>
                  <p className="text-sm text-muted">
                    {p.backHint}{" "}
                    <Link to="/login" className="text-ink underline underline-offset-4">
                      {p.backLink}
                    </Link>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
