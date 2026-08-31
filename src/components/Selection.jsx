import Reveal from "./Reveal.jsx";
import { media } from "../media.js";

/**
 * Единственная бегущая строка на странице: принципы отбора.
 * Движение здесь оправдано тем, что список короткий и повторяется,
 * а полоса задаёт ритм между двумя крупными блоками текста.
 * Под prefers-reduced-motion анимация останавливается.
 *
 * Фото заседания комиссии стоит справа от текста (media.committeePhoto).
 */
export default function Selection({ t }) {

  return (
    <section id="transparency" className="border-y border-line bg-bg-2 py-16 lg:py-32">
      <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-6">
          <h2 className="whitespace-pre-line font-display text-[clamp(2rem,5vw,3.75rem)] font-extrabold leading-[1] tracking-[-0.04em]">
            {t.selection.title}
          </h2>
          <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-ink-2">
            {t.selection.text}
          </p>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-6">
          {/* Фото заседания комиссии. WebP + JPG-фолбэк, фиксированное
              соотношение сторон резервирует место, ленивая загрузка.
              Подпись лежит поверх нижнего края с затемнением. */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-block border border-line bg-bg">
            <picture>
              <source srcSet={media.committeePhotoWebp} type="image/webp" />
              <img
                src={media.committeePhoto}
                alt={t.selection.imageAlt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </picture>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-bg/85 via-bg/20 to-transparent"
            />
            <div className="absolute inset-0 flex flex-col items-start justify-end p-6 lg:p-8">
              <p className="font-display text-lg font-bold tracking-tight text-ink">
                {t.selection.imageCaption}
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Список читается скринридером один раз, сама лента скрыта от него */}
      <ul className="sr-only">
        {t.selection.marquee.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div
        className="marquee-mask mt-20 flex overflow-hidden border-y border-line py-5"
        aria-hidden="true"
      >
        {/* Две одинаковые группы: сдвиг на -50% даёт бесшовный цикл */}
        {[0, 1].map((group) => (
          <div
            key={group}
            className="flex shrink-0 animate-marquee items-center gap-10 pr-10"
          >
            {t.selection.marquee.map((item) => (
              <span
                key={item}
                className="flex shrink-0 items-center gap-10 font-display text-xl font-bold tracking-tight lg:text-3xl"
              >
                {item}
                <span className="text-accent">+</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
