import Reveal from "./Reveal.jsx";

/**
 * Три строки вместо трёх одинаковых карточек: номер, крупное
 * утверждение, пояснение. Разделители только между строками.
 * < 768px: строка складывается в одну колонку.
 */
export default function Benefits({ t }) {
  return (
    <section id="benefits" className="py-16 lg:py-36">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <h2 className="max-w-[16ch] whitespace-pre-line font-display text-[clamp(2rem,5.5vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
            {t.benefits.title}
          </h2>
        </Reveal>

        <div className="mt-16 border-t border-line">
          {t.benefits.items.map((item, i) => (
            <Reveal key={item.index} delay={i * 0.06}>
              <article className="grid gap-4 border-b border-line py-9 md:grid-cols-12 md:items-baseline md:gap-8 lg:py-12">
                <p className="font-display text-sm font-bold text-accent md:col-span-1">
                  {item.index}
                </p>

                <div className="md:col-span-5">
                  <h3 className="font-display text-2xl font-bold leading-tight tracking-tight lg:text-4xl">
                    {item.lead}
                  </h3>
                  <p className="mt-2 text-sm uppercase tracking-[0.08em] text-muted">
                    {item.name}
                  </p>
                </div>

                <p className="max-w-[46ch] text-base leading-relaxed text-ink-2 md:col-span-6 lg:text-lg">
                  {item.text}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
