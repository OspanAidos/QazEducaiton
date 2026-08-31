import Reveal from "./Reveal.jsx";
import { Button } from "./ui.jsx";
import { routes } from "../content.js";

/** Финальный экран: одно утверждение и одно действие. */
export default function Closing({ t }) {
  return (
    <section className="border-t border-line py-16 lg:py-36">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-display text-[clamp(2.5rem,8vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]">
                {t.closing.title}
              </h2>
              <p className="mt-5 text-lg text-ink-2 lg:text-xl">{t.closing.text}</p>
            </div>

            <Button to={routes.apply} size="lg" className="lg:shrink-0">
              {t.actions.apply}
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
