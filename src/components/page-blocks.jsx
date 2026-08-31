import Reveal from "./Reveal.jsx";

/** Шапка внутренней страницы: крупный заголовок и лид.
 *  Если передан photo/photoWebp — фото становится фоном за заголовком
 *  (как на главной), с затемняющим градиентом для читаемости текста. */
export function PageHead({ label, title, lead, children, photo, photoWebp, photoAlt, photoPosition = "center 25%" }) {
  const hasPhoto = Boolean(photo);

  if (hasPhoto) {
    return (
      <header className="border-b border-line px-3 pt-3 sm:px-4">
        <div className="relative overflow-hidden rounded-block">
          <picture>
            {photoWebp && <source srcSet={photoWebp} type="image/webp" />}
            <img
              src={photo}
              alt={photoAlt || ""}
              style={{ objectPosition: photoPosition }}
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          {/* затемнение: снизу плотнее, чтобы белый заголовок читался */}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/45 to-transparent" />

          <div className="relative z-10 mx-auto flex min-h-[52vh] max-w-[1400px] flex-col justify-end px-5 pb-10 pt-28 sm:px-8 lg:min-h-[58vh] lg:pb-14 lg:pt-32">
            <h1 className="max-w-[18ch] whitespace-pre-line font-display text-[clamp(2.25rem,6.5vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.045em] drop-shadow-[0_2px_24px_rgba(7,20,24,0.5)]">
              {title}
            </h1>
            {lead && (
              <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-ink-2 lg:text-xl">
                {lead}
              </p>
            )}
            {children}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-[1400px] px-5 pb-14 pt-12 sm:px-8 lg:pb-20 lg:pt-16">
        <h1 className="max-w-[18ch] whitespace-pre-line font-display text-[clamp(2.25rem,6.5vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">
          {title}
        </h1>
        {lead && (
          <p className="mt-8 max-w-[58ch] text-lg leading-relaxed text-ink-2 lg:text-xl">
            {lead}
          </p>
        )}
        {children}
      </div>
    </header>
  );
}

/** Блок оговорки: подводка акцентом, затем сам текст, затем заголовок из документа. */
export function Notice({ id, lead, title, text, className = "" }) {
  return (
    <article
      id={id}
      className={`h-full rounded-block border border-line bg-bg-2 p-7 lg:p-9 ${className}`}
    >
      <h3 className="font-display text-xl font-bold leading-tight tracking-tight text-accent lg:text-2xl">
        {lead}
      </h3>
      <p className="mt-5 text-base leading-relaxed text-ink lg:text-lg">{text}</p>
      <p className="mt-5 text-sm uppercase tracking-[0.08em] text-muted">{title}</p>
    </article>
  );
}

/** Секция страницы с отступами по вертикали. */
export function Section({ children, className = "", ...props }) {
  return (
    <section className={`py-14 lg:py-24 ${className}`} {...props}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionTitle({ children }) {
  return (
    <h2 className="max-w-[20ch] font-display text-[clamp(1.75rem,4vw,3rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
      {children}
    </h2>
  );
}

/** Сетка пронумерованных пунктов. Ровно столько ячеек, сколько пунктов. */
export function NumberedGrid({ items, columns = 2 }) {
  const cols =
    columns === 3 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2";
  const hasOddLastItem = items.length % 2 === 1;

  return (
    <div className={`grid gap-px overflow-hidden rounded-block bg-line ${cols}`}>
      {items.map((item, i) => (
        <Reveal
          key={item.name}
          delay={Math.min(i, 4) * 0.05}
          className={
            hasOddLastItem && i === items.length - 1
              ? columns === 3
                ? "md:col-span-2 lg:col-span-1"
                : "md:col-span-2"
              : ""
          }
        >
          <article className="h-full bg-bg-2 p-7 lg:p-9">
            <p className="font-display text-sm font-bold text-accent">{item.index}</p>
            <h3 className="mt-5 font-display text-xl font-bold leading-tight tracking-tight lg:text-2xl">
              {item.name}
            </h3>
            <p className="mt-3 max-w-[42ch] text-base leading-relaxed text-ink-2">
              {item.text}
            </p>
          </article>
        </Reveal>
      ))}
    </div>
  );
}

/** Список утверждений с тонкими разделителями между строками. */
export function RuleList({ items }) {
  return (
    <ul className="grid gap-0">
      {items.map((item, i) => (
        <li
          key={item}
          className={`flex gap-5 py-5 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <span aria-hidden="true" className="font-display text-sm font-bold text-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="max-w-[62ch] text-base leading-relaxed text-ink-2 lg:text-lg">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Фото на странице: WebP + JPG-фолбэк, фиксированное соотношение,
 *  ленивая загрузка (все они ниже первого экрана). alt обязателен. */
export function PagePhoto({ webp, jpg, alt, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-block border border-line ${className}`}>
      <picture>
        <source srcSet={webp} type="image/webp" />
        <img
          src={jpg}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="aspect-[3/2] w-full object-cover"
        />
      </picture>
    </div>
  );
}
