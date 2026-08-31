import { motion, useReducedMotion } from "motion/react";
import { Button } from "./ui.jsx";
import { media } from "../media.js";
import { routes } from "../content.js";

/**
 * Герой: фото кампуса MNU на фоне, заголовок поверх него.
 * Без эффекта перекрытия — простой фон и текст сверху.
 * Фото приглушено градиентом снизу, чтобы белый текст читался.
 *
 * Путь к фото — в src/media.js (heroBackground).
 */
export default function Hero({ t }) {
  const reduce = useReducedMotion();
  const imgLayer =
    "absolute inset-0 h-full w-full object-cover object-[center_top]";

  return (
    <section id="about" className="px-3 pt-3 sm:px-4">
      <div className="relative overflow-hidden rounded-block">
        {/* 1. фон-фото: WebP с JPG-фолбэком, грузится приоритетно */}
        <picture>
          <source srcSet={media.heroBackgroundWebp} type="image/webp" />
          <img
            src={media.heroBackground}
            alt=""
            className={imgLayer}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        {/* 2. затемнение снизу для читаемости текста */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-bg/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/40 to-transparent" />

        {/* 3. текст — заходит в зону купола */}
        <div className="relative z-10 mx-auto flex min-h-[74vh] max-w-[1400px] flex-col justify-end px-5 pb-10 pt-24 sm:px-8 lg:min-h-[88vh] lg:pb-16">
          <h1 className="max-w-[15ch] font-display text-[clamp(2.25rem,9vw,8rem)] font-extrabold leading-[0.88] tracking-[-0.045em] drop-shadow-[0_2px_30px_rgba(7,20,24,0.55)]">
            {t.hero.titleLines.map((line, i) => (
              <motion.span
                key={line}
                className="block"
                initial={reduce ? false : { opacity: 0, y: "0.2em" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                {line}
              </motion.span>
            ))}
          </h1>

          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-[42ch] text-lg leading-snug text-ink-2 lg:text-xl">
              {t.hero.subtitle}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Button to={routes.apply} size="lg">
                {t.actions.apply}
              </Button>
              <Button to={routes.who} variant="outline" size="lg">
                {t.nav.who}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* строка статистики */}
      <div className="mx-auto mt-3 mb-16 grid max-w-[1400px] gap-3 sm:grid-cols-3 lg:mb-24">
        {t.hero.stats.map((stat) => (
          <div key={stat.label} className="rounded-block border border-line bg-bg-2 px-6 py-7">
            <p className="font-display text-3xl font-extrabold tracking-tight text-accent lg:text-4xl">
              {stat.value}
            </p>
            <p className="mt-2 text-sm leading-snug text-ink-2">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
