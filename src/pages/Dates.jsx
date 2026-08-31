import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { Notice, PageHead, Section } from "../components/page-blocks.jsx";


export default function Dates() {
  const lang = useLang();
  const p = pages[lang].dates;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        {/* Пока дат нет, поэтому строки одинаковые: статус вынесен в чип справа */}
        <ol className="border-t border-line">
          {p.rows.map((row, i) => (
            <Reveal key={row} delay={Math.min(i, 5) * 0.04}>
              <li className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-6">
                <span className="flex items-baseline gap-5">
                  <span
                    aria-hidden="true"
                    className="font-display text-sm font-bold text-accent"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-lg font-bold tracking-tight lg:text-2xl">
                    {row}
                  </span>
                </span>
                <span className="rounded-full border border-line px-4 py-1.5 text-sm text-muted">
                  {p.status}
                </span>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal>
          <div className="mt-12 lg:max-w-[60%]">
            <Notice {...p.notice} />
          </div>
        </Reveal>
      </Section>
    </>
  );
}
