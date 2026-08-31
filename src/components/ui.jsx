import { Link } from "react-router-dom";

/**
 * Кнопка с текстом-роллапом: при наведении подпись уезжает вверх,
 * а её копия приходит снизу. Приём взят с референса.
 * Копия помечена aria-hidden, скринридер читает подпись один раз.
 */
const sizes = {
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  outline: "border border-line text-ink hover:border-ink",
};

export function Button({
  to,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  // Внутренние переходы идут через роутер, внешние остаются обычной ссылкой
  const Tag = to ? Link : "a";
  const linkProps = to ? { to, ...props } : props;
  // Единый ярлык для скринридера: обе текстовые копии внутри — визуальные.
  const label = typeof children === "string" ? children : undefined;

  return (
    <Tag
      aria-label={label}
      className={`group inline-flex items-center justify-center overflow-hidden rounded-full font-medium transition-colors duration-300 ${sizes[size]} ${variants[variant]} ${className}`}
      {...linkProps}
    >
      <span className="relative block h-[1.25em] overflow-hidden" aria-hidden={label ? "true" : undefined}>
        <span className="block leading-[1.25em] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-full">
          {children}
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 block translate-y-full leading-[1.25em] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0"
        >
          {children}
        </span>
      </span>
    </Tag>
  );
}

export function Logo({ className = "" }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2 font-display text-[0.9375rem] font-bold tracking-tight text-ink ${className}`}
    >
      <img
        src="/logo-mark.png"
        alt=""
        aria-hidden="true"
        className="h-6 w-6 shrink-0 object-contain"
      />
      QazEducation
    </Link>
  );
}
