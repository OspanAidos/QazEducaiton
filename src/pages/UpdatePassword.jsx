import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import { Field, SubmitButton } from "../components/form.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

/**
 * Установка нового пароля. Сюда пользователь попадает по ссылке из
 * письма (сброс пароля или подтверждение email): supabase-js по
 * detectSessionInUrl создаёт временную сессию, и updateUser({password})
 * срабатывает. Если сессии нет — ссылка недействительна.
 */
export default function UpdatePassword() {
  const lang = useLang();
  const p = pages[lang].updatePassword;
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(p.errors.password);
      return;
    }
    setError("");
    setPending(true);
    try {
      const result = await updatePassword(password);
      if (result.ok) {
        setDone(true);
      } else {
        // Частая причина — истёкшая или уже использованная ссылка.
        setError(p.errors.link);
      }
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
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="mt-6 text-sm text-ink underline underline-offset-4"
                >
                  {p.loginLink}
                </button>
              </div>
            ) : (
              <form noValidate onSubmit={onSubmit} className="grid gap-6">
                <Field
                  label={p.fields.password.label}
                  hint={p.fields.password.hint}
                  error={error}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                </Field>

                <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
                  {p.submit}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
