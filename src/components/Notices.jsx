import Reveal from "./Reveal.jsx";

/**
 * Крупные юридические оговорки на главной странице.
 * На мобильных — одна колонка, на desktop — две карточки одинаковой высоты.
 */
export default function Notices({ t }) {
  return (
    <section className="py-16 lg:py-36">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <h2 className="font-display text-[clamp(2rem,5.5vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
            {t.notices.title}
          </h2>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-4 md:grid-cols-2 lg:gap-6">
          {t.notices.items.map((notice, i) => (
            <Reveal key={notice.id} delay={i * 0.08} className="h-full">
              <article
                id={notice.id}
                className="flex h-full min-h-full flex-col rounded-block border border-line bg-bg-2 p-7 lg:p-10"
              >
                <h3 className="font-display text-2xl font-bold leading-tight tracking-tight text-accent lg:text-3xl">
                  {notice.lead}
                </h3>
                <p className="mt-6 text-lg leading-relaxed text-ink">{notice.text}</p>
                <p className="mt-auto pt-6 text-sm uppercase tracking-[0.08em] text-muted">
                  {notice.title}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
