import Reveal from "./Reveal.jsx";

/**
 * Бегущая лента вузов из образовательного справочника.
 * Логотипы гербов пёстрые, поэтому каждый лежит на белой карточке —
 * так они читаются на тёмном фоне сайта (как на qapps.kz).
 *
 * Файлы логотипов — в public/logos/, путь у каждого вуза в поле
 * logo (content.js). Если у вуза logo нет — карточка покажет
 * монограмму (short) как запасной вариант.
 *
 * Марка бесшовная: список продублирован, сдвиг на -50%.
 * При prefers-reduced-motion анимация стоит, ленту можно листать.
 */
function LogoCard({ uni }) {
  return (
    <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white p-4 sm:h-28 sm:w-44">
      {uni.logo ? (
        <img
          src={uni.logo}
          alt={uni.name}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="text-center">
          <span className="block font-display text-base font-extrabold tracking-tight text-bg">
            {uni.short}
          </span>
          <span className="mt-1 block text-xs text-bg/60">{uni.city}</span>
        </div>
      )}
    </div>
  );
}

export default function Partners({ t }) {
  const list = t.partners.universities;
  const loop = [...list, ...list];

  return (
    <section id="partners" className="border-y border-line bg-bg-2 py-14 lg:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <h2 className="max-w-[22ch] whitespace-pre-line font-display text-[clamp(1.75rem,4.5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            {t.partners.title}
          </h2>
        </Reveal>
      </div>

      <ul className="sr-only">
        {list.map((uni) => (
          <li key={uni.short + uni.name}>{uni.name}</li>
        ))}
      </ul>

      <div className="mx-auto mt-12 max-w-[1400px] px-5 sm:px-8" aria-hidden="true">
        <div className="marquee-mask overflow-hidden rounded-block">
          <div className="flex w-max animate-marquee gap-4 py-1 motion-reduce:animate-none">
            {loop.map((uni, i) => (
              <LogoCard key={uni.short + i} uni={uni} />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <p className="mt-10 max-w-[90ch] text-[0.9375rem] leading-relaxed text-ink-2">
          {t.partners.note}
        </p>
      </div>
    </section>
  );
}
