import { useId } from "react";
import { WarningCircle } from "@phosphor-icons/react";

/**
 * Поля формы. Подпись всегда над полем, подсказка под подписью,
 * ошибка под полем. Плейсхолдер никогда не заменяет подпись.
 * Контраст текста, плейсхолдера и рамки проверен на тёмном фоне.
 */
const fieldBase =
  "w-full rounded-2xl border bg-bg px-4 py-3.5 text-base text-ink placeholder:text-muted " +
  "transition-colors duration-200 focus:border-accent focus:outline-none";

export function Field({ label, hint, error, children }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}

      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? "true" : undefined,
        className: `${fieldBase} ${error ? "border-accent" : "border-line"}`,
      })}

      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm text-accent">
          <WarningCircle size={15} weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ checked, onChange, error, children }) {
  const id = useId();

  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 h-4.5 w-4.5 shrink-0 accent-[var(--qz-accent)]"
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-ink-2">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm text-accent">
          <WarningCircle size={15} weight="fill" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Кнопка отправки: состояния покоя, отправки и блокировки. */
export function SubmitButton({ pending, children, className = "" }) {
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      className={`inline-flex min-h-[52px] items-center justify-center rounded-full bg-accent px-8 text-base font-medium text-on-accent transition-[background-color,box-shadow,color] duration-300 [transform:none] hover:bg-accent-hover active:bg-accent-hover disabled:cursor-progress disabled:opacity-70 ${className}`}
    >
      {pending ? (
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-accent/35 border-t-on-accent"
          />
          Отправляем
        </span>
      ) : (
        children
      )}
    </button>
  );
}
