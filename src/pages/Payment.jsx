import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { Notice, PageHead, Section, SectionTitle } from "../components/page-blocks.jsx";
import PaymentCheckout from "../components/PaymentCheckout.jsx";

export default function Payment() {
  const lang = useLang();
  const p = pages[lang].payment;

  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <PaymentCheckout lang={lang} />

        <Reveal>
          <div className="mt-16"><SectionTitle>{p.methodsTitle}</SectionTitle></div>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:max-w-[760px] lg:gap-6">
          {p.methods.map((method, index) => (
            <Reveal key={method.name} delay={index * 0.06}>
              <article className="h-full rounded-block border border-line bg-bg-2 p-7 lg:p-9">
                <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.08em] text-muted">
                  {method.status}
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight">{method.name}</h3>
                <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-ink-2">{method.text}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.08}>
          <article className="mt-6 rounded-block border border-accent/40 bg-accent/5 p-7 lg:p-9">
            <h3 className="font-display text-2xl font-bold tracking-tight text-ink">
              {lang === "kk" ? "ЖОО таңдау қызметі төлемге енгізілген" : "Подбор вуза включён в участие"}
            </h3>
            <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-ink-2">
              {lang === "kk"
                ? "QazEducation конкурсына қатысу үшін 10 000 ₸ ұйымдастыру төлемін төлеген кезде 3 000 ₸ тұратын ЖОО таңдау қызметі қосымша төлемсіз беріледі."
                : "При оплате организационного платежа 10 000 ₸ за участие в конкурсе QazEducation услуга «Подбор вуза» стоимостью 3 000 ₸ предоставляется без дополнительной оплаты."}
            </p>
          </article>
        </Reveal>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5"><SectionTitle>{p.refundTitle}</SectionTitle></Reveal>
          <Reveal delay={0.06} className="lg:col-span-7">
            <p className="max-w-[60ch] text-base leading-relaxed text-ink-2 lg:text-lg">{p.refundText}</p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:gap-6">
          {p.notices.map((notice, index) => (
            <Reveal key={notice.title} delay={index * 0.06}>
              <Notice id={index === 0 ? "payment" : "status"} {...notice} className="h-full" />
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
